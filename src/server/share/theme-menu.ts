import { escapeHtml } from "@/server/render/escape";
import type { ChromeContext } from "./chrome";
import { icon, type IconName } from "./icons";
import { THEMES, type Theme } from "./theme";

const ICONS: Record<Theme, IconName> = { auto: "themeAuto", light: "sun", dark: "moon" };

/** No-JS theme menu (icon of the current choice); a choice is remembered (/api/web/theme) and returns to the page. */
export function themeMenu(ctx: ChromeContext): string {
  const { t } = ctx.intl;
  const items = THEMES.map((theme) => {
    const href = `/api/web/theme?t=${theme}&next=${encodeURIComponent(ctx.path)}`;
    const current = theme === ctx.theme ? ' aria-current="true"' : "";
    return `<li><a href="${escapeHtml(href)}" rel="nofollow"${current}>${icon(ICONS[theme])}<span>${escapeHtml(t(`theme.${theme}`))}</span></a></li>`;
  }).join("");
  const label = escapeHtml(t("theme.label"));
  return `<details class="ni-menu ni-theme"><summary aria-label="${label}" title="${label}">${icon(ICONS[ctx.theme])}</summary><ul>${items}</ul></details>`;
}
