import { readCookie } from "@/server/http/cookies";

/** Colour theme preference: follow the system (default), or a fixed light / dark palette. */
export const THEMES = ["auto", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** Cookie remembering the theme choice (read on the server, so the first paint is right). */
export const THEME_COOKIE = "ni_theme";

const BG = { light: "#ffffff", dark: "#0f1115" } as const;

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function requestTheme(request: Request): Theme {
  const value = readCookie(request.headers.get("cookie"), THEME_COOKIE);
  return isTheme(value) ? value : "auto";
}

/**
 * <head> markup for the theme: the dark palette stylesheet (always, never, or by the
 * system setting) and the browser UI colour. Chosen on the server: no inline script, no flash.
 */
export function themeHead(theme: Theme, darkHref: string): string {
  if (theme === "light") return `<meta name="theme-color" content="${BG.light}">`;
  if (theme === "dark") return `<link rel="stylesheet" href="${darkHref}"><meta name="theme-color" content="${BG.dark}">`;
  return (
    `<link rel="stylesheet" href="${darkHref}" media="(prefers-color-scheme: dark)">` +
    `<meta name="theme-color" content="${BG.light}" media="(prefers-color-scheme: light)">` +
    `<meta name="theme-color" content="${BG.dark}" media="(prefers-color-scheme: dark)">`
  );
}
