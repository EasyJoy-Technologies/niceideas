import { z } from "zod";
import type { PostVisibility } from "@/server/db/schema";
import { sourceDocumentSchema } from "@/server/documents/source-schema";
import { badRequest } from "@/server/http/errors";
import { parseSourceApp } from "./source-app";

/** Request bodies of the NiceNote source API (contract niceideas-share.md §3). */
const nullableText = (max: number) => z.string().max(max).nullable().optional().transform((v) => v ?? null);
const syncMode = z.enum(["follow", "frozen"]);
const commentsMode = z.enum(["open", "signed_in", "closed"]);
/** Exact visibility (posts/visibility.ts VISIBILITIES; plan docs/plan/2026-11-23-link-visibility.md §6). */
const audience = z.enum(["public", "link", "followers", "friends", "private"] satisfies [PostVisibility, ...PostVisibility[]]);

/** NiceMatrix user id (Logto `sub`) and the profile data sent with it (§3.2, §10.2). */
const userId = z.string().min(1).max(200).regex(/^[\x21-\x7e]+$/);
const sourceProfile = z.object({ username: nullableText(200), name: nullableText(500), avatarUrl: nullableText(2000) }).nullable().optional().transform((v) => v ?? null);

export const createShareBody = z.object({
  shareId: z.uuid(),
  userId,
  region: z.enum(["intl", "cn"]),
  syncMode: syncMode.nullable().optional().transform((v) => v ?? "follow"),
  commentsMode: commentsMode.nullable().optional().transform((v) => v ?? null),
  profile: sourceProfile,
  /** Missing or invalid → null (no source app recorded); never rejects the request. */
  sourceApp: z.unknown().optional().transform(parseSourceApp),
  /** Who may see the new post (v1.0.94); missing → public. A repeated request never changes it. */
  audience: audience.optional(),
});

/** POST /web-tickets (§10.2). */
export const webTicketBody = z.object({ userId, profile: sourceProfile });

export const pushContentBody = z.object({
  sourceRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  document: sourceDocumentSchema,
  media: z
    .record(z.string().min(1).max(200), z.object({ url: z.string().min(1).max(2000), expiresAt: z.iso.datetime({ offset: true }).optional() }))
    .optional()
    .transform((v) => v ?? {}),
});

/** `audience` (exact, v1.0.94) wins over the legacy `visibility` (public / private) when both are sent. */
export const shareSettingsBody = z.object({
  syncMode: syncMode.optional(),
  commentsMode: commentsMode.nullable().optional(),
  visibility: z.enum(["public", "private"]).optional(),
  audience: audience.optional(),
});

export type CreateShareInput = z.infer<typeof createShareBody>;
export type PushContentInput = z.infer<typeof pushContentBody>;
export type ShareSettingsInput = z.infer<typeof shareSettingsBody>;
export type WebTicketInput = z.infer<typeof webTicketBody>;

export function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw badRequest("request.invalid", { issues: r.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), code: i.code })) });
  return r.data;
}
