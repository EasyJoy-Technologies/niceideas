import { z } from "zod";
import { getConfig } from "@/server/config/env";

/** Entry of the NiceMatrix third-party app directory (contract: docs/api/third-party.md). */
export type DirectoryApp = { clientId: string; name: string; logoUrl: string | null; websiteUrl: string | null; status: "active" | "suspended" };

/** `null` = not a third-party app (404). Throws when the directory cannot be reached or answers nonsense. */
export type AppDirectory = (clientId: string) => Promise<DirectoryApp | null>;

const https = z.string().regex(/^https:\/\/[^\s"'<>]{1,500}$/).nullish().transform((v) => v ?? null);
const entry = z.object({
  clientId: z.string(),
  name: z.string().trim().min(1).max(100),
  logoUrl: https.catch(null),
  websiteUrl: https.catch(null),
  status: z.enum(["active", "suspended"]),
});

const TIMEOUT_MS = 5_000;

const httpDirectory: AppDirectory = async (clientId) => {
  const url = `${getConfig().APP_DIRECTORY_URL.replace(/\/+$/, "")}/v1/oauth/apps/${encodeURIComponent(clientId)}`;
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`app directory ${res.status}`);
  const parsed = entry.safeParse(await res.json());
  if (!parsed.success || parsed.data.clientId !== clientId) throw new Error("app directory: malformed entry");
  return parsed.data;
};

let override: AppDirectory | null = null;

export const appDirectory = (): AppDirectory => override ?? httpDirectory;

/** Test hook (contract test double). */
export function setAppDirectoryForTests(d: AppDirectory | null): void {
  override = d;
}
