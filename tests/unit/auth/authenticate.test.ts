import { beforeAll, describe, expect, it } from "vitest";
import { authenticateApi, setAuthContextForTests } from "@/server/auth/authenticate";
import { createTokenVerifier } from "@/server/auth/token-verifier";
import { resetConfigForTests } from "@/server/config/env";
import { ApiError } from "@/server/http/errors";
import { AUD_CN, AUD_INTL, TEST_ISSUER, createTestIssuer } from "../../helpers/tokens";

const API = "https://api.niceideas.app";
let sign: Awaited<ReturnType<typeof createTestIssuer>>["sign"];

beforeAll(async () => {
  // Only the failure paths before any database access are exercised here.
  process.env.DATABASE_URL ??= "postgres://unused/unused";
  resetConfigForTests();
  const issuer = await createTestIssuer();
  sign = issuer.sign;
  setAuthContextForTests({ verify: createTokenVerifier(TEST_ISSUER, issuer.keys) });
});

const req = (token?: string) => new Request("http://x/api", { headers: token ? { authorization: `Bearer ${token}` } : {} });

async function failure(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return { code: e.code, status: e.status };
    throw e;
  }
  throw new Error("expected failure");
}

describe("authenticateApi (third-party apps only)", () => {
  it("rejects missing, malformed, foreign, expired tokens", async () => {
    expect(await failure(authenticateApi(req(), "posts:read"))).toEqual({ code: "auth.missing_token", status: 401 });
    expect(await failure(authenticateApi(req("garbage"), "posts:read"))).toEqual({ code: "auth.invalid_token", status: 401 });
    const foreign = await sign({ sub: "u1", client_id: "app", aud: API }, { issuer: "https://evil.test/oidc" });
    expect((await failure(authenticateApi(req(foreign), "posts:read"))).code).toBe("auth.invalid_token");
    const expired = await sign({ sub: "u1", client_id: "app", aud: API }, { expiresIn: "-1h" });
    expect((await failure(authenticateApi(req(expired), "posts:read"))).code).toBe("auth.invalid_token");
  });

  it("NiceNote business tokens no longer reach the API (shares go through the NiceMatrix backend)", async () => {
    for (const aud of [AUD_INTL, AUD_CN]) {
      const legacy = await sign({ sub: "u1", client_id: "nn-ios", aud });
      expect(await failure(authenticateApi(req(legacy), "posts:write"))).toEqual({ code: "auth.audience_not_accepted", status: 401 });
    }
    const both = await sign({ sub: "u1", client_id: "app", aud: [API, AUD_INTL] });
    expect(await failure(authenticateApi(req(both), "posts:write"))).toEqual({ code: "auth.audience_not_accepted", status: 401 });
  });
});
