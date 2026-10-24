import type { Generated } from "kysely";
import type { CreatedAt, DefaultedTimestamp, JsonColumn, Timestamp } from "./schema-columns";

/** Tables of NiceNote sharing through the NiceMatrix backend (migration 0013). */
/** `failed`: temporary (a new grant URL queues it again); `rejected`: permanent (never fetched again for this owner and ref). */
export type MediaJobState = "pending" | "running" | "done" | "failed" | "rejected";

/**
 * A NiceNote media of an owner by ref: fetching (signed grant URL) and processing, then the
 * ref → media mapping (`media_id`, done). `run_after` is the due time, or the lease end while running.
 */
export interface MediaJobTable {
  owner_id: string;
  ref: string;
  media_id: string | null;
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

/** Download of a NiceMatrix avatar into the public bucket (one per user; a new source replaces the job). */
export interface AvatarJobTable {
  user_id: string;
  source_url: string;
  state: Generated<"pending" | "running" | "done" | "failed">;
  attempts: Generated<number>;
  error: string | null;
  run_after: DefaultedTimestamp;
  created_at: DefaultedTimestamp;
  updated_at: DefaultedTimestamp;
}

export interface ServiceNonceTable {
  nonce: string;
  service: string;
  expires_at: Timestamp;
}

