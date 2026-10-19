import type { ColumnType, Generated, Insertable, JSONColumnType, Selectable, Updateable } from "kysely";

/** Timestamps are written as Date/ISO strings and read back as Date. */
type Timestamp = ColumnType<Date, Date | string, Date | string>;
type CreatedAt = ColumnType<Date, Date | string | undefined, never>;
/** Timestamp with a database default (optional on insert, updatable). */
type DefaultedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
/** Arbitrary JSON written as a serialized string. */
type JsonColumn = ColumnType<unknown, string, string>;

export type ProfileStatus = "active" | "deleting";
export type PostKind = "short" | "article";
export type PostStatus = "active" | "unpublished" | "removed" | "author_deleting";
export type PostSource = "nicenote_intl" | "nicenote_cn" | "web" | `api:${string}`;
export type SyncMode = "follow" | "frozen";
export type MediaKind = "image" | "audio";

/** One stored rendition (object key relative to the bucket root). */
export type MediaRendition = { key: string; mime: string; bytes: number; width?: number; height?: number };

/** Derived renditions. Images: responsive webp set + one jpeg/png fallback. Audio: original bytes. */
export type MediaVariants =
  | { kind: "image"; webp: MediaRendition[]; fallback: MediaRendition }
  | { kind: "audio"; original: MediaRendition };

export interface ProfileTable {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  locale: string | null;
  status: Generated<ProfileStatus>;
  created_at: CreatedAt;
  updated_at: DefaultedTimestamp;
}

export interface PostTable {
  id: Generated<string>;
  slug: string;
  author_id: string;
  kind: PostKind;
  kind_locked: Generated<boolean>;
  status: Generated<PostStatus>;
  source: PostSource;
  source_ref: string | null;
  api_client_id: string | null;
  sync_mode: Generated<SyncMode>;
  title: Generated<string>;
  summary: Generated<string>;
  summary_locked: Generated<boolean>;
  cover_media_id: string | null;
  cover_locked: Generated<boolean>;
  current_revision_id: string | null;
  source_updated_at: Timestamp | null;
  published_at: DefaultedTimestamp;
  updated_at: DefaultedTimestamp;
  status_changed_at: Timestamp | null;
  status_reason: string | null;
  purge_after: Timestamp | null;
}

export interface PostRevisionTable {
  id: Generated<string>;
  post_id: string;
  revision_no: number;
  document: JsonColumn;
  content_hash: string;
  source_updated_at: Timestamp | null;
  created_at: CreatedAt;
}

export interface MediaTable {
  id: Generated<string>;
  owner_id: string;
  sha256: string;
  kind: MediaKind;
  mime: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  variants: JSONColumnType<MediaVariants, string, string>;
  public_at: Timestamp | null;
  detached_at: Timestamp | null;
  created_at: CreatedAt;
}

export interface RevisionMediaTable {
  revision_id: string;
  media_id: string;
}

export interface FollowTable {
  follower_id: string;
  followee_id: string;
  created_at: CreatedAt;
}

export interface ReportTable {
  id: Generated<string>;
  post_id: string;
  reporter_id: string | null;
  reason: string;
  detail: string;
  status: Generated<"open" | "resolved" | "dismissed">;
  created_at: CreatedAt;
  resolved_at: Timestamp | null;
  resolved_by: string | null;
}

export interface ModerationActionTable {
  id: Generated<string>;
  post_id: string;
  actor_id: string;
  action: "remove" | "restore";
  reason: string;
  created_at: CreatedAt;
}

export interface ApiClientTable {
  id: Generated<string>;
  client_id: string;
  name: string;
  status: Generated<"active" | "disabled">;
  rate_tier: Generated<string>;
  created_at: CreatedAt;
}

export interface IdempotencyTable {
  scope: string;
  key: string;
  request_hash: string;
  status: Generated<"pending" | "done">;
  response_status: number | null;
  response_body: ColumnType<unknown, string | null | undefined, string | null>;
  created_at: CreatedAt;
  expires_at: Timestamp;
}

export interface Database {
  profile: ProfileTable;
  post: PostTable;
  post_revision: PostRevisionTable;
  media: MediaTable;
  revision_media: RevisionMediaTable;
  follow: FollowTable;
  report: ReportTable;
  moderation_action: ModerationActionTable;
  api_client: ApiClientTable;
  idempotency: IdempotencyTable;
}

export type Profile = Selectable<ProfileTable>;
export type NewProfile = Insertable<ProfileTable>;
export type Post = Selectable<PostTable>;
export type NewPost = Insertable<PostTable>;
export type PostUpdate = Updateable<PostTable>;
export type PostRevision = Selectable<PostRevisionTable>;
export type Media = Selectable<MediaTable>;
export type NewMedia = Insertable<MediaTable>;
