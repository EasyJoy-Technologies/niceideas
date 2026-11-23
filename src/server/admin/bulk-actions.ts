import { randomUUID } from "node:crypto";
import { findComment } from "@/server/db/repos/comments";
import { findPostBySlug } from "@/server/db/repos/posts";
import type { ModerationRuntime } from "@/server/moderation/admin";
import { isNarrower, isVisibility } from "@/server/posts/visibility";
import { COMMENT_ID_PATTERN, runAdminAction } from "./admin-actions";

/** Form `action` of a bulk request from the posts / comments lists (`op` = the per-item action, `targets` = the items). */
export const BULK_ACTION = "bulk";
export const BULK_POST_OPS = ["remove-post", "restore-post", "set-visibility"] as const;
export const BULK_COMMENT_OPS = ["hide-comment", "restore-comment"] as const;
export type BulkOp = (typeof BULK_POST_OPS)[number] | (typeof BULK_COMMENT_OPS)[number];
const BULK_OPS: readonly string[] = [...BULK_POST_OPS, ...BULK_COMMENT_OPS];
/** At most one admin list page (30 rows) is sent; the cap leaves room without allowing unbounded work. */
export const BULK_MAX = 50;

export type BulkResult = { op: BulkOp; done: number; skipped: number; failed: number };
type BulkInput = { op: string; targets: string[]; reason: string; visibility?: string };

export const isBulkOp = (v: string): v is BulkOp => BULK_OPS.includes(v);

/**
 * Whether the action applies to the item in its current state; items it does not apply to are skipped, not failed
 * (a removed post is not removed again, visibility only narrows, only visible comments are hidden). The services
 * check again under their locks where the single-item action does.
 */
async function applies(rt: ModerationRuntime, op: BulkOp, target: string, visibility: string | undefined): Promise<boolean> {
  if (op === "hide-comment" || op === "restore-comment") {
    const comment = COMMENT_ID_PATTERN.test(target) ? await findComment(rt.db, target) : undefined;
    return comment?.status === (op === "hide-comment" ? "visible" : "hidden");
  }
  const post = await findPostBySlug(rt.db, target);
  if (!post) return false;
  if (op === "remove-post") return post.status === "active";
  if (op === "restore-post") return post.status === "removed";
  return post.status === "active" && isVisibility(visibility) && isNarrower(post.visibility, visibility);
}

/**
 * One action on several posts or comments with one reason (plan docs/plan/2026-11-23-admin-bulk.md). Each item goes
 * through the single-item action (admin-actions.ts): its own transaction and audit row; one failing item does not
 * stop the others. `null`: the request itself is invalid (unknown action, no reason, no or too many items).
 */
export async function runBulkAction(rt: ModerationRuntime, actorId: string, input: BulkInput): Promise<BulkResult | null> {
  const targets = [...new Set(input.targets.map((t) => t.trim()).filter(Boolean))];
  if (!isBulkOp(input.op) || !input.reason.trim() || targets.length === 0 || targets.length > BULK_MAX) return null;
  if (input.op === "set-visibility" && !isVisibility(input.visibility)) return null;
  const result: BulkResult = { op: input.op, done: 0, skipped: 0, failed: 0 };
  for (const target of targets) {
    try {
      const ok = (await applies(rt, input.op, target, input.visibility)) && (await runAdminAction(rt, actorId, { action: input.op, target, reason: input.reason, visibility: input.visibility }));
      result[ok ? "done" : "skipped"]++;
    } catch (err) {
      result.failed++;
      console.error(`[admin] bulk item failed errorId=${randomUUID()} op=${input.op}`, err);
    }
  }
  return result;
}
