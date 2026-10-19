import { z } from "zod";

/**
 * Runtime configuration, validated once on first use. Missing or malformed
 * values fail fast instead of silently falling back.
 */
const schema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PUBLIC_BASE_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL"),
  LOGTO_ISSUER: z.url().default("https://id.nicematrix.com/oidc"),
  LOGTO_JWKS_URI: z.url().default("https://id.nicematrix.com/oidc/jwks"),
  /** `aud=source` pairs: which business audience maps to which NiceNote source. */
  FIRST_PARTY_AUDIENCES: z
    .string()
    .default("https://api.nicematrix.com=nicenote_intl,https://apiv3.ej-mobile.cn=nicenote_cn"),
  /** Logto client_ids allowed to call first-party APIs. Empty = no first-party access (fail closed). */
  FIRST_PARTY_CLIENT_IDS: z.string().default(""),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid configuration: ${fields}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Test helper: forget the cached config so tests can vary env vars. */
export function resetConfigForTests(): void {
  cached = null;
}
