"""Content blocks shared by the three admin variants (same data, different layout)."""
from kit import (ANON, AUTHORS, COMMENTS, COUNTRIES, LIKES, POSTS, REFERRERS, SIGNUPS, SRC, TOP_POSTS, VIEWS, VISITORS,
                 delta, donut, fmt, hbars, ic, legend, lines, spark, src_parts, stacked_bars, total)

# (label, series, color, needs new collection)
KPIS = [
    ("新帖子", POSTS, "#7c3aed", False),
    ("发帖作者", AUTHORS, "#7c3aed", False),
    ("新用户", SIGNUPS, "#2563eb", False),
    ("点赞", LIKES, "#db2777", False),
    ("评论", COMMENTS, "#0891b2", False),
    ("浏览量", VIEWS, "#f59e0b", True),
]

NEW = '<span class="newdata">需新增采集</span>'


def kpi_value(series):
    return total(series)


def kpi_delta(series):
    d = delta(series)
    cls = "up" if d >= 0 else "dnv"
    return f'<span class="{cls}">{"▲" if d >= 0 else "▼"} {abs(d):.0f}%</span>'


def kpi_card(label, series, color, new, cls="kpi", show_spark=True):
    sp = spark(series[-14:], color) if show_spark else ""
    return (f'<div class="{cls}"><div class="kl">{label}{" " + NEW if new else ""}</div>'
            f'<div class="kv"><b>{fmt(kpi_value(series))}</b>{sp}</div>'
            f'<div class="kd">{kpi_delta(series)} <span class="muted">对比前 7 天</span></div></div>')


TODO = [
    ("flag", "r", "待处理举报", "7", "最早一条 12 分钟前", "处理"),
    ("msg", "y", "被隐藏待复核的评论", "3", "自动规则命中（以后接入）", "查看"),
    ("ban", "", "7 天内到期的封禁", "2", "到期自动解除", "查看"),
    ("plug", "y", "应用目录异常", "1", "SpamBot Pro 在 NiceMatrix 已暂停", "查看"),
    ("server", "g", "后台任务", "正常", "发布队列 0 · 清理任务 03:00 已完成", ""),
]


def todo_rows(cls="td"):
    out = []
    for icon, tone, title, n, sub, act in TODO:
        num = f'<span class="tag {tone}">{n}</span>' if tone else f'<span class="tag">{n}</span>'
        out.append(f'<div class="{cls}"><span class="tdi {tone}">{ic(icon)}</span><div><b>{title}</b><div class="muted">{sub}</div></div>'
                   f'{num}{f"<span class=btn.sm></span>" if False else ""}{f"<a class=lnk>{act} →</a>" if act else ""}</div>')
    return "".join(out)


HEALTH = [
    ("网站", "g", "v1.0.57 · 正常运行 6 天"),
    ("数据库", "g", "18 ms · 1.2 GB"),
    ("媒体存储", "g", "38.4 GB / 500 GB"),
    ("应用目录", "y", "生产接口未上线"),
    ("发布队列", "g", "0 等待 · 0 失败"),
]


def health_rows(cls="hl"):
    return "".join(f'<div class="{cls}"><span class="dot {t if t != "g" else ""}"></span><b>{n}</b><span class="muted">{s}</span></div>' for n, t, s in HEALTH)


def top_posts_table(rows=5):
    body = "".join(
        f'<tr><td><div class="tt">{t}</div><div class="muted" style="font-size:12px">{k} · {a}</div></td><td>{src}</td>'
        f'<td class="n">{fmt(l * 9 + 120)}</td><td class="n">{l}</td><td class="n">{c}</td></tr>'
        for t, k, a, l, c, src in TOP_POSTS[:rows])
    return (f'<table><tr><th>帖子</th><th>来源</th><th class="n">浏览 {NEW}</th><th class="n">点赞</th><th class="n">评论</th></tr>{body}</table>')


def source_block(size=132):
    return f'<div class="srcb">{donut(src_parts(), size)}<div style="flex:1">{legend(src_parts())}</div></div>'


def interactions_chart(w, h):
    return lines(w, h, [(LIKES, "#db2777"), (COMMENTS, "#0891b2"), (ANON, "#0891b2")], area_first=True)


def traffic_chart(w, h):
    return lines(w, h, [(VIEWS, "#f59e0b"), (VISITORS, "#7c3aed")], left=46)


def posts_chart(w, h):
    return stacked_bars(w, h)


def src_legend_inline():
    from kit import COL, SRC_NAME
    return "".join(f'<span class="li"><i style="background:{COL[k]}"></i>{SRC_NAME[k]}</span>' for k in ("intl", "cn", "web", "api"))


def countries_block():
    return hbars(COUNTRIES, "#7c3aed")


def referrers_block():
    return hbars(REFERRERS, "#f59e0b")


SHARED_CSS = """
.kl{font-size:12.5px;color:#6b7280;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.kv{display:flex;align-items:flex-end;justify-content:space-between;margin:4px 0 2px}.kv b{font-size:26px;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.kd{font-size:12px}
.tdi{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:#f3f4f6;color:#4b5563}.tdi.r{background:#fef2f2;color:#dc2626}.tdi.y{background:#fffbeb;color:#d97706}.tdi.g{background:#f0fdf4;color:#16a34a}
.lnk{color:#6d28d9;font-weight:600;font-size:12.5px;white-space:nowrap}
.srcb{display:flex;gap:18px;align-items:center}
.li{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#4b5563;margin-right:12px}.li i{width:9px;height:9px;border-radius:2px}
.tt{max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}
.hl{display:grid;grid-template-columns:14px 72px 1fr;align-items:center;font-size:13px;padding:5px 0}
"""
