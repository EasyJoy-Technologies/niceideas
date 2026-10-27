import type { ColumnType, Generated } from "kysely";
import type { CreatedAt, DefaultedTimestamp, Timestamp } from "./schema-columns";

/** Where a web session came from: NiceMatrix sign-in (`web`) or an app's one-time ticket (`app`). */
export type SessionSource = "web" | "app";

export interface WebSessionTable {
  id_hash: string;
  user_id: string;
  created_at: CreatedAt;
  last_seen_at: DefaultedTimestamp;
  expires_at: Timestamp;
  source: Generated<SessionSource>;
}

/** One-time sign-in ticket of an app WebView (SHA-256 of the ticket only). */
export interface WebTicketTable {
  id_hash: string;
  user_id: string;
  created_at: CreatedAt;
  expires_at: Timestamp;
  used_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
}
