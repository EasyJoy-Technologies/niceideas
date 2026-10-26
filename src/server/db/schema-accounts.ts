import type { ColumnType } from "kysely";
import type { CreatedAt, Timestamp } from "./schema-columns";

/** Tables of NiceMatrix account events (migrations 0003, 0013, 0017). */
export type AccountEventKind = "deletion_requested" | "deletion_cancelled" | "deletion_completed" | "profile_updated";

type NullableTimestamp = ColumnType<Date | null, Date | null | undefined, Date | null>;

export interface AccountEventTable {
  event_id: string;
  user_id: string;
  event: AccountEventKind;
  occurred_at: Timestamp;
  processed_at: CreatedAt;
  /** Set once every step succeeded; until then a redelivery runs the event again. */
  completed_at: NullableTimestamp;
  /** Lease of the delivery running the event (two deliveries never run together). */
  claimed_until: NullableTimestamp;
}

/** Users whose deletion completed (kept for good): nothing is created for them again. */
export interface DeletedAccountTable {
  user_id: string;
  deleted_at: CreatedAt;
}
