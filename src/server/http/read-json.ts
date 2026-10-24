import { ApiError, badRequest } from "./errors";

/** Default cap for JSON bodies (a 100k-char document is well below this). */
export const MAX_JSON_BYTES = 2 * 1024 * 1024;

/** Reads a request body with a hard byte limit (streams; never trusts Content-Length alone). */
export async function readRawBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError("request.too_large", 413, { maxBytes });
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiError("request.too_large", 413, { maxBytes });
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** Parses JSON bytes; malformed or empty → 400 `request.invalid_json`. */
export function parseJsonBytes(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw badRequest("request.invalid_json");
  }
}

/** Reads a JSON body with a hard byte limit. */
export async function readJson(request: Request, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  if (!request.body) throw badRequest("request.invalid_json");
  return parseJsonBytes(await readRawBody(request, maxBytes));
}
