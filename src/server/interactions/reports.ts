import { z } from "zod";
import type { Db } from "@/server/db/client";
import { findComment } from "@/server/db/repos/comments";
import { countReportsByIpSince, insertReport } from "@/server/db/repos/moderation";
import { badRequest, notFound } from "@/server/http/errors";
import { limits, rateLimited } from "./guards";
import { interactivePost } from "./target";
import type { Visitor } from "./visitor";

export const REPORT_REASONS = ["spam", "abuse", "illegal", "other"] as const;

const body = z.object({
  slug: z.string().max(40),
  commentId: z.uuid().optional(),
  reason: z.enum(REPORT_REASONS),
  detail: z.string().max(1000).optional(),
});

/** Report a post or one of its comments (anyone, including anonymous visitors). */
export async function reportContent(db: Db, visitor: Visitor, payload: unknown): Promise<void> {
  const parsed = body.safeParse(payload);
  if (!parsed.success) throw badRequest("request.invalid");
  const input = parsed.data;
  const post = await interactivePost(db, input.slug);
  if (input.commentId) {
    const c = await findComment(db, input.commentId);
    if (!c || c.post_id !== post.id) throw notFound("comment.not_found");
  }
  if ((await countReportsByIpSince(db, visitor.ipHash, 86_400)) >= limits().RATE_IP_REPORTS_PER_DAY) throw rateLimited(86_400);
  await insertReport(db, {
    postId: post.id,
    commentId: input.commentId ?? null,
    reason: input.reason,
    detail: (input.detail ?? "").trim(),
    reporterId: null,
    reporterKey: visitor.key,
    ipHash: visitor.ipHash,
  });
}
