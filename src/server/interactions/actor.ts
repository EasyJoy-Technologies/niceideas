import type { Profile } from "@/server/db/schema";
import type { Visitor } from "./visitor";

/**
 * Who interacts on a post page (plan §16.2): a signed-in viewer acts as their account (likes keyed
 * `u:<userId>`, comments with their profile); otherwise the browser acts as an anonymous visitor
 * (`v:<hash>`). Bans, same-origin checks and address limits apply to both through `visitor`.
 */
export type Actor = { visitor: Visitor; viewer: Profile | null };

export const accountLikerKey = (userId: string) => `u:${userId}`;

/**
 * Keys whose likes count as this viewer's: the account's, and for a signed-in viewer also the guest
 * likes this browser gave before signing in (so an earlier like still shows and is not counted twice).
 */
export function likerKeysOf(viewerId: string | null, visitorKey: string | null): string[] {
  return [viewerId ? accountLikerKey(viewerId) : null, visitorKey].filter((k): k is string => !!k);
}
