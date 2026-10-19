// Migration CLI. Development: `pnpm db:migrate`. Deploy: bundled to dist/migrate.mjs
// (scripts/build-tools.mjs) and run before the service restarts.
import { createDb } from "../src/server/db/client";
import { migrateToLatest } from "../src/server/db/migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(2);
}
const db = createDb(url, 1);
try {
  const applied = await migrateToLatest(db);
  console.log(applied.length ? `applied: ${applied.join(", ")}` : "database is up to date");
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
