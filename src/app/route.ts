import { discoverResponse } from "@/server/share/feed-routes";

/** Signed-out home = Discover (the following timeline arrives with web sign-in). */
export const GET = discoverResponse;
