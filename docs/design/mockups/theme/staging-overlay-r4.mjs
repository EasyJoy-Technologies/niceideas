import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const R = "/root/openclaw/workspace/niceideas/review/r4";
const B = "http://127.0.0.1:3110";
const sid = readFileSync("/tmp/pw/.sid", "utf8").trim();
const POST = "/p/czaqaadzpedktz";

const sv = (d) => `<svg class="ni-i" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const I = {
  auto: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/>'),
  light: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  dark: sv('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  check: sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  home: sv('<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  compass: sv('<circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2 6.4-6.4 2 2-6.4z"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>'),
  bell: sv('<path d="M10.3 21a2 2 0 0 0 3.4 0"/><path d="M3.3 15.3A1 1 0 0 0 4 17h16a1 1 0 0 0 .7-1.7C19.4 14 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.4 6-2.7 7.3"/>'),
  person: sv('<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>'),
  signin: sv('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>'),
  search: sv('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  close: sv('<path d="M18 6 6 18M6 6l12 12"/>'),
  burger: sv('<path d="M4 6h16M4 12h16M4 18h16"/>'),
};
const LABEL = { auto: "跟随系统", light: "浅色", dark: "深色" };

const CSS = `
.mk-ring{outline:2px dashed #f59e0b!important;outline-offset:2px;border-radius:10px}
.mk-theme{position:relative;display:inline-flex}
.mk-theme>.mk-b{display:inline-grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:.625rem;color:var(--ni-color-text-secondary)}
.mk-theme.open>.mk-b{color:var(--ni-color-primary);background:var(--mk-hover)}
.mk-pop{position:absolute;z-index:30;top:calc(100% + .5rem);inset-inline-end:0;min-width:11.5rem;padding:.375rem;background:var(--ni-color-surface);border:1px solid var(--ni-color-border);border-radius:var(--ni-radius-md);box-shadow:0 12px 32px rgb(0 0 0/.16);font-size:.875rem}
.mk-o{display:flex;align-items:center;gap:.625rem;padding:.55rem .625rem;border-radius:.5rem;color:var(--ni-color-text-primary);font-weight:500;white-space:nowrap}
.mk-o .ni-i{width:18px;height:18px}
.mk-o .mk-ck{margin-inline-start:auto;display:inline-grid}
.mk-o.on{color:var(--ni-color-primary);font-weight:600;background:var(--ni-color-surface-2)}
.mk-tab{position:fixed;left:0;right:0;bottom:0;z-index:40;height:3.875rem;background:var(--ni-color-surface);border-top:1px solid var(--ni-color-border);display:grid;align-items:center;justify-items:center;color:var(--ni-color-text-secondary)}
.mk-tab a{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:.6875rem;position:relative}
.mk-tab a.on{color:var(--ni-color-primary);font-weight:600}
.mk-tab .plus{width:2.75rem;height:2.75rem;border-radius:.875rem;background:var(--ni-color-primary-solid,#7c3aed);color:#fff;display:grid;place-items:center}
.mk-tab .bd{position:absolute;top:-3px;left:calc(50% + 4px);background:#dc2626;color:#fff;border-radius:999px;font-size:.625rem;padding:0 .3rem;line-height:1rem}
.mk-sbox{display:flex;align-items:center;gap:.5rem;margin:.25rem 1rem .75rem;padding:.6rem .875rem;border-radius:999px;background:var(--mk-input);color:#9ca3af;font-size:.875rem}
.mk-sbox .ni-i{width:18px;height:18px}
.mk-sheet-bg{position:fixed;inset:0;background:rgb(17 24 39/.45);z-index:50}
.mk-sheet{position:fixed;left:0;right:0;bottom:0;top:3.5rem;z-index:51;background:var(--ni-color-surface);border-radius:1.25rem 1.25rem 0 0;display:flex;flex-direction:column}
.mk-sheet-h{display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;border-bottom:1px solid var(--ni-color-border);font-weight:600}
.mk-sheet .ni-compose{box-shadow:none!important;border-radius:0!important;margin:0!important}
:root{--mk-hover:#f3f4f6;--mk-input:#eef0f4}
.mk-ib{display:inline-grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:.625rem;color:var(--ni-color-text-secondary)}
.mk-fh{display:flex;align-items:center;gap:.5rem}.mk-fh h1{flex:1}
.mk-sopen{display:flex;align-items:center;gap:.75rem;width:100%}.mk-sopen .mk-sbox{flex:1;margin:0;color:var(--ni-color-text-primary)}.mk-sopen a{color:var(--ni-color-text-secondary);font-size:.9375rem;white-space:nowrap}
.mk-burger summary{list-style:none}.mk-burger summary::-webkit-details-marker{display:none}
`;
const DARK = `
:root{color-scheme:dark;--ni-color-neutral:#0f1115;--ni-color-surface:#171a21;--ni-color-surface-2:#241f36;--ni-color-text-primary:#e6e8ec;--ni-color-text-secondary:#9aa1ad;--ni-color-border:#2a2f3a;--ni-color-primary:#a78bfa;--ni-color-primary-hover:#c4b5fd;--ni-shadow-card:0 1px 2px rgb(0 0 0/.4);--mk-hover:#222631;--mk-input:#1f232c}
html,body{background:#0f1115!important;color:#e6e8ec}
.ni-hdr{background:rgb(15 17 21/.86)!important}.ni-ftr{background:#171a21!important}
.ni-btn-primary{background:#7c3aed!important;color:#fff!important}
.ni-seg,.ni-compose-seg{background:#1f232c!important}
.ni-mini+.ni-mini,.ni-cmt,.ni-compose-bar{border-color:#262a33!important}
.ni-avatar,.ni-av,.ni-av-32,.ni-av-40{background:#2a2440!important;color:#c4b5fd!important}
.ni-btn-soft{background:#2a2440!important;color:#c4b5fd!important}
`;

const lib = `
window.mkTheme = (I, LABEL, cur, open, ring) => { const s = document.createElement('span'); s.className = 'mk-theme' + (open ? ' open' : '') + (ring ? ' mk-ring' : '');
  s.innerHTML = '<span class="mk-b" title="外观">' + I[cur] + '</span>' + (open ? '<div class="mk-pop">' + ['auto','light','dark'].map(k => '<div class="mk-o' + (k===cur?' on':'') + '">' + I[k] + LABEL[k] + (k===cur?'<span class="mk-ck">'+I.check+'</span>':'') + '</div>').join('') + '</div>' : ''); return s; };
window.mkHeader = (I, LABEL, cur, open, ring) => { const h = document.querySelector('.ni-hdr-in');
  h.querySelectorAll('.ni-brand source').forEach(s => s.remove()); const im = h.querySelector('.ni-brand img'); if (im) { im.style.height = '1.625rem'; if (innerWidth < 360) im.src = '/brand/mark.svg'; }
  h.querySelectorAll('.ni-hdr-nav, .ni-acct, .ni-btn').forEach(e => e.remove());
  const l = h.querySelector('.ni-lang'); l.querySelector('summary span')?.remove(); if (ring) l.classList.add('mk-ring');
  l.after(mkTheme(I, LABEL, cur, open, ring)); h.style.gap = '.25rem'; };
window.mkTabs = (I, signed, on, badge) => { const n = document.createElement('nav'); n.className = 'mk-tab';
  const items = signed ? [['home','首页'],['compass','发现'],['plus',''],['bell','通知'],['person','我']] : [['compass','发现'],['plus',''],['signin','登录']];
  n.style.gridTemplateColumns = 'repeat(' + items.length + ',1fr)';
  n.innerHTML = items.map(([i,l]) => i === 'plus' ? '<a><span class="plus">' + I.plus + '</span></a>' : '<a class="' + (l===on?'on':'') + '">' + I[i] + l + (i==='bell'&&badge?'<span class="bd">'+badge+'</span>':'') + '</a>').join('');
  document.body.append(n); document.body.style.paddingBottom = '3.875rem'; document.querySelectorAll('.ni-ftr').forEach(f => f.style.display = 'none'); };
`;
const fix = (src) => new Function("a", `${lib}; return (${src})(a);`);


const b = await chromium.launch({ executablePath: process.argv[2], args: ["--no-sandbox", "--no-proxy-server"] });
async function shot(name, url, { vw, signed = false, dark = false, act, clip, bottom = false }) {
  const c = await b.newContext({ viewport: vw, bypassCSP: true, deviceScaleFactor: 2, extraHTTPHeaders: { "accept-language": "zh-CN" } });
  if (signed) await c.addCookies([{ name: "ni_sid", value: sid, url: B }]);
  const p = await c.newPage(); await p.goto(B + url, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: CSS + (dark ? DARK : "") });
  if (dark) await p.addStyleTag({ content: ".ni-brand img[src$='lockup.svg']{content:url(/brand/lockup-dark-mock.svg)}" });
  if (act) await p.evaluate(act, { I, LABEL, dark });
  if (bottom) await p.evaluate(() => window.scrollTo(0, 1e6));
  await p.waitForTimeout(250); await p.screenshot({ path: `${R}/${name}.png`, clip }); await c.close();
}
const P = { width: 390, height: 760 };
const searchBtn = `const fh = document.querySelector('.ni-feed-h'); fh.classList.add('mk-fh'); const s = document.createElement('a'); s.className = 'mk-ib RING'; s.innerHTML = a.I.search; fh.querySelector('h1').after(s);`;
const home = (ring) => fix(`(a) => { mkHeader(a.I, a.LABEL, 'auto', false, false); mkTabs(a.I, true, '首页', '3'); document.querySelector('.ni-compose')?.remove(); ${searchBtn.replace('RING', ring ? 'mk-ring' : '')} }`);
await shot("p1-home", "/", { vw: P, signed: true, act: home(true) });
await shot("p2-discover-out", "/discover", { vw: P, act: fix(`(a) => { mkHeader(a.I, a.LABEL, 'auto', false, false); mkTabs(a.I, false, '发现'); ${searchBtn.replace('RING','')} }`) });
await shot("p3-search-open", "/discover", { vw: P, signed: true, act: fix(`(a) => { mkHeader(a.I, a.LABEL, 'auto', false, false); mkTabs(a.I, true, '发现', '3');
  const fh = document.querySelector('.ni-feed-h'); fh.innerHTML = '<div class="mk-sopen"><div class="mk-sbox">' + a.I.search + '<span>湖边</span></div><a>取消</a></div>'; }`) });
await shot("p4-home-dark", "/", { vw: P, signed: true, dark: true, act: fix(`(a) => { mkHeader(a.I, a.LABEL, 'dark', false, false); mkTabs(a.I, true, '首页', '3'); document.querySelector('.ni-compose')?.remove(); ${searchBtn.replace('RING','')} }`) });
await shot("p5-narrow-320", "/", { vw: { width: 320, height: 568 }, signed: true, act: home(false) });
const info = (open, cur) => fix(`(a) => { const h = document.querySelector('.ni-hdr-in'); h.querySelectorAll('.ni-brand source').forEach(s => s.remove());
  const im = h.querySelector('.ni-brand img'); im.style.height = '1.625rem';
  const more = document.querySelector('.ni-info-more'); const l = h.querySelector('.ni-lang'); l.querySelector('summary span')?.remove();
  l.after(mkTheme(a.I, a.LABEL, '${cur}', false, false)); more.classList.add('mk-burger'); const sm = more.querySelector('summary'); sm.innerHTML = a.I.burger; sm.className = 'mk-ib';
  sm.setAttribute('aria-label', '关于与条款'); h.append(more); more.style.display = 'block'; ${open ? "more.open = true;" : "more.classList.add('mk-ring');"}
  const ul = more.querySelector('.ni-info-more-links'); ul.style.top = 'calc(100% + .5rem)'; ul.style.bottom = 'auto'; h.style.gap = '.125rem';
  document.querySelector('.ni-info-ftr .ni-ftr-in').style.justifyContent = 'center'; }`);
await shot("i1-info", "/terms", { vw: P, act: info(false, 'auto') });
await shot("i2-info-menu", "/terms", { vw: P, act: info(true, 'auto') });
await shot("i3-info-dark", "/privacy", { vw: P, dark: true, act: info(false, 'dark') });
await b.close(); console.log("ok");
