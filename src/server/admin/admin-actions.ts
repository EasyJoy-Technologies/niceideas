import { findReport } from "@/server/db/repos/admin-queue";
import { findPostBySlug } from "@/server/db/repos/posts";
import { closeReportAs, ModerationError, removePost, restorePost, setCommentVisibility, type ModerationRuntime } from "@/server/moderation/admin";
import { SLUG_PATTERN } from "@/server/posts/slug";

export const ADMIN_ACTIONS = ["takedown", "dismiss", "remove-post", "restore-post"] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

const REASON_MAX = 500;

/**
 * One admin form action (audited by the moderation services):
 * `takedown` a report's target (comment → hidden, post → removed) and resolve it;
 * `dismiss` a report; `remove-post` / `restore-post` by slug.
 */
export async function runAdminAction(rt: ModerationRuntime, actorId: string, input: { action: string; target: string; reason: string }): Promise<boolean> {
  const reason = input.reason.trim().slice(0, REASON_MAX);
  if (!reason || !(ADMIN_ACTIONS as readonly string[]).includes(input.action)) return false;
  const op = { actorId, reason };
  try {
    if (input.action === "remove-post" || input.action === "restore-post") {
      if (!SLUG_PATTERN.test(input.target)) return false;
      await (input.action === "remove-post" ? removePost : restorePost)(rt, op, input.target);
      return true;
    }
    const report = await findReport(rt.db, input.target);
    if (!report || report.status !== "open") return false;
    if (input.action === "takedown") {
      if (report.comment_id) await setCommentVisibility(rt.db, op, report.comment_id, "hidden");
      else {
        const post = await rt.db.selectFrom("post").select("slug").where("id", "=", report.post_id).executeTakeFirstOrThrow();
        await removePost(rt, op, post.slug);
      }
    }
    await closeReportAs(rt.db, op, report.id, input.action === "takedown" ? "resolved" : "dismissed");
    return true;
  } catch (err) {
    if (err instanceof ModerationError) return false;
    throw err;
  }
}

/** Slug from a pasted post link or a bare code. */
export function slugFromInput(raw: string): string | null {
  const last = raw.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() ?? "";
  return SLUG_PATTERN.test(last) ? last : null;
}

export { findPostBySlug };
