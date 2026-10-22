"""Builds the admin mockups: three dashboard variants (A/B/C), a stats page, and the module map."""
import os
import sys

from kit import COMMENTS, LIKES, POSTS, SIGNUPS, VIEWS, fmt, ic, page, spark, total
from nav import MODULES, NAV, nav_html
from parts import (KPIS, NEW, SHARED_CSS, countries_block, health_rows, interactions_chart, kpi_card, posts_chart,
                   referrers_block, source_block, src_legend_inline, todo_rows, top_posts_table, traffic_chart)

OUT = sys.argv[1]
MARK = '<svg width="22" height="22" viewBox="0 0 24 24"><g fill="#7c3aed"><circle cx="12" cy="5" r="3.2"/><circle cx="18.5" cy="12" r="3.2" fill="#a78bfa"/><circle cx="12" cy="19" r="3.2" fill="#c4b5fd"/><circle cx="5.5" cy="12" r="3.2" fill="#8b5cf6"/></g></svg>'
RANGE = '<span class="seg"><span>今天</span><span class="on">7 天</span><span>30 天</span><span>90 天</span><span>自定义</span></span>'

# ---------------- Variant A: white sidebar + card grid ----------------
A_CSS = """
.app{width:1440px;background:#f7f8fa;border:1px solid #e5e7eb;border-radius:12px;display:grid;grid-template-columns:232px 1fr;overflow:hidden;box-shadow:0 4px 20px rgba(17,24,39,.06)}
.sb{background:#fff;border-right:1px solid #eceef1;padding:14px 12px;display:flex;flex-direction:column;gap:1px}
.brand{display:flex;align-items:center;gap:9px;padding:4px 8px 14px;font-weight:700;font-size:15px}.brand small{display:block;font-weight:500;color:#9ca3af;font-size:11px}
.ng{font-size:11.5px;color:#9ca3af;padding:12px 10px 4px}
.ni{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;color:#4b5563;font-size:13.5px}.ni span:first-of-type{flex:1}.ni.on{background:#f5f3ff;color:#6d28d9;font-weight:600}
.bd{background:#dc2626;color:#fff;border-radius:999px;font-size:11px;padding:0 6px;line-height:18px}
.me{margin-top:auto;display:flex;align-items:center;gap:9px;padding:10px 8px;border-top:1px solid #f0f1f3;font-size:13px}.av{width:30px;height:30px;border-radius:50%;background:#ede9fe;color:#6d28d9;display:grid;place-items:center;font-weight:700}
.mn{display:flex;flex-direction:column;min-width:0}
.tb{height:58px;display:flex;align-items:center;gap:12px;padding:0 24px;background:#fff;border-bottom:1px solid #eceef1}.tb h1{margin:0;font-size:18px}.tb .s{flex:1}
.srch{display:flex;align-items:center;gap:8px;border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;width:300px;color:#9ca3af;font-size:13px}
.ct{padding:20px 24px;display:grid;grid-template-columns:repeat(12,1fr);gap:16px;align-content:start}
.cd{background:#fff;border:1px solid #eceef1;border-radius:12px;padding:16px 18px;min-width:0}
.cd h2{font-size:14px;margin:0 0 12px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.k6{grid-column:span 12;display:grid;grid-template-columns:repeat(6,1fr);gap:16px}
.kpi{background:#fff;border:1px solid #eceef1;border-radius:12px;padding:14px 16px}
.td{display:grid;grid-template-columns:30px 1fr auto auto;gap:12px;align-items:center;padding:9px 0;border-bottom:1px solid #f3f4f6;font-size:13px}.td:last-child{border:0}
.tbl{padding:0;overflow:hidden}.tbl h2{padding:16px 18px 0}
"""


def variant_a():
    kpis = "".join(kpi_card(*k) for k in KPIS)
    main = (
        f'<div class="k6">{kpis}</div>'
        f'<div class="cd" style="grid-column:span 8"><h2>新帖子 · 按来源<span>{src_legend_inline()}</span></h2>{posts_chart(820, 220)}</div>'
        f'<div class="cd" style="grid-column:span 4"><h2>待处理<a class="lnk">全部 →</a></h2>{todo_rows()}</div>'
        f'<div class="cd" style="grid-column:span 4"><h2>互动趋势<span><span class="li"><i style="background:#db2777"></i>点赞</span><span class="li"><i style="background:#0891b2"></i>评论</span><span class="li"><i style="background:#0891b2;opacity:.5"></i>匿名评论</span></span></h2>{interactions_chart(400, 200)}</div>'
        f'<div class="cd" style="grid-column:span 5"><h2>内容来源</h2>{source_block(128)}</div>'
        f'<div class="cd" style="grid-column:span 3"><h2>系统健康<a class="lnk">详情 →</a></h2>{health_rows()}</div>'
        f'<div class="cd tbl" style="grid-column:span 8"><h2>热门帖子 · 近 7 天<a class="lnk">数据统计 →</a></h2>{top_posts_table()}</div>'
        f'<div class="cd" style="grid-column:span 4"><h2>访客地区 {NEW}</h2>{countries_block()}</div>'
    )
    return (f'<div class="app"><aside class="sb"><div class="brand">{MARK}<div>niceideas<small>管理后台 · 生产</small></div></div>'
            f'{nav_html("dash")}<div class="me"><div class="av">林</div><div style="flex:1">林<div class="muted" style="font-size:11.5px">管理员</div></div>{ic("ext")}</div></aside>'
            f'<div class="mn"><div class="tb"><h1>概览</h1><span class="s"></span><div class="srch">{ic("search")}搜索帖子、用户、链接…</div>{RANGE}<span class="btn">{ic("down")}导出</span></div>'
            f'<div class="ct">{main}</div></div></div>')


# ---------------- Variant B: top navigation + to-do first ----------------
B_CSS = """
.app{width:1440px;background:#f6f7f9;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 4px 20px rgba(17,24,39,.06)}
.hd{background:#fff;border-bottom:1px solid #eceef1}
.hr{height:56px;display:flex;align-items:center;gap:22px;padding:0 28px}
.brand{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px}.brand em{font-style:normal;font-weight:500;color:#9ca3af;font-size:12px}
.tn{display:flex;gap:4px;flex:1}.tn a{padding:7px 12px;border-radius:8px;color:#4b5563;font-size:13.5px;display:inline-flex;align-items:center;gap:6px}.tn a.on{background:#f5f3ff;color:#6d28d9;font-weight:600}
.bd{background:#dc2626;color:#fff;border-radius:999px;font-size:11px;padding:0 6px;line-height:18px}
.av{width:30px;height:30px;border-radius:50%;background:#ede9fe;color:#6d28d9;display:grid;place-items:center;font-weight:700}
.pg{max-width:1280px;width:100%;margin:0 auto;padding:22px 28px;display:flex;flex-direction:column;gap:18px}
.ph{display:flex;align-items:flex-end;gap:12px}.ph h1{margin:0;font-size:22px}.ph .s{flex:1}
.hi{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.ti{background:#fff;border:1px solid #eceef1;border-radius:12px;padding:12px 14px;display:flex;gap:12px;align-items:center}
.ti b{font-size:20px;display:block;line-height:1.2}.ti .muted{font-size:12px}
.ti.r{border-color:#fecaca;background:#fffafa}
.strip{background:#fff;border:1px solid #eceef1;border-radius:12px;display:grid;grid-template-columns:repeat(6,1fr)}
.strip .kpi{padding:14px 18px;border-left:1px solid #f0f1f3}.strip .kpi:first-child{border:0}
.g2{display:grid;grid-template-columns:3fr 2fr;gap:18px}.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px}
.cd{background:#fff;border:1px solid #eceef1;border-radius:12px;padding:16px 18px;min-width:0}.cd h2{font-size:14px;margin:0 0 12px;display:flex;justify-content:space-between;align-items:center}
.tbl{padding:0;overflow:hidden}.tbl h2{padding:16px 18px 0}
"""


def variant_b():
    tabs = []
    for grp, items in NAV:
        icon, label, badge, key = items[0]
        name = {"": "概览", "数据": "数据统计", "内容": "内容", "审核": "审核", "用户": "用户", "平台": "平台"}[grp]
        b = '<span class="bd">7</span>' if grp == "审核" else ""
        tabs.append(f'<a class="{"on" if grp == "" else ""}">{name}{b}</a>')
    todo = "".join(
        f'<div class="ti {"r" if i == 0 else ""}"><span class="tdi {t}">{ic(icon)}</span><div><b>{n}</b><span class="muted">{title}</span></div></div>'
        for i, (icon, t, title, n, _s, _a) in enumerate([("flag", "r", "待处理举报", "7", "", ""), ("msg", "y", "待复核评论", "3", "", ""),
                                                           ("ban", "", "封禁将到期", "2", "", ""), ("plug", "y", "应用异常", "1", "", ""),
                                                           ("server", "g", "系统正常", "5/5", "", "")]))
    kpis = "".join(kpi_card(*k, show_spark=False) for k in KPIS)
    return (f'<div class="app"><div class="hd"><div class="hr"><div class="brand">{MARK}niceideas <em>管理后台</em></div>'
            f'<nav class="tn">{"".join(tabs)}</nav><span class="muted">{ic("search")}</span><span class="muted">{ic("bell")}</span><div class="av">林</div></div></div>'
            f'<div class="pg"><div class="ph"><div><div class="muted" style="font-size:13px">10 月 22 日 星期四 · 生产环境</div><h1>早上好，林</h1></div><span class="s"></span>{RANGE}<span class="btn">{ic("down")}导出</span></div>'
            f'<div class="hi">{todo}</div>'
            f'<div class="strip">{kpis}</div>'
            f'<div class="g2"><div class="cd"><h2>新帖子 · 按来源<span>{src_legend_inline()}</span></h2>{posts_chart(700, 230)}</div>'
            f'<div class="cd"><h2>流量 {NEW}<span><span class="li"><i style="background:#f59e0b"></i>浏览</span><span class="li"><i style="background:#7c3aed"></i>访客</span></span></h2>{traffic_chart(460, 230)}</div></div>'
            f'<div class="g3"><div class="cd"><h2>内容来源</h2>{source_block(120)}</div><div class="cd"><h2>来路 {NEW}</h2>{referrers_block()}</div><div class="cd"><h2>系统健康</h2>{health_rows()}</div></div>'
            f'<div class="cd tbl"><h2>热门帖子 · 近 7 天<a class="lnk">全部 →</a></h2>{top_posts_table()}</div>'
            f'</div></div>')


# ---------------- Variant C: icon rail + right activity column ----------------
C_CSS = """
.app{width:1440px;background:#fafafa;border:1px solid #e5e7eb;border-radius:12px;display:grid;grid-template-columns:64px 1fr 340px;overflow:hidden;box-shadow:0 4px 20px rgba(17,24,39,.06)}
.rl{background:#fff;border-right:1px solid #eceef1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 0}
.rl .ni{width:40px;height:40px;border-radius:10px;display:grid;place-items:center;color:#6b7280;position:relative}.rl .ni.on{background:#f5f3ff;color:#6d28d9}
.rl .bd{position:absolute;top:3px;right:2px;background:#dc2626;color:#fff;border-radius:999px;font-size:10px;padding:0 4px;line-height:15px}
.rl .sep{width:24px;height:1px;background:#eceef1;margin:6px 0}
.mn{padding:22px 26px;display:flex;flex-direction:column;gap:16px;min-width:0}
.ph{display:flex;align-items:center;gap:12px}.ph h1{margin:0;font-size:20px}.ph .s{flex:1}
.k3{display:grid;grid-template-columns:repeat(3,1fr);gap:0;background:#fff;border:1px solid #eceef1;border-radius:12px}
.k3 .kpi{padding:14px 18px;border-left:1px solid #f0f1f3;border-top:1px solid #f0f1f3}.k3 .kpi:nth-child(3n+1){border-left:0}.k3 .kpi:nth-child(-n+3){border-top:0}
.cd{background:#fff;border:1px solid #eceef1;border-radius:12px;padding:16px 18px;min-width:0}.cd h2{font-size:14px;margin:0 0 12px;display:flex;justify-content:space-between;align-items:center}
.tabs{display:flex;gap:16px;border-bottom:1px solid #f0f1f3;margin:-4px 0 12px;font-size:13px}.tabs span{padding:6px 0;color:#6b7280}.tabs .on{color:#1f2937;font-weight:600;box-shadow:inset 0 -2px #7c3aed}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.rc{background:#fff;border-left:1px solid #eceef1;padding:22px 20px;display:flex;flex-direction:column;gap:18px;overflow:hidden}
.rc h2{font-size:13px;margin:0 0 8px;color:#374151;display:flex;justify-content:space-between}
.td{display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:12.5px}.td .lnk{display:none}.td:last-child{border:0}
.ev{display:grid;grid-template-columns:8px 1fr;gap:10px;font-size:12.5px;padding:6px 0}.ev i{width:8px;height:8px;border-radius:50%;margin-top:6px}
.tbl{padding:0;overflow:hidden}.tbl h2{padding:16px 18px 0}
"""


def variant_c():
    rail = [f'<div style="margin-bottom:10px">{MARK}</div>']
    for gi, (grp, items) in enumerate(NAV):
        if gi:
            rail.append('<span class="sep"></span>')
        for icon, label, badge, key in items:
            rail.append(f'<a class="ni{" on" if key == "dash" else ""}" title="{label}">{ic(icon, 18)}{f"<span class=bd>{badge}</span>" if badge else ""}</a>')
    kpis = "".join(kpi_card(*k) for k in KPIS)
    events = [("#dc2626", "新举报：评论“加我微信领福利…”（垃圾信息）", "12 分钟前"), ("#7c3aed", "林 下架了 /p/x7k2pq", "40 分钟前"),
              ("#2563eb", "OmniFire 首次发帖（@hk）", "2 小时前"), ("#16a34a", "30 天清理任务完成：删除 3 个帖子、41 个媒体", "03:00"),
              ("#f59e0b", "删号事件：用户 9qk2… 已完成", "昨天"), ("#7c3aed", "林 解除封禁 访客 a01b…", "昨天")]
    ev = "".join(f'<div class="ev"><i style="background:{c}"></i><div>{t}<div class="muted" style="font-size:11.5px">{w}</div></div></div>' for c, t, w in events)
    return (f'<div class="app"><nav class="rl">{"".join(rail)}</nav>'
            f'<div class="mn"><div class="ph"><h1>概览</h1><span class="tag v">生产</span><span class="s"></span>{RANGE}<span class="btn">{ic("down")}</span></div>'
            f'<div class="k3">{kpis}</div>'
            f'<div class="cd"><div class="tabs"><span class="on">内容</span><span>互动</span><span>用户</span><span>流量 {NEW}</span></div>'
            f'<h2>新帖子 · 按来源<span>{src_legend_inline()}</span></h2>{posts_chart(960, 220)}</div>'
            f'<div class="g2"><div class="cd"><h2>内容来源</h2>{source_block(116)}</div><div class="cd"><h2>访客地区 {NEW}</h2>{countries_block()}</div></div>'
            f'<div class="cd tbl"><h2>热门帖子 · 近 7 天<a class="lnk">全部 →</a></h2>{top_posts_table(4)}</div></div>'
            f'<aside class="rc"><div><h2>待处理<a class="lnk">全部</a></h2>{todo_rows()}</div>'
            f'<div><h2>系统健康</h2>{health_rows()}</div><div><h2>最近动态<a class="lnk">审计日志</a></h2>{ev}</div></aside></div>')


# ---------------- Phone dashboard (shared shape, variant accent differs slightly) ----------------
PHONE_CSS = """
.ph390{width:390px;height:844px;background:#f6f7f9;border:1px solid #e5e7eb;border-radius:28px;overflow:hidden;display:flex;flex-direction:column}
.ph390 .tp{height:54px;background:#fff;border-bottom:1px solid #eceef1;display:flex;align-items:center;gap:10px;padding:0 16px;font-weight:700}
.ph390 .bx{padding:14px;display:flex;flex-direction:column;gap:12px;overflow:hidden}
.ph390 .k2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ph390 .kpi{background:#fff;border:1px solid #eceef1;border-radius:12px;padding:10px 12px}.ph390 .kv b{font-size:20px}
.ph390 .cd{background:#fff;border:1px solid #eceef1;border-radius:12px;padding:12px 14px}.ph390 .cd h2{font-size:13px;margin:0 0 8px}
.ph390 .td{display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:12.5px}.ph390 .td .lnk{display:none}.ph390 .td:last-child{border:0}
"""


def phone():
    kp = "".join(kpi_card(*k, show_spark=False) for k in KPIS[:4])
    return (f'<div class="ph390"><div class="tp">{ic("menu", 20)}概览<span style="flex:1"></span><span class="bd" style="background:#dc2626;color:#fff;border-radius:999px;font-size:11px;padding:0 6px">7</span></div>'
            f'<div class="bx"><div class="cd"><h2>待处理</h2>{todo_rows()}</div><div class="k2">{kp}</div>'
            f'<div class="cd"><h2>新帖子 · 近 30 天</h2>{posts_chart(330, 150)}</div></div></div>')


def note(title, body):
    return f'<div class="opt"><h3>{title}</h3>{body}</div>'


A_NOTE = note("方案 A · 经典侧栏", "· 左侧白色导航，所有模块分组列出，一眼看到全貌。<br>· 概览页：上排 6 个核心指标（带近 14 天小趋势），下面是图表和列表组成的卡片网格。<br>· <b>适合</b>：模块多、经常在不同功能间切换；最常见、上手最快。<br>· <b>缺点</b>：侧栏占 232px 宽度，图表区相对小一些。")
B_NOTE = note("方案 B · 顶部导航，待办优先", "· 顶部一行一级导航（概览 / 数据统计 / 内容 / 审核 / 用户 / 平台），二级菜单在下拉里。<br>· 概览页先列出“要处理的事”（举报、待复核、封禁到期、应用异常、系统），再看指标和图表。<br>· 内容居中，最宽 1280px，读起来最舒适。<br>· <b>适合</b>：以“每天进来看一眼、处理完就走”为主。<br>· <b>缺点</b>：二级页面要多点一下。")
C_NOTE = note("方案 C · 图标栏 + 右侧动态", "· 最左只有图标（悬停显示名称），把空间都给数据。<br>· 中间是指标和可切换的图表（内容 / 互动 / 用户 / 流量），右侧固定显示待处理、系统健康和最近动态。<br>· <b>适合</b>：偏重数据分析，同时要随时留意动态。<br>· <b>缺点</b>：图标导航需要熟悉一下；屏幕窄时右栏要收起。")


def write(name, title, css, body):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(page(title, SHARED_CSS + css, body))


def main():
    intro = ('<p class="note">全部为浅色。和前台的区别在排版：前台是窄栏阅读排版，后台是宽屏、信息密集的表格和图表。'
             '三个方案用同一套数据和功能，只是布局不同。标有 <span class="newdata">需新增采集</span> 的指标（浏览量、访客、地区、来路）现在还没有记录，选定后会一起实现（只存按天聚合的计数，不存个人信息）。图中数字均为示例。</p>')
    write("dashboard-a.html", "方案 A", A_CSS + PHONE_CSS,
          f'<h1 class="sheet">管理后台 · 方案 A · 经典侧栏</h1>{intro}<div class="row"><div><div class="cap">桌面 · 概览（Dashboard）</div>{variant_a()}</div></div>'
          f'<div class="row"><div><div class="cap">手机 · 概览</div>{phone()}</div>{A_NOTE}</div>')
    write("dashboard-b.html", "方案 B", B_CSS + PHONE_CSS,
          f'<h1 class="sheet">管理后台 · 方案 B · 顶部导航，待办优先</h1>{intro}<div class="row"><div><div class="cap">桌面 · 概览（Dashboard）</div>{variant_b()}</div></div>'
          f'<div class="row"><div><div class="cap">手机 · 概览</div>{phone()}</div>{B_NOTE}</div>')
    write("dashboard-c.html", "方案 C", C_CSS + PHONE_CSS,
          f'<h1 class="sheet">管理后台 · 方案 C · 图标栏 + 右侧动态</h1>{intro}<div class="row"><div><div class="cap">桌面 · 概览（Dashboard）</div>{variant_c()}</div></div>'
          f'<div class="row"><div><div class="cap">手机 · 概览</div>{phone()}</div>{C_NOTE}</div>')


if __name__ == "__main__":
    main()
