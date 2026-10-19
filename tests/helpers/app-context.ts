import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setAuthContextForTests } from "@/server/auth/authenticate";
import { parseFirstPartyPolicy } from "@/server/auth/first-party";
import { createTokenVerifier } from "@/server/auth/token-verifier";
import { resetConfigForTests } from "@/server/config/env";
import { closeDbForTests } from "@/server/db";
import { LocalStore } from "@/server/storage/local-store";
import { setMediaStoresForTests } from "@/server/storage";
import { startTestDb } from "./pg";
import { AUD_CN, AUD_INTL, TEST_ISSUER, createTestIssuer } from "./tokens";

export const TEST_CLIENT = "nicenote-test-client";

/**
 * Boots everything a route handler needs: a migrated database (via DATABASE_URL),
 * a local test issuer for tokens and local media stores.
 */
export async function startAppContext() {
  const pg = await startTestDb();
  process.env.DATABASE_URL = pg.url;
  process.env.APP_ENV = "test";
  resetConfigForTests();
  const issuer = await createTestIssuer();
  setAuthContextForTests({
    verify: createTokenVerifier(TEST_ISSUER, issuer.keys),
    policy: parseFirstPartyPolicy(`${AUD_INTL}=nicenote_intl,${AUD_CN}=nicenote_cn`, TEST_CLIENT),
  });
  const root = mkdtempSync(path.join(os.tmpdir(), "ni-app-"));
  const stores = { privateStore: new LocalStore(path.join(root, "private")), publicStore: new LocalStore(path.join(root, "public")) };
  setMediaStoresForTests(stores);
  const tokenFor = (sub: string, aud = AUD_INTL) => issuer.sign({ sub, client_id: TEST_CLIENT, aud });
  const stop = async () => {
    await closeDbForTests();
    await pg.stop();
  };
  return { ...pg, stop, stores, tokenFor };
}
