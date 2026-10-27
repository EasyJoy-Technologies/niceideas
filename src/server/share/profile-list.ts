import type { Db } from "@/server/db/client";
import type { FeedCursor } from "@/server/db/repos/feed";
import { tabFilter } from "./feed-list";
import { loadBookmarks, loadFeed, type FeedViewer } from "./load-feed";
import { loadProfileReplies, loadProfileReposts } from "./load-profile-lists";
import type { ProfileList } from "./profile-page";
import type { ProfileTab } from "./profile-tabs";

/** The list of a profile tab (`own`: the owner is looking — their private posts and Bookmarks). */
export async function loadProfileList(db: Db, userId: string, own: boolean, tab: ProfileTab, cursor: FeedCursor | null, viewer: FeedViewer): Promise<ProfileList> {
  switch (tab) {
    case "replies":
      return { kind: "replies", page: await loadProfileReplies(db, userId, cursor) };
    case "reposts":
      return { kind: "posts", page: await loadProfileReposts(db, userId, own, cursor, viewer) };
    case "bookmarks":
      return { kind: "posts", page: await loadBookmarks(db, userId, cursor, viewer.visitorKey) };
    default:
      return { kind: "posts", page: await loadFeed(db, { ...tabFilter(tab), authorId: userId, includePrivate: own }, cursor, viewer) };
  }
}
