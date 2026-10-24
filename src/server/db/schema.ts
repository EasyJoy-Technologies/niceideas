import type { ColumnType, Generated, Insertable, JSONColumnType, Selectable, Updateable } from "kysely";
import type { CreatedAt, DefaultedTimestamp, JsonColumn, Timestamp } from "./schema-columns";
import type { MediaJobTable, OutboxTable, ServiceNonceTable } from "./schema-share";

export type { MediaJobState, OutboxKind } from "./schema-share";

export type ProfileStatus = "active" | "deleting";
export type PostKind = "short" | "article";
/** `preparing`: shared from NiceNote, content not pushed yet (not listed, not indexed). */
export type PostStatus = "preparing" | "active" | "unpublished" | "removed" | "author_deleting";
/** `nicenote`: shared through the NiceMatrix backend; `nicenote_intl` / `nicenote_cn`: legacy client-token posts. */
export type PostSource = "nicenote" | "nicenote_intl" | "nicenote_cn" | "web" | `api:${string}`;
export type ShareRegion = "intl" | "cn";
export type MediaState = "complete" | "processing" | "partial";
export type SyncMode = "follow" | "frozen";
export type MediaKind = "image" | "audio";
export type CommentsMode = "open" | "signed_in" | "closed";
export type CommentStatus = "visible" | "hidden" | "deleted";

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
  notifications_seen_at: DefaultedTimestamp;
  /** Display name changed on NiceIdeas: it no longer follows NiceMatrix. */
  name_locked: Generated<boolean>;
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
  like_count: Generated<number>;
  comment_count: Generated<number>;
  comments_mode: Generated<CommentsMode>;
  /** Title + plain body text (site search). */
  search_text: Generated<string>;
  /** NiceNote shares (source `nicenote`): backend share id, last applied cloud revision, app region, media progress. */
  share_id: string | null;
  source_revision: number | null;
  region: ShareRegion | null;
  media_state: Generated<MediaState>;
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
  /** NiceNote media ref (stable per owner; same ref = same content). */
  source_ref: string | null;
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
  comment_id: string | null;
  reporter_key: string | null;
  ip_hash: string | null;
}

export type ModerationActionKind =
  | "remove" | "restore" | "hide_comment" | "restore_comment" | "delete_comment"
  | "ban" | "unban" | "comments_mode" | "resolve_report" | "dismiss_report";

export interface ModerationActionTable {
  id: Generated<string>;
  post_id: string | null;
  comment_id: string | null;
  actor_id: string;
  action: ModerationActionKind;
  reason: string;
  detail: Generated<string>;
  created_at: CreatedAt;
}

export interface PostLikeTable {
  post_id: string;
  liker_key: string;
  user_id: string | null;
  ip_hash: string;
  created_at: CreatedAt;
}

export interface CommentTable {
  id: Generated<string>;
  post_id: string;
  parent_id: string | null;
  author_id: string | null;
  visitor_key: string | null;
  anon_name: string | null;
  ip_hash: string;
  body: string;
  status: Generated<CommentStatus>;
  like_count: Generated<number>;
  created_at: CreatedAt;
}

export interface CommentLikeTable {
  comment_id: string;
  liker_key: string;
  user_id: string | null;
  ip_hash: string;
  created_at: CreatedAt;
}

export interface VisitorBanTable {
  kind: "visitor" | "ip";
  key_hash: string;
  reason: string;
  created_by: string;
  created_at: CreatedAt;
  expires_at: Timestamp | null;
}

export type AdminRole = "admin" | "moderator" | "viewer";

export interface AdminMemberTable {
  user_id: string;
  role: AdminRole;
  created_by: string;
  created_at: CreatedAt;
}

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

export type AccountEventKind = "deletion_requested" | "deletion_cancelled" | "deletion_completed" | "profile_updated";

export interface AccountEventTable {
  event_id: string;
  user_id: string;
  event: AccountEventKind;
  occurred_at: Timestamp;
  processed_at: CreatedAt;
}

export interface WebSessionTable {
  id_hash: string;
  user_id: string;
  created_at: CreatedAt;
  last_seen_at: DefaultedTimestamp;
  expires_at: Timestamp;
}

export interface PowUsedTable {
  challenge: string;
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
  post_like: PostLikeTable;
  comment: CommentTable;
  comment_like: CommentLikeTable;
  visitor_ban: VisitorBanTable;
  account_event: AccountEventTable;
  web_session: WebSessionTable;
  pow_used: PowUsedTable;
  admin_member: AdminMemberTable;
  media_job: MediaJobTable;
  outbox: OutboxTable;
  service_nonce: ServiceNonceTable;
}

export type Profile = Selectable<ProfileTable>;
export type NewProfile = Insertable<ProfileTable>;
export type Post = Selectable<PostTable>;
export type NewPost = Insertable<PostTable>;
export type PostUpdate = Updateable<PostTable>;
export type PostRevision = Selectable<PostRevisionTable>;
export type Media = Selectable<MediaTable>;
export type NewMedia = Insertable<MediaTable>;
export type Comment = Selectable<CommentTable>;
export type NewComment = Insertable<CommentTable>;
export type Report = Selectable<ReportTable>;
export type ApiClient = Selectable<ApiClientTable>;
