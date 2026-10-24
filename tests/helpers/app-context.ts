import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setAuthContextForTests } from "@/server/auth/authenticate";
import { setAppDirectoryForTests } from "@/server/auth/app-directory";
import { createTokenVerifier } from "@/server/auth/token-verifier";
import { resetConfigForTests } from "@/server/config/env";
import { closeDbForTests } from "@/server/db";
import { LocalStore } from "@/server/storage/local-store";
import { setMediaStoresForTests } from "@/server/storage";
import { startTestDb } from "./pg";
import { AUD_INTL, TEST_ISSUER, createTestIssuer } from "./tokens";

/** External app registered in the (test) NiceMatrix app directory. */
export const TEST_APP = "test-app";
export const API_AUDIENCE = "https://api.niceideas.app";
export const ALL_SCOPES = "posts:read posts:write media:write";

/**
 * Boots everything a route handler needs: a migrated database (via DATABASE_URL),
 * a local test issuer for tokens, a directory knowing TEST_APP and local media stores.
 */
export async function startAppContext() {
  const pg = await startTestDb();
  process.env.DATABASE_URL = pg.url;
  process.env.APP_ENV = "test";
  // Caches are exercised by their own tests; elsewhere every request reads fresh data.
  process.env.PAGE_CACHE_SECONDS = "0";
  process.env.ASIDE_CACHE_SECONDS = "0";
  resetConfigForTests();
  const issuer = await createTestIssuer();
  setAuthContextForTests({ verify: createTokenVerifier(TEST_ISSUER, issuer.keys) });
  setAppDirectoryForTests(async (id) => (id === TEST_APP ? { clientId: TEST_APP, name: "Test App", logoUrl: null, websiteUrl: null, status: "active" } : null));
  const root = mkdtempSync(path.join(os.tmpdir(), "ni-app-"));
  const stores = { privateStore: new LocalStore(path.join(root, "private")), publicStore: new LocalStore(path.join(root, "public")) };
  setMediaStoresForTests(stores);
  /** External-app token for the public API (TEST_APP). */
  const apiToken = (sub: string, scope = ALL_SCOPES) => issuer.sign({ sub, client_id: TEST_APP, aud: API_AUDIENCE, scope });
  /** Legacy NiceNote client token (business audience): no longer accepted by the API. */
  const legacyToken = (sub: string, aud = AUD_INTL) => issuer.sign({ sub, client_id: "nicenote-test-client", aud });
  const stop = async () => {
    setAppDirectoryForTests(null);
    await closeDbForTests();
    await pg.stop();
  };
  /** Any claims (third-party tokens etc.), signed by the test issuer. */
  const signRaw = (claims: Record<string, unknown>) => issuer.sign(claims);
  return { ...pg, stop, stores, apiToken, legacyToken, signRaw };
}
