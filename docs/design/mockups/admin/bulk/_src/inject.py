# Throwaway: adds the bulk-action draft to the real admin pages.
import re, sys, shutil, os
OUT = "/tmp/bulk-admin-out"
SITE = f"{OUT}/site"
HERE = os.path.dirname(os.path.abspath(__file__))
shutil.copytree("/root/projects/niceideas/public", SITE, dirs_exist_ok=True)
shutil.copy(f"{HERE}/bulk-draft.css", f"{SITE}/styles/bulk-draft.css")
shutil.copy(f"{HERE}/bulk-draft.js", f"{SITE}/scripts/bulk-draft.js")

T = {
 "zh": dict(sel="已选 <b>{n}</b> / {t} 条", none="全选本页", pick="选择", clear="取消选择", reason="处理原因（必填）", to="改为",
            apply="应用到 {n} 条", go="应用", hintP="同一原因记入每条的审计日志；不适用的会跳过（已下架的不能再下架，可见范围只能收窄）。",
            hintC="同一原因记入每条的审计日志；不适用的会跳过。批量隐藏不带封禁，需要封禁请在单条里操作。",
            opsP=["下架帖子", "恢复帖子", "收窄可见范围"], opsC=["隐藏评论", "恢复评论"],
            vis=["有链接的人", "仅关注者", "仅朋友", "仅自己可见"], done="批量下架完成：成功 2 条 · 跳过 1 条（已下架）"),
 "en": dict(sel="<b>{n}</b> of {t} selected", none="Select all on this page", pick="Select", clear="Clear", reason="Reason (required)", to="Change to",
            apply="Apply to {n}", go="Apply", hintP="The reason goes into the audit log of each item; items it does not apply to are skipped (removed posts can't be removed again; visibility only narrows).",
            hintC="The reason goes into the audit log of each item; items it does not apply to are skipped. Bulk hide does not ban; ban from the single item.",
            opsP=["Remove post", "Restore post", "Narrow visibility"], opsC=["Hide comment", "Restore comment"],
            vis=["Anyone with the link", "Followers only", "Friends only", "Only me"], done="Bulk remove finished: 2 done · 1 skipped (already removed)"),
}

def bar(t, kind, n, total, op, vis=None, reason="", hint=True):
    ops = t["opsP"] if kind == "posts" else t["opsC"]
    opts = "".join(f'<option{" selected" if i == op else ""}>{o}</option>' for i, o in enumerate(ops))
    mixed = ' data-mixed' if 0 < n < total else ''
    checked = ' checked' if n == total else ''
    label = t["sel"].format(n=n, t=total) if n else t["none"]
    visf = ""
    if kind == "posts" and op == 2:
        vo = "".join(f'<option{" selected" if i == vis else ""}>{v}</option>' for i, v in enumerate(t["vis"]))
        visf = f'<label class="ad-row"><span>{t["to"]}</span><select class="ad-in" name="visibility">{vo}</select></label>'
    danger = op == 0
    btn = f'<button type="submit" class="ni-btn ni-btn-sm {"ad-btn-danger" if danger else "ni-btn-primary"}"{"" if n else " disabled"}>{t["apply"].format(n=n) if n else t["go"]}</button>'
    clear = f'<button type="button" class="ad-lnk ad-bulk-x">{t["clear"]}</button>' if n else ""
    hintp = f'<p class="ad-bulk-hint">{t["hintP" if kind == "posts" else "hintC"]}</p>' if hint else ""
    return (f'<form id="ad-bulk" class="ad-bulk{" on" if n else ""}" method="post" action="/admin">'
            f'<label class="ad-bulk-all"><input type="checkbox"{mixed}{checked} aria-label="{t["none"]}"><span>{label}</span></label>'
            f'<select class="ad-in" name="op" aria-label="op">{opts}</select>{visf}'
            f'<input class="ad-in ad-bulk-why" name="reason" placeholder="{t["reason"]}" value="{reason}">{btn}{clear}{hintp}</form>')

def build(src, dst, kind, lang, picks, barargs, notice=False):
    t = T[lang]
    h = open(f"{OUT}/{src}").read()
    h = h.replace('/styles/admin.css', '/styles/admin.css" ><link rel="stylesheet" href="/styles/bulk-draft.css', 1)
    h = h.replace('</head>', '<script src="/scripts/bulk-draft.js" defer></script></head>', 1)
    h = re.sub(r'\?v=[^"]*', '', h)
    h = h.replace('<thead><tr>', '<thead><tr><th class="ck"></th>', 1)
    body_start = h.find('<tbody>')
    head, rest = h[:body_start], h[body_start:]
    rows = re.split(r'(?=<tr>)', rest)
    total, nsel, out = 0, 0, []
    for r in rows:
        if not r.startswith('<tr>'):
            out.append(r); continue
        total += 1
        sel = any(p in r for p in picks)
        nsel += sel
        key = re.search(r'name="target" value="([^"]+)"', r)
        v = key.group(1) if key else ""
        r = r.replace('<tr>', f'<tr{" class=\"ad-sel\"" if sel else ""}><td class="ck"><input type="checkbox" form="ad-bulk" name="targets" value="{v}"{" checked" if sel else ""} aria-label="{t["pick"]}"></td>', 1)
        out.append(r)
    h = head + "".join(out)
    n = sum(1 for p in picks if p in h)
    h = h.replace('<section class="ad-cd ad-tbl"><table>', '<section class="ad-cd ad-tbl">' + bar(t, kind, nsel, total, **barargs) + '<table>', 1)
    if notice:
        h = h.replace('<main class="ad-ct">', f'<main class="ad-ct"><p class="ad-note ok" role="status">{t["done"]}</p>', 1)
    open(f"{SITE}/{dst}.html", "w").write(h)

for lang in ["zh", "en"]:
    spam = ["限时低价！加我微信", "限时低价！点击链接", "免费送会员"]
    build(f"posts-{lang}.html", f"posts-narrow-{lang}", "posts", lang, spam, dict(op=2, vis=3, reason="垃圾广告" if lang == "zh" else "Spam"))
    build(f"posts-{lang}.html", f"posts-remove-{lang}", "posts", lang, spam[:2], dict(op=0, reason="垃圾广告" if lang == "zh" else "Spam"))
    build(f"posts-{lang}.html", f"posts-idle-{lang}", "posts", lang, [], dict(op=0), notice=True)
    cspam = ["点这里领取红包", "加V看片"]
    build(f"comments-{lang}.html", f"comments-hide-{lang}", "comments", lang, cspam, dict(op=0, reason="垃圾广告" if lang == "zh" else "Spam"))
print("ok")
