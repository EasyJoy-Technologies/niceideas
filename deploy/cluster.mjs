// Multi-process launcher for the Next.js standalone server (copied next to server.js on deploy).
// WEB_CONCURRENCY workers share one listening port through node:cluster; a worker that
// dies is replaced (at most once per second). SIGTERM/SIGINT stop all workers.
// WEB_CONCURRENCY=1 runs the server in this process (no idle primary; systemd restarts it).
import cluster from "node:cluster";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workers = Math.max(1, Math.min(Number.parseInt(process.env.WEB_CONCURRENCY ?? "", 10) || 1, os.availableParallelism()));

if (workers === 1 || !cluster.isPrimary) {
  await import(pathToFileURL(path.join(here, "server.js")).href);
} else {
  let stopping = false;
  let lastFork = 0;
  const fork = () => {
    const wait = Math.max(0, lastFork + 1000 - Date.now());
    lastFork = Date.now() + wait;
    setTimeout(() => !stopping && cluster.fork(), wait);
  };
  for (let i = 0; i < workers; i++) cluster.fork();
  console.log(JSON.stringify({ event: "cluster_start", workers }));
  cluster.on("exit", (worker, code, signal) => {
    if (stopping) {
      if (Object.keys(cluster.workers ?? {}).length === 0) process.exit(0);
      return;
    }
    console.error(JSON.stringify({ event: "worker_exit", pid: worker.process.pid, code, signal }));
    fork();
  });
  const stop = (signal) => {
    stopping = true;
    for (const w of Object.values(cluster.workers ?? {})) w?.process.kill(signal);
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}
