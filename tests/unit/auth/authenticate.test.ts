import { beforeAll, describe, expect, it } from "vitest";
import { authenticateFirstParty, setAuthContextForTests } from "@/server/auth/authenticate";
import { parseFirstPartyPolicy } from "@/server/auth/first-party";
import { createTokenVerifier } from "@/server/auth/token-verifier";
import { ApiError } from "@/server/http/errors";
import { AUD_CN, AUD_INTL, TEST_ISSUER, createTestIssuer } from "../../helpers/tokens";

let sign: Awaited<ReturnType<typeof createTestIssuer>>["sign"];

beforeAll(async () => {
  const issuer = await createTestIssuer();
  sign = issuer.sign;
  setAuthContextForTests({
    verify: createTokenVerifier(TEST_ISSUER, issuer.keys),
    policy: parseFirstPartyPolicy(`${AUD_INTL}=nicenote_intl,${AUD_CN}=nicenote_cn`, "nn-ios, nn-android"),
  });
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

describe("authenticateFirstParty", () => {
  it("accepts intl and cn business tokens and maps source", async () => {
    const intl = await authenticateFirstParty(req(await sign({ sub: "u1", client_id: "nn-ios", aud: AUD_INTL })));
    expect(intl).toEqual({ userId: "u1", clientId: "nn-ios", kind: "first_party", source: "nicenote_intl" });
    const cn = await authenticateFirstParty(req(await sign({ sub: "u1", client_id: "nn-android", aud: [AUD_CN] })));
    expect(cn.source).toBe("nicenote_cn");
  });

  it("rejects missing, malformed, foreign-issuer, expired and wrong-audience tokens", async () => {
    expect(await failure(authenticateFirstParty(req()))).toEqual({ code: "auth.missing_token", status: 401 });
    expect(await failure(authenticateFirstParty(req("garbage")))).toEqual({ code: "auth.invalid_token", status: 401 });
    const foreign = await sign({ sub: "u1", client_id: "nn-ios", aud: AUD_INTL }, { issuer: "https://evil/oidc" });
    expect((await failure(authenticateFirstParty(req(foreign)))).status).toBe(401);
    const expired = await sign({ sub: "u1", client_id: "nn-ios", aud: AUD_INTL }, { expiresIn: "-1m" });
    expect((await failure(authenticateFirstParty(req(expired)))).status).toBe(401);
    const otherAud = await sign({ sub: "u1", client_id: "nn-ios", aud: "https://api.niceideas.app" });
    expect((await failure(authenticateFirstParty(req(otherAud)))).status).toBe(401);
  });

  it("rejects tokens carrying both business audiences (ambiguous source)", async () => {
    const both = await sign({ sub: "u1", client_id: "nn-ios", aud: [AUD_INTL, AUD_CN] });
    expect(await failure(authenticateFirstParty(req(both)))).toEqual({ code: "auth.audience_not_accepted", status: 401 });
  });

  it("rejects clients outside the first-party allow-list and tokens without sub", async () => {
    const other = await sign({ sub: "u1", client_id: "someone-else", aud: AUD_INTL });
    expect(await failure(authenticateFirstParty(req(other)))).toEqual({ code: "auth.client_not_allowed", status: 403 });
    const noSub = await sign({ client_id: "nn-ios", aud: AUD_INTL });
    expect((await failure(authenticateFirstParty(req(noSub)))).status).toBe(401);
  });
});

describe("parseFirstPartyPolicy", () => {
  it("rejects unknown sources and empty client list fails closed", () => {
    expect(() => parseFirstPartyPolicy("https://a=web", "")).toThrow();
    expect(parseFirstPartyPolicy(`${AUD_INTL}=nicenote_intl`, "").clientIds.size).toBe(0);
  });
});
