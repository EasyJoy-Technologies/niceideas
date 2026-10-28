import type { Grants } from "./store";

/**
 * Third-party tools by cookie category. Ids come from `<body>` data-* (src/server/share/consent.ts);
 * a tool is injected only once its category is granted. Google Consent Mode and Clarity's consent API
 * get the state of every category (advertising stays denied until an ads category is offered and
 * accepted). To add a tool: give it a category, a loader, a consent update and its cookie names.
 */
type Vendor = {
  key: string;
  category: string;
  load(id: string, grants: Grants): void;
  update(grants: Grants): void;
  /** First-party cookies the tool sets (deleted when its category is withdrawn). */
  cookies: RegExp;
};

type Queue = { (...args: unknown[]): void; q?: unknown[][] };
type VendorWindow = Window & { dataLayer?: unknown[]; gtag?: Queue; clarity?: Queue };
const w = window as VendorWindow;

/** Google Analytics cookies expire after 13 months (privacy policy §5) instead of its 2-year default. */
const GA_COOKIE_SECONDS = 395 * 86400;
const state = (on: boolean | undefined) => (on ? "granted" : "denied");

function inject(src: string): void {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

const googleConsent = (g: Grants) => ({
  analytics_storage: state(g.analytics),
  ad_storage: state(g.ads),
  ad_user_data: state(g.ads),
  ad_personalization: state(g.ads),
});
const clarityConsent = (g: Grants) => ({ analytics_Storage: state(g.analytics), ad_Storage: state(g.ads) });

const VENDORS: Vendor[] = [
  {
    key: "ga4",
    category: "analytics",
    load(id, grants) {
      w.dataLayer = w.dataLayer || [];
      // gtag must push the `arguments` object itself (Google's snippet).
      // eslint-disable-next-line prefer-rest-params
      w.gtag = function gtag() { w.dataLayer!.push(arguments); };
      w.gtag("consent", "default", googleConsent(grants));
      w.gtag("js", new Date());
      // Google signals and ad personalization stay off for analytics use.
      w.gtag("config", id, { allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: GA_COOKIE_SECONDS });
      inject(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
    },
    update: (grants) => w.gtag?.("consent", "update", googleConsent(grants)),
    cookies: /^(_ga(_.+)?|_gid)$/,
  },
  {
    key: "clarity",
    category: "analytics",
    load(id, grants) {
      // Clarity's snippet queues the `arguments` objects too.
      // eslint-disable-next-line prefer-rest-params
      w.clarity = w.clarity || function clarity() { (w.clarity!.q = w.clarity!.q || []).push(arguments as unknown as unknown[]); };
      w.clarity("consentv2", clarityConsent(grants));
      inject(`https://www.clarity.ms/tag/${encodeURIComponent(id)}`);
    },
    update: (grants) => w.clarity?.("consentv2", clarityConsent(grants)),
    cookies: /^(_clck|_clsk)$/,
  },
];

/** Configured tools (an id on `<body>`). */
const configured = () => VENDORS.filter((v) => document.body.dataset[v.key]);
const loaded = new Set<string>();

/** Injects every configured tool whose category is granted (once per page). */
export function loadGranted(grants: Grants): void {
  for (const v of configured()) {
    if (!grants[v.category] || loaded.has(v.key)) continue;
    loaded.add(v.key);
    v.load(document.body.dataset[v.key]!, grants);
  }
}

/** Tells the loaded tools about withdrawn categories and deletes their cookies (the caller reloads). */
export function withdraw(grants: Grants, categories: string[]): void {
  for (const v of configured()) if (loaded.has(v.key)) v.update(grants);
  const patterns = VENDORS.filter((v) => categories.includes(v.category)).map((v) => v.cookies);
  const names = document.cookie.split(";").map((c) => c.split("=")[0].trim()).filter((n) => patterns.some((p) => p.test(n)));
  // Cookies live on this host or a parent domain (Google Analytics: the top domain).
  const parts = location.hostname.split(".");
  const domains = [""];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; Domain=.${parts.slice(i).join(".")}`);
  for (const n of names) for (const dom of domains) document.cookie = `${n}=; Path=/; Max-Age=0${dom}`;
}
