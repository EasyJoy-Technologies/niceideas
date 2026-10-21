import type { JWTPayload } from "jose";
import type { Db } from "@/server/db/client";
import type { ApiClient } from "@/server/db/schema";
import { findApiClient, saveDirectoryEntry } from "@/server/db/repos/api-clients";
import { ApiError, forbidden, unauthorized } from "@/server/http/errors";
import { appDirectory, type DirectoryApp } from "./app-directory";
import type { Principal } from "./principal";

/** Scopes of the third-party API resource (plan §9; boundaries in docs/api/third-party.md). */
export const API_SCOPES = ["posts:read", "posts:write", "media:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

const FRESH_MS = 5 * 60_000;
const STALE_MAX_MS = 60 * 60_000;
const CLIENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const known = new Map<string, { app: DirectoryApp | null; at: number }>();

const fromRow = (r: ApiClient): DirectoryApp => ({ clientId: r.client_id, name: r.name, logoUrl: r.logo_url, websiteUrl: r.website_url, status: r.dir_status });

/**
 * Directory entry of a client: cached up to 5 minutes; when the directory is
 * unreachable the last answer (memory, else database) is used for up to 1 hour.
 */
async function lookup(db: Db, clientId: string): Promise<{ app: DirectoryApp | null; row?: ApiClient }> {
  const hit = known.get(clientId);
  if (hit && Date.now() - hit.at < FRESH_MS) return { app: hit.app };
  try {
    const app = await appDirectory()(clientId);
    known.set(clientId, { app, at: Date.now() });
    return app ? { app, row: await saveDirectoryEntry(db, app) } : { app };
  } catch (err) {
    console.warn(JSON.stringify({ event: "app_directory", result: "unavailable", error: String(err).slice(0, 120) }));
    if (hit && Date.now() - hit.at < STALE_MAX_MS) return { app: hit.app };
    const row = await findApiClient(db, clientId);
    if (row?.fetched_at && Date.now() - row.fetched_at.getTime() < STALE_MAX_MS) return { app: fromRow(row), row };
    throw new ApiError("auth.directory_unavailable", 503);
  }
}

/**
 * Third-party caller (audience = third-party API resource). The app must be listed in the
 * NiceMatrix app directory and active there, not blocked on NiceIdeas, and the token must
 * carry the endpoint's scope (users may grant only some of the requested scopes).
 */
export async function toThirdPartyPrincipal(db: Db, claims: JWTPayload, scope: ApiScope): Promise<Principal> {
  const userId = typeof claims.sub === "string" ? claims.sub : "";
  const clientId = typeof claims.client_id === "string" ? claims.client_id : "";
  if (!userId || !clientId) throw unauthorized("auth.invalid_token");
  if (!CLIENT_ID.test(clientId)) throw forbidden("auth.client_unknown");
  const found = await lookup(db, clientId);
  if (!found.app) throw forbidden("auth.client_unknown");
  if (found.app.status === "suspended") throw forbidden("auth.client_suspended");
  const row = found.row ?? (await findApiClient(db, clientId)) ?? (await saveDirectoryEntry(db, found.app));
  if (row.status === "disabled") throw forbidden("auth.client_blocked");
  const scopes = new Set(typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : []);
  if (!scopes.has(scope)) throw forbidden("auth.insufficient_scope");
  return { userId, clientId, kind: "third_party", source: `api:${clientId}`, apiClientId: row.id };
}

/** Test hook. */
export function clearAppDirectoryCacheForTests(): void {
  known.clear();
}
