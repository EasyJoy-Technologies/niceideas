import pg from "pg";
import { errorText } from "./retry";

/** NOTIFY channel written by the work-table triggers (migration 0015); the payload is the table name. */
export const WORK_CHANNEL = "niceideas_work";
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;

/**
 * Wakes idle worker loops the moment work is committed: one dedicated connection LISTENs on
 * niceideas_work and resolves the waits of the loop named by the payload. `listening` tells
 * the loops whether to trust it; while it is down they fall back to short polling. Every
 * (re)connect wakes all loops, since notifications sent meanwhile are lost.
 */
export class WorkWakeup {
  private readonly waiters = new Map<string, Set<() => void>>();
  /** Topics woken while their loop was busy: its next wait returns at once. */
  private readonly missed = new Set<string>();
  private client: pg.Client | null = null;
  private closed = false;
  listening = false;

  constructor(private readonly connectionString: string) {}

  /** Connects in the background and keeps reconnecting until `close`. */
  start(signal: AbortSignal): void {
    signal.addEventListener("abort", () => void this.close(), { once: true });
    void this.connectLoop();
  }

  /** Resolves after `ms`, on a notification for `topic`, or when `signal` aborts. */
  wait(topic: string, ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted || this.missed.delete(topic)) return Promise.resolve();
    return new Promise((resolve) => {
      const set = this.waiters.get(topic) ?? new Set<() => void>();
      this.waiters.set(topic, set);
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        set.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener("abort", done, { once: true });
      set.add(done);
    });
  }

  /** Wakes the waits of one topic (all known topics when omitted); remembered while nobody waits. */
  wake(topic?: string): void {
    for (const t of topic === undefined ? [...this.waiters.keys()] : [topic]) {
      const set = this.waiters.get(t);
      if (!set?.size) this.missed.add(t);
      for (const done of [...(set ?? [])]) done();
    }
  }

  private async connectLoop(): Promise<void> {
    let backoff = RECONNECT_MIN_MS;
    while (!this.closed) {
      const started = Date.now();
      const lost = await this.listenOnce();
      if (this.closed) return;
      if (Date.now() - started > RECONNECT_MAX_MS) backoff = RECONNECT_MIN_MS;
      console.warn(JSON.stringify({ event: "worker_listen", result: "lost", error: lost, retryInMs: backoff }));
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
    }
  }

  /** Listens until the connection ends; returns why it ended. */
  private async listenOnce(): Promise<string> {
    const client = new pg.Client({ connectionString: this.connectionString, keepAlive: true, connectionTimeoutMillis: 5_000 });
    this.client = client;
    try {
      const ended = new Promise<string>((resolve) => {
        client.on("error", (err) => resolve(errorText(err)));
        client.on("end", () => resolve("connection ended"));
      });
      client.on("notification", (n) => this.wake(n.payload ?? undefined));
      await client.connect();
      await client.query(`LISTEN ${WORK_CHANNEL}`);
      this.listening = true;
      console.log(JSON.stringify({ event: "worker_listen", result: "listening" }));
      this.wake();
      return await ended;
    } catch (err) {
      return errorText(err);
    } finally {
      this.listening = false;
      this.client = null;
      await client.end().catch(() => undefined);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.listening = false;
    await this.client?.end().catch(() => undefined);
    this.wake();
  }
}
