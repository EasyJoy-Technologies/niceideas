/**
 * The visitor's cookie choice, kept in the `ni_consent` cookie (180 days, privacy policy §5) as
 * `v<version>.<category>-<0|1>...`, e.g. `v1.analytics-1`. Values written before categories existed
 * (`granted` / `denied`, analytics only) count as version 1.
 */
export type Grants = Record<string, boolean>;
export type Choice = { version: number; grants: Grants };

const NAME = "ni_consent";
const MAX_AGE = 180 * 86400;

export function parseChoice(raw: string | null | undefined): Choice | null {
  if (!raw) return null;
  if (raw === "granted" || raw === "denied") return { version: 1, grants: { analytics: raw === "granted" } };
  const [head, ...parts] = raw.split(".");
  const version = /^v([1-9]\d{0,3})$/.exec(head ?? "");
  if (!version) return null;
  const grants: Grants = {};
  for (const part of parts) {
    const m = /^([a-z]{1,20})-([01])$/.exec(part);
    if (!m) return null;
    grants[m[1]] = m[2] === "1";
  }
  return { version: Number(version[1]), grants };
}

export function serializeChoice(choice: Choice): string {
  return [`v${choice.version}`, ...Object.entries(choice.grants).map(([c, on]) => `${c}-${on ? 1 : 0}`)].join(".");
}

/** Ask (again) when there is no choice, the request changed, or a category has not been decided. */
export function needsPrompt(choice: Choice | null, version: number, offered: string[]): boolean {
  return !choice || choice.version < version || offered.some((c) => !(c in choice.grants));
}

export function readChoice(): Choice | null {
  return parseChoice(new RegExp(`(?:^|;\\s*)${NAME}=([^;]*)`).exec(document.cookie)?.[1]);
}

export function writeChoice(choice: Choice): void {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${NAME}=${serializeChoice(choice)}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
}
