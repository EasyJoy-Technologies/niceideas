/** Limits concurrent execution of expensive work (e.g. image decoding) per process. */
export class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }
}
