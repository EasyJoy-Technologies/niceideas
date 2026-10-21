// External API client registry CLI (plan §9). Server-side only. Bundled to dist/clients.mjs.
//
//   list
//   register --client-id <logto id> --key <source key> --name <display name> --homepage <https url> [--icon <https url>]
//   disable <client id> | enable <client id>
import { getDb } from "../src/server/db";
import { listApiClients, setApiClientStatus, upsertApiClient } from "../src/server/db/repos/api-clients";

const argv = process.argv.slice(2);
const flag = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i === -1 ? undefined : argv[i + 1];
};
const fail = (m: string): never => {
  console.error(m);
  process.exit(2);
};
const db = getDb();
try {
  const [command, id] = argv;
  if (command === "list") {
    for (const c of await listApiClients(db)) console.log(JSON.stringify({ clientId: c.client_id, key: c.source_key, name: c.name, status: c.status, homepage: c.homepage_url, icon: c.icon_url }));
  } else if (command === "register") {
    const key = flag("key") ?? fail("--key is required");
    if (!/^[a-z0-9-]{2,32}$/.test(key)) fail("--key: 2-32 of a-z 0-9 -");
    const homepage = flag("homepage") ?? fail("--homepage is required");
    const icon = flag("icon") ?? null;
    if (!homepage.startsWith("https://") || (icon && !icon.startsWith("https://"))) fail("urls must be https://");
    const c = await upsertApiClient(db, { clientId: flag("client-id") ?? fail("--client-id is required"), sourceKey: key, name: flag("name") ?? fail("--name is required"), homepageUrl: homepage, iconUrl: icon });
    console.log(JSON.stringify({ registered: c.client_id, source: `api:${c.source_key}` }));
  } else if (command === "disable" || command === "enable") {
    console.log((await setApiClientStatus(db, id ?? fail("client id required"), command === "disable" ? "disabled" : "active")) ? "ok" : "no such client");
  } else fail("usage: clients.mjs list | register … | disable <id> | enable <id>");
} finally {
  await db.destroy();
}
