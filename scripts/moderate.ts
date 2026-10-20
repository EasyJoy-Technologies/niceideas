// Moderation CLI (plan §11, §16.2) — server-side only, every action audited.
// Bundled to dist/moderate.mjs; run with the service environment. All write commands need --actor and --reason.
//
//   reports [--limit N]                       open reports, oldest first
//   comments [--post <slug>] [--limit N]      recent comments (any status)
//   hide-comment|restore-comment|delete-comment <commentId>
//   ban <commentId> [--ip] [--days N] [--keep]  ban the commenter (browser by default); hides the comment unless --keep
//   unban <visitor|ip> <keyHash>
//   comments-mode <slug> <open|signed_in|closed>
//   remove-post <slug> | restore-post <slug>
//   resolve-report|dismiss-report <reportId>
import { getConfig } from "../src/server/config/env";
import { getDb } from "../src/server/db";
import { listRecentComments } from "../src/server/db/repos/comments";
import { listOpenReports } from "../src/server/db/repos/moderation";
import { findPostBySlug } from "../src/server/db/repos/posts";
import * as admin from "../src/server/moderation/admin";
import { getMediaStores } from "../src/server/storage";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : (argv.splice(i, 2)[1] ?? "");
};
const has = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv.splice(i, 1).length === 1;
};
const fail = (msg: string): never => {
  console.error(msg);
  process.exit(2);
};

const actor = flag("actor");
const reason = flag("reason");
const limit = Number(flag("limit") ?? 50);
const post = flag("post");
const days = flag("days");
const byIp = has("ip");
const keep = has("keep");
const [command, a1, a2] = argv;
const op = () => ({ actorId: actor || fail("--actor is required"), reason: reason || fail("--reason is required") });

const cfg = getConfig();
const db = getDb();
const rt = { db, stores: getMediaStores(), cacheControl: cfg.MEDIA_CACHE_CONTROL, retentionDays: cfg.POST_RETENTION_DAYS };
const need = (v: string | undefined, what: string) => v || fail(`missing ${what}`);
try {
  switch (command) {
    case "reports":
      for (const r of await listOpenReports(db, limit)) console.log(JSON.stringify(r));
      break;
    case "comments": {
      const target = post ? await findPostBySlug(db, post) : undefined;
      if (post && !target) fail(`post not found: ${post}`);
      for (const c of await listRecentComments(db, limit, target?.id)) console.log(JSON.stringify(c));
      break;
    }
    case "hide-comment": await admin.setCommentVisibility(db, op(), need(a1, "commentId"), "hidden"); break;
    case "restore-comment": await admin.setCommentVisibility(db, op(), need(a1, "commentId"), "visible"); break;
    case "delete-comment": await admin.setCommentVisibility(db, op(), need(a1, "commentId"), "deleted"); break;
    case "ban": await admin.banCommenter(db, op(), need(a1, "commentId"), { byIp, days: days ? Number(days) : null, hide: !keep }); break;
    case "unban": {
      if (a1 !== "visitor" && a1 !== "ip") fail("unban <visitor|ip> <keyHash>");
      console.log((await admin.liftBan(db, op(), a1 as "visitor" | "ip", need(a2, "keyHash"))) ? "unbanned" : "no such ban");
      break;
    }
    case "comments-mode": {
      if (a2 !== "open" && a2 !== "signed_in" && a2 !== "closed") fail("comments-mode <slug> <open|signed_in|closed>");
      await admin.setCommentsMode(db, op(), need(a1, "slug"), a2 as "open" | "signed_in" | "closed");
      break;
    }
    case "remove-post": await admin.removePost(rt, op(), need(a1, "slug")); break;
    case "restore-post": await admin.restorePost(rt, op(), need(a1, "slug")); break;
    case "resolve-report": await admin.closeReportAs(db, op(), need(a1, "reportId"), "resolved"); break;
    case "dismiss-report": await admin.closeReportAs(db, op(), need(a1, "reportId"), "dismissed"); break;
    default: fail("usage: moderate.mjs <reports|comments|hide-comment|restore-comment|delete-comment|ban|unban|comments-mode|remove-post|restore-post|resolve-report|dismiss-report> …");
  }
  if (!["reports", "comments", "unban"].includes(command)) console.log("ok");
} catch (err) {
  console.error(err instanceof admin.ModerationError ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
