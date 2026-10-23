import { findComment } from "@/server/db/repos/comments";
import { findReport, openReportsOfTarget } from "@/server/db/repos/admin-queue";
import { findPostBySlug } from "@/server/db/repos/posts";
import { banCommenter, closeReportAs, liftBan, ModerationError, removePost, restorePost, setCommentVisibility, type ModerationRuntime, type Operator } from "@/server/moderation/admin";
import { SLUG_PATTERN } from "@/server/posts/slug";

export const ADMIN_ACTIONS = ["takedown", "dismiss", "remove-post", "restore-post", "hide-comment", "restore-comment", "unban"] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/** Optional ban of the commenter, taken with "hide comment" / "take down". */
export type BanOption = { days: number | null; byIp: boolean } | null;

const REASON_MAX = 500;
const UUID = /^[0-9a-f-]{36}$/i;

/** Hides a comment, banning its author's browser (or network) first when asked. */
async function hideComment(rt: ModerationRuntime, op: Operator, commentId: string, ban: BanOption): Promise<void> {
  if (ban) await banCommenter(rt.db, op, commentId, { byIp: ban.byIp, days: ban.days, hide: true });
  else await setCommentVisibility(rt.db, op, commentId, "hidden");
}

/** Takes down or dismisses a report — all open reports on the same item are closed together. */
async function handleReport(rt: ModerationRuntime, op: Operator, reportId: string, takedown: boolean, ban: BanOption): Promise<boolean> {
  const report = await findReport(rt.db, reportId);
  if (!report || report.status !== "open") return false;
  if (takedown) {
    if (report.comment_id) await hideComment(rt, op, report.comment_id, ban);
    else {
      const post = await rt.db.selectFrom("post").select("slug").where("id", "=", report.post_id).executeTakeFirstOrThrow();
      await removePost(rt, op, post.slug);
    }
  }
  for (const r of await openReportsOfTarget(rt.db, report)) await closeReportAs(rt.db, op, r.id, takedown ? "resolved" : "dismissed");
  return true;
}

/**
 * One admin console action, audited by the moderation services (every action needs a reason):
 * `takedown` / `dismiss` a report (target = report id); `remove-post` / `restore-post` (slug);
 * `hide-comment` / `restore-comment` (comment id); `unban` (`visitor:<hash>` or `ip:<hash>`).
 */
export async function runAdminAction(rt: ModerationRuntime, actorId: string, input: { action: string; target: string; reason: string; ban?: BanOption }): Promise<boolean> {
  const reason = input.reason.trim().slice(0, REASON_MAX);
  if (!reason || !(ADMIN_ACTIONS as readonly string[]).includes(input.action)) return false;
  const op = { actorId, reason };
  const action = input.action as AdminAction;
  try {
    switch (action) {
      case "takedown":
      case "dismiss":
        return await handleReport(rt, op, input.target, action === "takedown", input.ban ?? null);
      case "remove-post":
      case "restore-post":
        if (!SLUG_PATTERN.test(input.target)) return false;
        await (action === "remove-post" ? removePost : restorePost)(rt, op, input.target);
        return true;
      case "hide-comment":
      case "restore-comment":
        if (!UUID.test(input.target) || !(await findComment(rt.db, input.target))) return false;
        if (action === "hide-comment") await hideComment(rt, op, input.target, input.ban ?? null);
        else await setCommentVisibility(rt.db, op, input.target, "visible");
        return true;
      case "unban": {
        const [kind, key] = input.target.split(":");
        if ((kind !== "visitor" && kind !== "ip") || !key) return false;
        return await liftBan(rt.db, op, kind, key);
      }
    }
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
