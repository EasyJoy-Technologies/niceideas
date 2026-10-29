import type { ColumnType, Generated } from "kysely";
import type { CreatedAt, DefaultedTimestamp, SourceAppNames, Timestamp } from "./schema-columns";

/** Third-party app (open API client), cached from the NiceMatrix app directory plus local policy. */
export interface ApiClientTable {
  id: Generated<string>;
  client_id: string;
  name: string;
  /** Local policy: `disabled` = blocked on NiceIdeas. */
  status: Generated<"active" | "disabled">;
  rate_tier: Generated<string>;
  created_at: CreatedAt;
  /** From the NiceMatrix app directory. */
  website_url: string | null;
  logo_url: string | null;
  dir_status: Generated<"active" | "suspended">;
  fetched_at: Timestamp | null;
  note: Generated<string>;
  /** Per-app hourly post ceiling; null = RATE_CLIENT_POSTS_PER_HOUR. */
  posts_per_hour: number | null;
  /** Its posts show "From <app>" (admin Apps page); off until turned on. */
  show_badge: Generated<boolean>;
}

/**
 * One of our own apps that share through the NiceMatrix backend, by product group key (contract
 * niceideas-share.md §3.2 `sourceApp.key`). Registered on its first share with the names it sent; its posts
 * show "From <app>" only once `show_badge` is turned on in the admin Apps page.
 */
export interface SourceAppTable {
  key: string;
  /** Latest names the backend sent (admin labels); each post keeps the names sent with it. */
  names: ColumnType<SourceAppNames, string, string>;
  show_badge: Generated<boolean>;
  /** Badge link (https) and icon (https or a site path); null = no link / the generic icon. */
  website_url: string | null;
  icon_url: string | null;
  created_at: CreatedAt;
  updated_at: DefaultedTimestamp;
}
