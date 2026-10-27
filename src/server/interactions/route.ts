import type { Db } from "@/server/db/client";
import { getDb } from "@/server/db";
import { sessionProfile } from "@/server/auth/web/session";
import { apiRoute } from "@/server/http/api-route";
import type { Actor } from "./actor";
import { assertVisitorMayWrite } from "./guards";
import { visitorOf } from "./visitor";

type Handler<C> = (input: { request: Request; context: C; db: Db; actor: Actor }) => Promise<Response>;

/**
 * Route wrapper for post-page interactions (access class `interaction`, open in
 * mainland China): resolves the actor (signed-in viewer, if any, and the browser),
 * enforces same-origin + bans on writes, and attaches the visitor cookie when it was just issued.
 */
export function interactionRoute<C>(name: string, handler: Handler<C>, opts: { write: boolean } = { write: true }) {
  return apiRoute<C>(name, "interaction", async (request, context) => {
    const db = getDb();
    const visitor = visitorOf(request);
    if (opts.write) await assertVisitorMayWrite(db, request, visitor);
    const viewer = await sessionProfile(db, request.headers);
    const res = await handler({ request, context, db, actor: { visitor, viewer } });
    if (visitor.setCookie) res.headers.append("Set-Cookie", visitor.setCookie);
    return res;
  });
}
