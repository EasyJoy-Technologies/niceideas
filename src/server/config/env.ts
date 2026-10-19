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

  /** Withdrawn / removed posts are physically deleted after this many days (plan D9). */
  POST_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  /** Publishing limits per user (plan §11). */
  RATE_POSTS_PER_HOUR: z.coerce.number().int().positive().default(30),
  RATE_POSTS_PER_DAY: z.coerce.number().int().positive().default(200),
  RATE_REVISIONS_PER_HOUR: z.coerce.number().int().positive().default(720),
  RATE_MEDIA_PER_HOUR: z.coerce.number().int().positive().default(300),
}).superRefine((cfg, ctx) => {
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
