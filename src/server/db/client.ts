import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "./schema";

// Return bigint (int8) columns as numbers; values here (byte sizes, counts) stay far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number.parseInt(v, 10));

export type Db = Kysely<Database>;

export function createDb(connectionString: string, max = 10): Db {
  const pool = new pg.Pool({ connectionString, max, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  pool.on("error", (err) => console.error("[db] idle client error", err.message));
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
