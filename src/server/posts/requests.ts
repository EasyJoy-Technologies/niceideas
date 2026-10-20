import { z } from "zod";
import { parseDocument } from "@/server/documents/validate";
import { badRequest } from "@/server/http/errors";
import type { PostDocument } from "@/server/documents/schema";
import type { PostSettings } from "./update-settings";

const timestamp = z.iso.datetime({ offset: true });
const sourceRef = z.string().min(1).max(200).regex(/^[\x21-\x7e]+$/);

const createBody = z.object({
  document: z.unknown(),
  sourceRef,
  /** Note `update_time` (ISO 8601); orders pushes from different devices. */
  sourceUpdatedAt: timestamp,
  kind: z.enum(["short", "article"]).optional(),
  syncMode: z.enum(["follow", "frozen"]).optional(),
});

const contentBody = z.object({ document: z.unknown(), sourceUpdatedAt: timestamp });

const settingsBody = z
  .object({
    summary: z.string().max(500).nullable().optional(),
    coverMediaId: z.uuid().nullable().optional(),
    kind: z.enum(["short", "article"]).nullable().optional(),
    syncMode: z.enum(["follow", "frozen"]).optional(),
    commentsMode: z.enum(["open", "signed_in", "closed"]).optional(),
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw badRequest("request.invalid", { issues: r.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), code: i.code })) });
  return r.data;
}

export function parseCreateRequest(input: unknown) {
  const body = parse(createBody, input);
  const document: PostDocument = parseDocument(body.document);
  return { ...body, document, sourceUpdatedAt: new Date(body.sourceUpdatedAt) };
}

export function parseContentRequest(input: unknown) {
  const body = parse(contentBody, input);
  return { document: parseDocument(body.document), sourceUpdatedAt: new Date(body.sourceUpdatedAt) };
}

export function parseSettingsRequest(input: unknown): PostSettings {
  return parse(settingsBody, input);
}
