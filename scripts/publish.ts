// Internal test publishing CLI (execution plan step 9). Server-side only; no HTTP endpoint.
// Deploy: bundled to dist/publish.mjs (scripts/build-tools.mjs); reads the service env (DATABASE_URL, storage, …).
//
//   node dist/publish.mjs publish --user <id> [--name <display name>] [--source nicenote_intl|nicenote_cn]
//        [--ref <sourceRef>] [--title <t>] (--text <s> | --markdown <file> | --image <file>[::caption] | --audio <file>[::title])...
//   node dist/publish.mjs withdraw --user <id> --id <postId> [--source …]
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { getConfig } from "../src/server/config/env";
import { getDb } from "../src/server/db";
import { getMediaStores } from "../src/server/storage";
import { publishFromTool, withdrawFromTool, type PublishInput, type ToolInput } from "../src/server/tools/internal-publish";

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const flags = new Map<string, string>();
  const blocks: ToolInput[] = [];
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (!flag?.startsWith("--") || value === undefined) fail(`bad argument near "${flag ?? ""}"`);
    const [file, extra] = value.split("::");
    if (flag === "--text") blocks.push({ kind: "text", text: value, markdown: false });
    else if (flag === "--markdown") blocks.push({ kind: "text", text: readFileSync(value, "utf8"), markdown: true });
    else if (flag === "--image") blocks.push({ kind: "image", path: file, caption: extra });
    else if (flag === "--audio") blocks.push({ kind: "audio", path: file, title: extra });
    else flags.set(flag.slice(2), value);
  }
  return { flags, blocks };
}

const [command, ...rest] = process.argv.slice(2);
const { flags, blocks } = parseArgs(rest);
const userId = flags.get("user") ?? fail("--user is required");
const source = (flags.get("source") ?? "nicenote_intl") as PublishInput["source"];
if (source !== "nicenote_intl" && source !== "nicenote_cn") fail("--source must be nicenote_intl or nicenote_cn");

const cfg = getConfig();
const db = getDb();
const rt = { db, stores: getMediaStores(), cacheControl: cfg.MEDIA_CACHE_CONTROL, retentionDays: cfg.POST_RETENTION_DAYS };
try {
  if (command === "publish") {
    if (blocks.length === 0) fail("add at least one --text / --markdown / --image / --audio");
    const out = await publishFromTool(rt, { userId, displayName: flags.get("name"), source, sourceRef: flags.get("ref") ?? `cli-${randomUUID()}`, title: flags.get("title"), blocks });
    console.log(JSON.stringify(out));
  } else if (command === "withdraw") {
    console.log(JSON.stringify(await withdrawFromTool(rt, { userId, source, postId: flags.get("id") ?? fail("--id is required") })));
  } else {
    fail("usage: publish.mjs publish|withdraw --user <id> …");
  }
} catch (err) {
  const e = err as { code?: string; details?: unknown; message?: string };
  console.error(e.code ? JSON.stringify({ error: e.code, details: e.details }) : err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
