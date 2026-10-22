"""Variant A (chosen 2026-10-22): light + dark dashboard, report queue page, theme menu in the sidebar."""
import os
import sys

from gen import A_CSS, MARK, RANGE, variant_a
from kit import ic, page
from nav import nav_html
from parts import SHARED_CSS

OUT = sys.argv[1]

HALF = ('<svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">'
        '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/></svg>')
SUN = ('<svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">'
       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>')
MOON = ('<svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">'
        '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>')
CHECK = '<svg class="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'

MORE_CSS = """
.brand{display:flex;align-items:center}.brand>div{flex:1}.thm{position:relative;margin-inline-start:auto}
.acm{position:relative}.acm>span{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:#6b7280}.acm.open>span{background:#f3f4f6}
.acm .apop{position:absolute;bottom:calc(100% + 8px);right:-6px;width:170px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:6px;box-shadow:0 12px 32px rgba(17,24,39,.14);z-index:5}
.acm .apop div{display:flex;gap:10px;align-items:center;padding:7px 10px;border-radius:8px;font-size:13px}.acm .apop .sepl{height:1px;padding:0;margin:4px 6px;background:#f0f1f3}
.thm>span{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;color:#6b7280;border:1px solid #e5e7eb;background:#fff}
.thm.open>span{color:#6d28d9;border-color:#c4b5fd}
.thm .pop{position:absolute;top:calc(100% + 8px);right:0;width:180px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:6px;box-shadow:0 12px 32px rgba(17,24,39,.14);z-index:5}
.thm .pop div{display:flex;gap:10px;align-items:center;padding:7px 10px;border-radius:8px;font-size:13px}
.thm .pop div.on{background:#f5f3ff;color:#6d28d9;font-weight:600}.thm .pop div em{margin-inline-start:auto;display:inline-grid}
.thm .pop .h{font-size:11.5px;color:#9ca3af;padding:4px 10px 2px}
.ring{outline:2px dashed #f59e0b;outline-offset:3px;border-radius:10px}
/* report queue */
.rq{grid-column:span 12;display:grid;grid-template-columns:1fr 410px;gap:16px;align-items:start}
.rq .cd{padding:0;overflow:hidden}
.flt{display:flex;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid #f0f1f3}.flt .s{flex:1}
.tabsr{display:flex;gap:18px;padding:0 16px;border-bottom:1px solid #f0f1f3;font-size:13px}.tabsr span{padding:10px 0;color:#6b7280}.tabsr .on{color:#6d28d9;font-weight:600;box-shadow:inset 0 -2px #7c3aed}
tr.sel td{background:#faf8ff}tr.sel td:first-child{box-shadow:inset 3px 0 #7c3aed}
.obj{font-weight:500;max-width:330px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.det h3{font-size:11.5px;color:#9ca3af;font-weight:600;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em}
.det .sec{padding:14px 16px;border-bottom:1px solid #f0f1f3}
.quote{border-inline-start:3px solid #e5e7eb;padding:8px 12px;background:#fafafb;border-radius:0 8px 8px 0}
.kvg{display:grid;grid-template-columns:76px 1fr;gap:6px 10px;font-size:13px}.kvg b{font-weight:400;color:#6b7280}
.chips span{display:inline-block;border:1px solid #e5e7eb;border-radius:999px;padding:2px 10px;margin:0 6px 6px 0;font-size:12px;background:#fff}
.chk{display:flex;gap:8px;align-items:center;margin:6px 0;font-size:13px}.chk input{margin:0}
.acts{padding:14px 16px;background:#fafafb}
"""

DARK_CSS = """
body.dk{background:#2b2f36}.dk .sheet{color:#f3f4f6}.dk .note,.dk .cap{color:#c9cdd4}
.dk .app{background:#0f1115;border-color:#262a33;color:#e6e8ec}
.dk .sb,.dk .tb,.dk .cd,.dk .kpi,.dk .thm>span,.dk .thm .pop,.dk .chips span{background:#171a21;border-color:#262a33;color:#e6e8ec}
.dk .sb{border-inline-end-color:#262a33}.dk .tb{border-bottom-color:#262a33}.dk .me{border-top-color:#262a33}
.dk .ni{color:#aab0bb}.dk .ni.on{background:#241f36;color:#c4b5fd}
.dk .muted,.dk .kl,.dk .ng,.dk th,.dk .brand small{color:#9aa1ad}
.dk th{background:#1b1f27}.dk td,.dk th,.dk .td,.dk .flt,.dk .tabsr,.dk .det .sec{border-color:#232730}
.dk .srch,.dk input,.dk select,.dk .seg,.dk .btn{background:#1b1f27;border-color:#2a2f3a;color:#d1d5db}
.dk .seg span{border-color:#2a2f3a;color:#aab0bb}.dk .seg .on{background:#241f36;color:#c4b5fd}
.dk .btn.p{background:#7c3aed;border-color:#7c3aed;color:#fff}.dk .btn.d{background:#dc2626;border-color:#dc2626;color:#fff}
.dk line[stroke="#eef0f3"]{stroke:#262a33}.dk .ax{fill:#6b7280}.dk .dn{fill:#e6e8ec}
.dk .hb div{background:#232730}.dk .tdi{background:#222631;color:#aab0bb}.dk .tdi.r{background:#3a1717;color:#f87171}.dk .tdi.y{background:#33270e;color:#fbbf24}.dk .tdi.g{background:#10291a;color:#4ade80}
.dk .tag{background:#232730;color:#c9cdd4}.dk .tag.r{background:#3a1717;color:#fca5a5}.dk .tag.y{background:#33270e;color:#fcd34d}.dk .tag.g{background:#10291a;color:#86efac}.dk .tag.b{background:#14223d;color:#93c5fd}.dk .tag.v{background:#241f36;color:#c4b5fd}
.dk .newdata{background:#33270e;color:#fcd34d;border-color:#b45309}
.dk .lnk{color:#c4b5fd}.dk .up{color:#4ade80}.dk .dnv{color:#f87171}
.dk .av{background:#2a2440;color:#c4b5fd}
.dk .acm .apop{background:#171a21;border-color:#262a33}.dk .acm.open>span{background:#222631}.dk .acm .apop .sepl{background:#262a33}.dk .thm.open>span{border-color:#7c3aed;color:#c4b5fd}.dk .thm .pop div.on{background:#241f36;color:#c4b5fd}
.dk tr.sel td{background:#1d1a2b}.dk .quote{background:#1b1f27;border-color:#2a2f3a}.dk .acts{background:#14171d}
.dk .brand>div{color:#f3f4f6}
"""


def theme_menu(cur, open_, ring=False):
    icon = {"auto": HALF, "light": SUN, "dark": MOON}[cur]
    pop = ""
    if open_:
        rows = "".join(f'<div class="{"on" if k == cur else ""}">{i}{n}{f"<em>{CHECK}</em>" if k == cur else ""}</div>'
                       for k, i, n in (("auto", HALF, "跟随系统"), ("light", SUN, "浅色"), ("dark", MOON, "深色")))
        pop = f'<div class="pop"><div class="h">外观</div>{rows}</div>'
    return f'<span class="thm{" open" if open_ else ""}{" ring" if ring else ""}" title="外观"><span>{icon}</span>{pop}</span>'


MORE = ('<svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/>'
        '<circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>')
ACCT_POP = ('<div class="apop"><div>' + ic("ext") + '返回网站</div><div>' + ic("users") + '我的主页</div>'
            '<div class="sepl"></div><div>' + ic("out") + '退出登录</div></div>')


def brand_row(cur, open_, ring=False):
    return ('<div class="brand">' + MARK + '<div>niceideas<small>管理后台 · 生产</small></div>' + theme_menu(cur, open_, ring) + '</div>')


def with_theme(html, cur, open_, ring=False, acct_open=False):
    # Theme switch at the top of the sidebar (brand row); the account row keeps the account menu ("…").
    old_brand = '<div class="brand">' + MARK + '<div>niceideas<small>管理后台 · 生产</small></div></div>'
    assert old_brand in html
    html = html.replace(old_brand, brand_row(cur, open_, ring), 1)
    acct = f'<span class="acm{" open" if acct_open else ""}"><span>{MORE}</span>{ACCT_POP if acct_open else ""}</span>'
    for old in (ic("ext") + "</div></aside>", theme_menu("auto", False) + "</div></aside>"):
        if old in html:
            return html.replace(old, acct + "</div></aside>", 1)
    raise AssertionError("account row not found")


def report_queue():
    rows = [
        ("💬", "“加我微信领福利，vx: ******”", "/p/k3x9qa · 评论", ("r", "垃圾信息"), 3, "匿名访客", "12 分钟前", True),
        ("📄", "秋天的第一场散步", "/p/a8f2kd · 长文章", ("y", "违法或有害"), 1, "@lin", "1 小时前", False),
        ("📝", "周末在河边拍到的晚霞，颜色比夏天还热闹…", "/p/m2q7rs · 短内容 · 2 图", ("y", "违法或有害"), 2, "@momo", "3 小时前", False),
        ("💬", "“你写的都是错的，别误导人”", "/p/a8f2kd · 评论", ("", "骚扰或仇恨"), 1, "@river", "昨天", False),
        ("📄", "独立开发第一年复盘：收入、失误和下一步", "/p/z1w0ty · 长文章 · 来自 OmniFire", ("", "其他"), 1, "@hk", "昨天", False),
    ]
    body = "".join(
        f'<tr class="{"sel" if sel else ""}"><td style="width:28px">{e}</td><td><div class="obj">{t}</div><div class="muted mono">{sub}</div></td>'
        f'<td><span class="tag {tone}">{why}</span></td><td class="n">{n}</td><td>{who}</td><td class="muted">{when}</td></tr>'
        for e, t, sub, (tone, why), n, who, when, sel in rows)
    table = (f'<div class="cd"><div class="tabsr"><span class="on">待处理 7</span><span>已处理</span><span>已驳回</span></div>'
             f'<div class="flt"><select><option>全部原因</option></select><select><option>帖子和评论</option></select><span class="s"></span><select><option>最早优先</option></select></div>'
             f'<table><tr><th></th><th>对象</th><th>原因</th><th class="n">举报</th><th>作者</th><th>最早举报</th></tr>{body}</table>'
             f'<p class="muted" style="padding:10px 16px;margin:0;font-size:12px">同一对象的多条举报合并为一行。J / K 上下切换。</p></div>')
    detail = (
        '<div class="cd det"><div class="sec" style="display:flex;justify-content:space-between;align-items:center"><b>评论 · 3 条举报</b><a class="lnk">打开帖子 ↗</a></div>'
        '<div class="sec"><h3>被举报内容</h3><div class="quote">这种东西也好意思发？加我微信领福利 vx: ******</div>'
        '<div class="kvg" style="margin-top:12px"><b>发布者</b><span>匿名访客“福利哥” <span class="tag">访客 7f3a…</span></span><b>所在帖子</b><span>秋天的第一场散步 · @lin</span>'
        '<b>发布时间</b><span>今天 09:41</span><b>该访客</b><span>近 7 天 14 条评论，被举报 5 次</span></div></div>'
        '<div class="sec"><h3>举报（3）</h3><div class="kvg"><b>垃圾信息</b><span>“刷屏广告” · 访客 · 12 分钟前</span><b>垃圾信息</b><span>— · @momo · 10 分钟前</span><b>骚扰或仇恨</b><span>— · 访客 · 6 分钟前</span></div></div>'
        '<div class="acts"><h3 style="font-size:11.5px;color:#9ca3af;margin:0 0 8px">处理</h3><div class="chips"><span>垃圾信息</span><span>违反社区准则</span><span>侵犯他人权利</span><span>重复举报</span></div>'
        '<input style="width:100%;margin:2px 0 8px" value="垃圾信息" placeholder="处理原因（必填，会记入审计日志）">'
        '<label class="chk"><input type="checkbox" checked> 同时封禁该访客 <select><option>7 天</option></select></label>'
        '<label class="chk"><input type="checkbox"> 按 IP 哈希封禁（可能误伤同一网络的人）</label>'
        '<label class="chk"><input type="checkbox" checked> 隐藏该访客的其他评论（11 条）</label>'
        '<div style="display:flex;gap:8px;margin-top:12px"><span class="btn d">隐藏评论</span><span class="btn">驳回举报</span></div></div></div>')
    main = f'<div class="rq">{table}{detail}</div>'
    return (f'<div class="app"><aside class="sb"><div class="brand">{MARK}<div>niceideas<small>管理后台 · 生产</small></div></div>'
            f'{nav_html("reports")}<div class="me"><div class="av">林</div><div style="flex:1">林<div class="muted" style="font-size:11.5px">管理员</div></div>{theme_menu("auto", False)}</div></aside>'
            f'<div class="mn"><div class="tb"><h1>举报队列</h1><span class="s"></span><div class="srch">{ic("search")}粘贴帖子链接、代码或 @handle</div></div>'
            f'<div class="ct">{main}</div></div></div>')


def write(name, title, body, dark=False):
    html = page(title, SHARED_CSS + A_CSS + MORE_CSS + DARK_CSS, body)
    if dark:
        html = html.replace("<body>", '<body class="dk">', 1)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(html)


def main():
    note = '<p class="note">方案 A。外观按钮在左栏顶部 logo 行最右边（虚线框），点开是下拉菜单，和前台用同一个设置；底部账号行只放账号菜单（⋯）。</p>'
    write("a-dashboard-light.html", "方案 A · 概览 · 浅色",
          f'<h1 class="sheet">方案 A · 概览（浅色）</h1>{note}<div class="row"><div>{with_theme(variant_a(), "auto", False, True)}</div></div>')
    write("a-dashboard-dark.html", "方案 A · 概览 · 深色",
          f'<h1 class="sheet">方案 A · 概览（深色，外观菜单展开）</h1>{note}<div class="row"><div>{with_theme(variant_a(), "dark", True)}</div></div>', dark=True)
    write("a-reports-light.html", "方案 A · 举报队列",
          f'<h1 class="sheet">方案 A · 举报队列（浅色，账号菜单展开）</h1><p class="note">左边列表，右边详情和处理。底部账号行的“⋯”是账号菜单。</p><div class="row"><div>{with_theme(report_queue(), "auto", False, False, True)}</div></div>')
    write("a-reports-dark.html", "方案 A · 举报队列 · 深色",
          f'<h1 class="sheet">方案 A · 举报队列（深色）</h1><p class="note">同一页面的深色效果。</p><div class="row"><div>{with_theme(report_queue(), "dark", False)}</div></div>', dark=True)


if __name__ == "__main__":
    main()
