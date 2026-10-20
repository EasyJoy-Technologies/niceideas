import { getConfig } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import { isBanned } from "@/server/db/repos/moderation";
import { forbidden } from "@/server/http/errors";
import { isSameOrigin, type Visitor } from "./visitor";

export { rateLimited } from "@/server/http/errors";

/** Shared checks of every cookie-authenticated interaction write. */
export async function assertVisitorMayWrite(db: Db, request: Request, visitor: Visitor): Promise<void> {
  if (!isSameOrigin(request)) throw forbidden("request.cross_origin");
  if (await isBanned(db, { visitorKey: visitor.key, ipHash: visitor.ipHash })) throw forbidden("visitor.banned");
}

/** Interaction limits (configurable per environment). */
export const limits = () => getConfig();
