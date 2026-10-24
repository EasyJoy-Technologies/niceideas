import type { Generated } from "kysely";
import type { CreatedAt, DefaultedTimestamp, JsonColumn, Timestamp } from "./schema-columns";

/** Tables of NiceNote sharing through the NiceMatrix backend (migration 0013). */
export type MediaJobState = "pending" | "running" | "done" | "failed";

/** A NiceNote media still to fetch (signed grant URL) and process. */
export interface MediaJobTable {
  owner_id: string;
  ref: string;
  kind: "image" | "audio";
  mime: Generated<string>;
  bytes: number | null;
  url: string | null;
  url_expires_at: Timestamp | null;
  state: Generated<MediaJobState>;
  attempts: Generated<number>;
  error: string | null;
  run_after: DefaultedTimestamp;
  created_at: CreatedAt;
  updated_at: DefaultedTimestamp;
}

export type OutboxKind = "user_registered" | "post_event";

/** Signed notification to the NiceMatrix backend, delivered with retries. */
export interface OutboxTable {
  id: Generated<string>;
  kind: OutboxKind;
  dedupe_key: string;
  payload: JsonColumn;
  state: Generated<"pending" | "done" | "failed">;
  attempts: Generated<number>;
  last_error: string | null;
  run_after: DefaultedTimestamp;
  created_at: CreatedAt;
  updated_at: DefaultedTimestamp;
}

export interface ServiceNonceTable {
  nonce: string;
  service: string;
  expires_at: Timestamp;
}

