import { authenticateFirstParty } from "@/server/auth/authenticate";
import { getDb } from "@/server/db";
import { ApiError, badRequest } from "@/server/http/errors";
import { apiRoute } from "@/server/http/api-route";
import { jsonOk } from "@/server/http/json";
import { ingestUpload } from "@/server/media/ingest";
import { mediaLimitsFromConfig } from "@/server/media/limits";
import { toMediaDto } from "@/server/media/media-dto";
import { assertCanUploadMedia } from "@/server/posts/rate-limit";
import { ensureProfile } from "@/server/profiles/ensure-profile";
import { getMediaStores } from "@/server/storage";
import { BodyTooLargeError, removeTempDir, spoolBody } from "@/server/util/temp-file";

const SHA256 = /^[0-9a-f]{64}$/;

/**
 * Upload one media file. Body = raw file bytes (streamed, never buffered);
 * header `X-Content-SHA256` = lowercase hex sha256 of the bytes.
 * Same owner + same hash → returns the existing media (200) without re-upload work.
 */
export const POST = apiRoute("media.upload", async (request) => {
  const principal = await authenticateFirstParty(request);
  const declared = (request.headers.get("x-content-sha256") ?? "").toLowerCase();
  if (!SHA256.test(declared)) throw badRequest("media.sha256_required");
  if (!request.body) throw badRequest("media.empty_body");

  const db = getDb();
  await ensureProfile(db, principal.userId);
  await assertCanUploadMedia(db, principal.userId);
  const limits = mediaLimitsFromConfig();
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  const hardLimit = Math.max(limits.maxImageBytes, limits.maxAudioBytes);
  if (declaredLength > hardLimit) throw new ApiError("media.too_large", 413, { maxBytes: hardLimit });

  let upload;
  try {
    upload = await spoolBody(request.body, hardLimit);
  } catch (err) {
    if (err instanceof BodyTooLargeError) throw new ApiError("media.too_large", 413, { maxBytes: hardLimit });
    throw err;
  }
  try {
    if (upload.bytes === 0) throw badRequest("media.empty_body");
    const { media, created } = await ingestUpload(db, getMediaStores().privateStore, {
      ownerId: principal.userId,
      upload,
      declaredSha256: declared,
      limits,
    });
    return jsonOk({ media: toMediaDto(media) }, created ? 201 : 200);
  } finally {
    await removeTempDir(upload.dir);
  }
});
