import type { Db } from "@/server/db/client";
import type { FeedCursor } from "@/server/db/repos/feed";
import { tabFilter } from "./feed-list";
import { loadBookmarks, loadFeed, type FeedViewer } from "./load-feed";
import { loadProfileReplies, loadProfileReposts } from "./load-profile-lists";
import type { ProfileList } from "./profile-page";
import type { ProfileTab } from "./profile-tabs";

/** The list of a profile tab (Bookmarks: the owner's tab only, profileTab; posts: those the viewer may see). */
export async function loadProfileList(db: Db, userId: string, tab: ProfileTab, cursor: FeedCursor | null, viewer: FeedViewer): Promise<ProfileList> {
  switch (tab) {
    case "replies":
      return { kind: "replies", page: await loadProfileReplies(db, userId, cursor) };
    case "reposts":
      return { kind: "posts", page: await loadProfileReposts(db, userId, cursor, viewer) };
    case "bookmarks":
      return { kind: "posts", page: await loadBookmarks(db, userId, cursor, viewer.visitorKey) };
    default:
      return { kind: "posts", page: await loadFeed(db, { ...tabFilter(tab), authorId: userId, viewerId: viewer.viewerId }, cursor, viewer) };
  }
}
