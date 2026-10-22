"""Stats page (数据统计) and the module map, rendered in the variant-A shell (content is the same in every variant)."""
import os
import sys

from gen import A_CSS, MARK, RANGE
from kit import (AUTHORS, COMMENTS, LIKES, POSTS, SIGNUPS, SRC, VIEWS, VISITORS, fmt, hbars, ic, lines, page, total)
from nav import MODULES, nav_html
from parts import NEW, SHARED_CSS, countries_block, kpi_card, posts_chart, referrers_block, source_block, src_legend_inline, traffic_chart

OUT = sys.argv[1]
CSS = A_CSS + """
.tabs2{grid-column:span 12;display:flex;gap:4px;border-bottom:1px solid #eceef1;margin-bottom:-4px}.tabs2 span{padding:8px 14px;color:#6b7280;font-size:13.5px}.tabs2 .on{color:#6d28d9;font-weight:600;box-shadow:inset 0 -2px #7c3aed}
.fl{grid-column:span 12;display:flex;gap:10px;align-items:center}.fl .s{flex:1}
.k4{grid-column:span 12;display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.ret td{text-align:center;font-size:12px;padding:6px 4px;border:1px solid #fff}.ret th{text-align:center}
.mods{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:0 40px 40px;width:1440px}
.mod{background:#fff;border:1px solid #eceef1;border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.65}.mod b{font-size:14px;display:block;margin-bottom:4px}
"""
SHELL = ('<div class="app"><aside class="sb"><div class="brand">' + MARK + '<div>niceideas<small>管理后台 · 生产</small></div></div>{nav}'
         '<div class="me"><div class="av">林</div><div style="flex:1">林<div class="muted" style="font-size:11.5px">管理员</div></div></div></aside>'
         '<div class="mn"><div class="tb"><h1>{title}</h1><span class="s"></span>{right}</div><div class="ct">{body}</div></div></div>')


def retention():
    weeks = ["9/22 周", "9/29 周", "10/6 周", "10/13 周"]
    data = [[100, 46, 38, 33], [100, 49, 40, None], [100, 52, None, None], [100, None, None, None]]
    rows = []
    for w, r in zip(weeks, data):
        cells = "".join(f'<td style="background:rgba(124,58,237,{v / 110:.2f});color:{"#fff" if v > 60 else "#1f2937"}">{v}%</td>' if v is not None else '<td style="background:#fafafb"></td>' for v in r)
        rows.append(f"<tr><td style='text-align:left'>{w}</td>{cells}</tr>")
    return f'<table class="ret"><tr><th style="text-align:left">首次发帖</th><th>当周</th><th>+1 周</th><th>+2 周</th><th>+3 周</th></tr>{"".join(rows)}</table>'


def stats():
    kp = "".join(kpi_card(*k) for k in [("新帖子", POSTS, "#7c3aed", False), ("发帖作者", AUTHORS, "#7c3aed", False), ("新用户", SIGNUPS, "#2563eb", False), ("浏览量", VIEWS, "#f59e0b", True)])
    apps = hbars([("乐趣记事本 国际版", sum(SRC["intl"])), ("乐趣记事本 国内版", sum(SRC["cn"])), ("OmniFire", sum(SRC["api"]))], "#2563eb")
    kinds = hbars([("短内容", 1012), ("短内容 · 带图", 388), ("长文章", 305)], "#7c3aed")
    body = (
        '<div class="tabs2"><span class="on">内容</span><span>互动</span><span>用户与增长</span><span>流量 ' + NEW + '</span><span>接入应用</span></div>'
        f'<div class="fl"><select><option>全部来源</option></select><select><option>全部类型</option></select><select><option>按天</option><option>按周</option><option>按月</option></select><span class="s"></span>{RANGE}<span class="btn">{ic("down")}导出 CSV</span></div>'
        f'<div class="k4">{kp}</div>'
        f'<div class="cd" style="grid-column:span 12"><h2>新帖子 · 按来源<span>{src_legend_inline()}</span></h2>{posts_chart(1130, 240)}</div>'
        f'<div class="cd" style="grid-column:span 4"><h2>来源占比</h2>{source_block(120)}</div>'
        f'<div class="cd" style="grid-column:span 4"><h2>类型</h2>{kinds}<p class="muted" style="font-size:12px;margin:10px 0 0">媒体：图片 2,140 张 · 音频 96 段 · 新增存储 6.8 GB</p></div>'
        f'<div class="cd" style="grid-column:span 4"><h2>发帖作者留存</h2>{retention()}</div>'
        f'<div class="cd" style="grid-column:span 6"><h2>流量 {NEW}<span><span class="li"><i style="background:#f59e0b"></i>浏览</span><span class="li"><i style="background:#7c3aed"></i>访客</span></span></h2>{traffic_chart(540, 200)}</div>'
        f'<div class="cd" style="grid-column:span 3"><h2>来路 {NEW}</h2>{referrers_block()}</div>'
        f'<div class="cd" style="grid-column:span 3"><h2>访客地区 {NEW}</h2>{countries_block()}</div>'
    )
    return SHELL.format(nav=nav_html("stats"), title="数据统计", right='<span class="muted" style="font-size:12px">数据每小时更新 · 时区 America/Edmonton</span>', body=body)


def main():
    note = ('<p class="note">数据统计页的内容在三个方案里一样，这里用方案 A 的外框展示。分五个标签：内容、互动、用户与增长、流量、接入应用；都能选时间范围、按天/周/月，并导出 CSV。'
            '流量类数据（<span class="newdata">需新增采集</span>）只存按天、按帖子聚合的计数，不存 IP 或个人信息。</p>')
    mods = "".join(f'<div class="mod"><b>{n}</b>{d}</div>' for n, d in MODULES)
    body = (f'<h1 class="sheet">管理后台 · 数据统计页 + 全部功能</h1>{note}<div class="row"><div><div class="cap">桌面 · 数据统计（内容标签）</div>{stats()}</div></div>'
            f'<h1 class="sheet" style="font-size:18px">全部功能（13 个模块）</h1><p class="note">左侧导航的每一项都是一个页面。权限分三级：管理员（全部）、审核员（内容、审核）、只读（概览、数据统计）。所有修改操作都要写原因并记入审计日志。</p><div class="mods">{mods}</div>')
    with open(os.path.join(OUT, "stats-and-modules.html"), "w", encoding="utf-8") as f:
        f.write(page("数据统计 + 全部功能", SHARED_CSS + CSS, body))


if __name__ == "__main__":
    main()
