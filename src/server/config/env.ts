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

  /** Object storage: `local` (development/tests) or `s3` (Cloudflare R2). */
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./var/storage"),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Holds every derived rendition; never publicly reachable. */
  S3_PRIVATE_BUCKET: z.string().optional(),
  /** Holds only media of live posts; served by MEDIA_PUBLIC_BASE_URL. */
  S3_PUBLIC_BUCKET: z.string().optional(),
  MEDIA_PUBLIC_BASE_URL: z.url().default("http://localhost:3000/media-local"),
  /** Short TTL bounds how long withdrawn media can linger in CDN / browser caches. */
  MEDIA_CACHE_CONTROL: z.string().default("public, max-age=300"),
  MEDIA_MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(30 * 1024 * 1024),
  MEDIA_MAX_AUDIO_BYTES: z.coerce.number().int().positive().default(150 * 1024 * 1024),
  MEDIA_MAX_AUDIO_SECONDS: z.coerce.number().int().positive().default(4 * 60 * 60),
  MEDIA_MAX_IMAGE_PIXELS: z.coerce.number().int().positive().default(100_000_000),
  MEDIA_USER_QUOTA_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024 * 1024),

  /** Source badge target for NiceNote posts (plan §16.4); `utm_*` is appended. Moves to the API-client registry with the open API. */
  SOURCE_NICENOTE_URL: z.url().default("https://enp.ej-mobile.cn"),

  /** Key for one-way hashes of visitor cookies / network addresses (interactions). Required outside development / test. */
  INTERACTION_SECRET: z.string().min(32).optional(),
  /** Anonymous commenting: proof-of-work difficulty (leading zero bits) and limits. */
  COMMENT_POW_BITS: z.coerce.number().int().min(0).max(24).default(16),
  RATE_ANON_COMMENTS_PER_10MIN: z.coerce.number().int().positive().default(5),
  RATE_IP_COMMENTS_PER_10MIN: z.coerce.number().int().positive().default(20),
  RATE_IP_COMMENTS_PER_DAY: z.coerce.number().int().positive().default(200),
  RATE_IP_LIKES_PER_HOUR: z.coerce.number().int().positive().default(300),
  RATE_IP_REPORTS_PER_DAY: z.coerce.number().int().positive().default(30),

  /** Shared secret for NiceMatrix account events (HMAC-SHA256). Unset = endpoint disabled (503). */
  ACCOUNT_EVENTS_SECRET: z.string().min(32).optional(),

  /** Mainland-China rule (plan §4): `link_only` = only share links / publish APIs; `off` = no restriction. */
  REGION_POLICY_CN: z.enum(["link_only", "off"]).default("link_only"),

  /** Withdrawn / removed posts are physically deleted after this many days (plan D9). */
  POST_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  /** Publishing limits per user (plan §11). */
  RATE_POSTS_PER_HOUR: z.coerce.number().int().positive().default(30),
  RATE_POSTS_PER_DAY: z.coerce.number().int().positive().default(200),
  RATE_REVISIONS_PER_HOUR: z.coerce.number().int().positive().default(720),
  RATE_MEDIA_PER_HOUR: z.coerce.number().int().positive().default(300),
}).superRefine((cfg, ctx) => {
  if ((cfg.APP_ENV === "staging" || cfg.APP_ENV === "production") && !cfg.INTERACTION_SECRET) {
    ctx.addIssue({ code: "custom", path: ["INTERACTION_SECRET"], message: "required outside development / test" });
  }
  if (cfg.STORAGE_DRIVER !== "s3") return;
  for (const key of ["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PRIVATE_BUCKET", "S3_PUBLIC_BUCKET"] as const) {
    if (!cfg[key]) ctx.addIssue({ code: "custom", path: [key], message: "required when STORAGE_DRIVER=s3" });
  }
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
