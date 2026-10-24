import { z } from "zod";
import { sourceDocumentSchema } from "@/server/documents/source-schema";
import { badRequest } from "@/server/http/errors";

/** Request bodies of the NiceNote source API (contract niceideas-share.md §3). */
const nullableText = (max: number) => z.string().max(max).nullable().optional().transform((v) => v ?? null);
const syncMode = z.enum(["follow", "frozen"]);
const commentsMode = z.enum(["open", "signed_in", "closed"]);

export const createShareBody = z.object({
  shareId: z.uuid(),
  userId: z.string().min(1).max(200).regex(/^[\x21-\x7e]+$/),
  region: z.enum(["intl", "cn"]),
  syncMode: syncMode.nullable().optional().transform((v) => v ?? "follow"),
  commentsMode: commentsMode.nullable().optional().transform((v) => v ?? null),
  profile: z.object({ username: nullableText(200), name: nullableText(500), avatarUrl: nullableText(2000) }).nullable().optional().transform((v) => v ?? null),
});

export const pushContentBody = z.object({
  sourceRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  document: sourceDocumentSchema,
  media: z
    .record(z.string().min(1).max(200), z.object({ url: z.string().min(1).max(2000), expiresAt: z.iso.datetime({ offset: true }).optional() }))
    .optional()
    .transform((v) => v ?? {}),
});

export const shareSettingsBody = z.object({ syncMode: syncMode.optional(), commentsMode: commentsMode.nullable().optional() });

export type CreateShareInput = z.infer<typeof createShareBody>;
export type PushContentInput = z.infer<typeof pushContentBody>;
export type ShareSettingsInput = z.infer<typeof shareSettingsBody>;

export function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw badRequest("request.invalid", { issues: r.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), code: i.code })) });
  return r.data;
}
