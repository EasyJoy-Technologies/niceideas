// Analytics consent (src/server/share/consent.ts renders the hidden banner and puts the tool ids on
// <body>). Nothing third-party loads before "Accept": then Google Analytics 4 and Microsoft Clarity
// are injected with advertising features off. The choice lives in the `ni_consent` cookie (180 days);
// "Cookie settings" on the privacy page reopens the banner, and withdrawing deletes the analytics cookies.
(() => {
  const d = document;
  const w = window;
  const { ga4, clarity } = d.body.dataset;
  const banner = d.getElementById("ni-consent");
  if (!banner || (!ga4 && !clarity)) return;

  const NAME = "ni_consent";
  const MAX_AGE = 180 * 86400;
  // Google Analytics cookies expire after 13 months (privacy policy §5) instead of its 2-year default.
  const GA_COOKIE_SECONDS = 395 * 86400;
  const stored = () => (d.cookie.match(/(?:^|;\s*)ni_consent=(granted|denied)/) || [])[1] || null;
  const store = (value) => {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    d.cookie = `${NAME}=${value}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
  };

  const inject = (src) => {
    const s = d.createElement("script");
    s.async = true;
    s.src = src;
    d.head.appendChild(s);
  };
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    if (ga4) {
      w.dataLayer = w.dataLayer || [];
      w.gtag = function gtag() { w.dataLayer.push(arguments); };
      w.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      w.gtag("js", new Date());
      w.gtag("config", ga4, { allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: GA_COOKIE_SECONDS });
      inject(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}`);
    }
    if (clarity) {
      w.clarity = w.clarity || function c() { (w.clarity.q = w.clarity.q || []).push(arguments); };
      w.clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
      inject(`https://www.clarity.ms/tag/${encodeURIComponent(clarity)}`);
    }
  };

  // Analytics cookies live on this host or a parent domain (Google Analytics: the top domain).
  const ANALYTICS_COOKIE = /^(_ga(_.+)?|_gid|_clck|_clsk)$/;
  const forgetAnalytics = () => {
    const names = d.cookie.split(";").map((c) => c.split("=")[0].trim()).filter((n) => ANALYTICS_COOKIE.test(n));
    const parts = location.hostname.split(".");
    const domains = [""];
    for (let i = 0; i < parts.length - 1; i++) domains.push(`; Domain=.${parts.slice(i).join(".")}`);
    for (const n of names) for (const dom of domains) d.cookie = `${n}=; Path=/; Max-Age=0${dom}`;
  };

  const show = (on) => { banner.hidden = !on; };
  const choose = (value) => {
    const before = stored();
    store(value);
    show(false);
    if (value === "granted") return load();
    if (loaded || before === "granted") {
      // Withdrawal: tell Clarity, delete the cookies, reload so the vendor scripts are gone.
      if (typeof w.clarity === "function") w.clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" });
      forgetAnalytics();
      location.reload();
    }
  };

  for (const b of banner.querySelectorAll("button[data-consent]")) b.addEventListener("click", () => choose(b.dataset.consent));
  for (const b of d.querySelectorAll("[data-consent-open]")) {
    b.hidden = false;
    b.addEventListener("click", () => {
      show(true);
      banner.querySelector(`button[data-consent="${stored() || "denied"}"]`)?.focus();
    });
  }

  const choice = stored();
  if (choice === "granted") load();
  else if (!choice) show(true);
})();
