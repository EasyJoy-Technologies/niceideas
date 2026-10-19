import { ApiError, badRequest } from "./errors";

/** Default cap for JSON bodies (a 100k-char document is well below this). */
export const MAX_JSON_BYTES = 2 * 1024 * 1024;

/** Reads a JSON body with a hard byte limit (streams; never trusts Content-Length alone). */
export async function readJson(request: Request, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError("request.too_large", 413, { maxBytes });
  if (!request.body) throw badRequest("request.invalid_json");
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
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw badRequest("request.invalid_json");
  }
}
