// External app policy CLI (plan §9). Apps are discovered automatically from the NiceMatrix
// app directory; this only manages local policy. Server-side only. Bundled to dist/clients.mjs.
//
//   list
//   block <client id> [note…] | unblock <client id>
//   limit <client id> <posts per hour | default>
import { getDb } from "../src/server/db";
import { listApiClients, setApiClientRate, setApiClientStatus } from "../src/server/db/repos/api-clients";

const [command, id, ...rest] = process.argv.slice(2);
const fail = (m: string): never => {
  console.error(m);
  process.exit(2);
};
const db = getDb();
try {
  if (command === "list") {
    for (const c of await listApiClients(db)) {
      console.log(JSON.stringify({ clientId: c.client_id, name: c.name, directory: c.dir_status, local: c.status, postsPerHour: c.posts_per_hour, note: c.note, fetchedAt: c.fetched_at }));
    }
  } else if (command === "block" || command === "unblock") {
    const ok = await setApiClientStatus(db, id ?? fail("client id required"), command === "block" ? "disabled" : "active", command === "block" ? rest.join(" ").slice(0, 500) : undefined);
    console.log(ok ? "ok" : "no such client (it appears after its first API call)");
  } else if (command === "limit") {
    const v = rest[0] ?? fail("limit <client id> <n|default>");
    const n = v === "default" ? null : Number.parseInt(v, 10);
    if (n !== null && !(n > 0)) fail("posts per hour must be a positive integer or 'default'");
    console.log((await setApiClientRate(db, id ?? fail("client id required"), n)) ? "ok" : "no such client");
  } else fail("usage: clients.mjs list | block <id> [note] | unblock <id> | limit <id> <n|default>");
} finally {
  await db.destroy();
}
