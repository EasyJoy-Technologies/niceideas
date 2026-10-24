import { spawn } from "node:child_process";

export class ToolError extends Error {
  constructor(
    readonly tool: string,
    readonly code: number | null,
    readonly stderr: string,
    readonly timedOut: boolean,
  ) {
    super(`${tool} ${timedOut ? "timed out" : `exited with ${code}`}: ${stderr.slice(-300)}`);
  }
}

/**
 * Runs a media tool (ffmpeg / ffprobe / magick) without a shell: arguments are passed as-is.
 * Killed (SIGKILL) on timeout or abort; stdout is returned, stderr only kept for errors (last 4 KB).
 */
export function runTool(cmd: string, args: string[], opts: { timeoutMs: number; signal?: AbortSignal }): Promise<string> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new ToolError(cmd, null, "aborted", false));
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (d: Buffer) => {
      if (stdout.length < 1_000_000) stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString("utf8")).slice(-4096);
    });
    const kill = () => child.kill("SIGKILL");
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, opts.timeoutMs);
    opts.signal?.addEventListener("abort", kill, { once: true });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new ToolError(cmd, null, err.message, false));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", kill);
      if (code === 0 && !timedOut) resolve(stdout);
      else reject(new ToolError(cmd, code, stderr, timedOut));
    });
  });
}
