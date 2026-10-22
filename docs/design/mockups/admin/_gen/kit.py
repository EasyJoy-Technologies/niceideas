"""Shared mock kit: sample data, SVG charts, icons, common CSS for the admin mockups."""
import random
from datetime import date, timedelta

random.seed(7)
DAYS = 30
END = date(2026, 10, 22)
DATES = [END - timedelta(days=DAYS - 1 - i) for i in range(DAYS)]
COL = {"intl": "#7c3aed", "cn": "#b9a2f5", "web": "#2563eb", "api": "#f59e0b"}
SRC_NAME = {"intl": "乐趣记事本 国际版", "cn": "乐趣记事本 国内版", "web": "网页", "api": "第三方应用"}


def _series(base, trend, noise):
    out = []
    for i, d in enumerate(DATES):
        weekend = 0.82 if d.weekday() >= 5 else 1.0
        out.append(max(0, round(base * (1 + trend * i / DAYS) * weekend * (1 + random.uniform(-noise, noise)))))
    return out


SRC = {"intl": _series(26, 0.55, 0.15), "cn": _series(13, 0.4, 0.2), "web": _series(6, 0.9, 0.3), "api": _series(2, 1.6, 0.5)}
POSTS = [sum(SRC[k][i] for k in SRC) for i in range(DAYS)]
AUTHORS = [round(p * 0.62 + random.uniform(-3, 3)) for p in POSTS]
SIGNUPS = _series(4, 0.8, 0.45)
LIKES = _series(210, 0.5, 0.18)
COMMENTS = _series(26, 0.5, 0.25)
ANON = [round(c * random.uniform(0.3, 0.45)) for c in COMMENTS]
VIEWS = _series(5200, 0.6, 0.15)
VISITORS = [round(v * 0.41) for v in VIEWS]


def fmt(n):
    return f"{n:,}"


def lab(i):
    d = DATES[i]
    return f"{d.month}/{d.day}"


# ---------- icons (stroke, 24 grid) ----------
_P = {
    "home": "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
    "chart": "M4 20V11M10 20V5M16 20v-8M21 20H3",
    "file": "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5",
    "msg": "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
    "image": "M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4",
    "flag": "M5 21V4M5 4h11l-2 4 2 4H5",
    "ban": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8",
    "list": "M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1",
    "users": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
    "plug": "M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4",
    "server": "M3 4h18v6H3zM3 14h18v6H3zM7 7h1M7 17h1",
    "sliders": "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
    "shield": "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
    "search": "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
    "bell": "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4",
    "down": "M12 4v12M6 12l6 6 6-6M4 20h16",
    "inbox": "M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z",
    "menu": "M4 6h16M4 12h16M4 18h16",
    "ext": "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
}


def ic(name, size=16, cls="ic"):
    return (f'<svg class="{cls}" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="{_P[name]}"/></svg>')


# ---------- charts ----------
def _grid(w, h, mx, left=34, bottom=20, top=8, steps=4):
    out = []
    for g in range(steps + 1):
        y = h - bottom - (h - bottom - top) * g / steps
        out.append(f'<line x1="{left}" x2="{w}" y1="{y:.1f}" y2="{y:.1f}" stroke="#eef0f3"/>'
                   f'<text x="{left - 6}" y="{y + 4:.1f}" class="ax" text-anchor="end">{fmt(round(mx * g / steps))}</text>')
    return out


def _nice(v):
    import math
    e = 10 ** math.floor(math.log10(v))
    for m in (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10):
        if m * e >= v:
            return m * e
    return v


def stacked_bars(w, h, keys=("intl", "cn", "web", "api"), data=SRC):
    left, bottom, top = 34, 20, 8
    n = DAYS
    mx = _nice(max(sum(data[k][i] for k in keys) for i in range(n)) * 1.05)
    bw = (w - left) / n
    out = [f'<svg class="ch" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'] + _grid(w, h, mx, left, bottom, top)
    for i in range(n):
        y = h - bottom
        for k in keys:
            bh = (h - bottom - top) * data[k][i] / mx
            y -= bh
            out.append(f'<rect x="{left + i * bw + bw * 0.18:.1f}" y="{y:.1f}" width="{bw * 0.64:.1f}" height="{bh:.1f}" fill="{COL[k]}"/>')
    for i in range(0, n - 3, 7):
        out.append(f'<text x="{left + i * bw + bw / 2:.1f}" y="{h - 4}" class="ax" text-anchor="middle">{lab(i)}</text>')
    out.append(f'<text x="{w - 2}" y="{h - 4}" class="ax" text-anchor="end">{lab(n - 1)}</text></svg>')
    return "".join(out)


def lines(w, h, series, area_first=True, left=40):
    bottom, top = 20, 8
    mx = _nice(max(max(s) for s, _ in series) * 1.08)
    n = len(series[0][0])
    sx = (w - left - 4) / (n - 1)
    out = [f'<svg class="ch" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'] + _grid(w, h, mx, left, bottom, top)
    for idx, (s, color) in enumerate(series):
        pts = [(left + i * sx, h - bottom - (h - bottom - top) * v / mx) for i, v in enumerate(s)]
        p = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        if idx == 0 and area_first:
            out.append(f'<polygon points="{left},{h - bottom} {p} {pts[-1][0]:.1f},{h - bottom}" fill="{color}" opacity=".08"/>')
        dash = ' stroke-dasharray="4 3"' if idx == 2 else ""
        out.append(f'<polyline points="{p}" fill="none" stroke="{color}" stroke-width="2"{dash}/>')
    for i in range(0, n - 3, 7):
        out.append(f'<text x="{left + i * sx:.1f}" y="{h - 4}" class="ax" text-anchor="middle">{lab(i)}</text>')
    out.append(f'<text x="{w - 4}" y="{h - 4}" class="ax" text-anchor="end">{lab(n - 1)}</text></svg>')
    return "".join(out)


def spark(values, color="#7c3aed", w=88, h=28):
    mx, mn = max(values), min(values)
    sx = w / (len(values) - 1)
    p = " ".join(f"{i * sx:.1f},{h - 3 - (h - 6) * (v - mn) / ((mx - mn) or 1):.1f}" for i, v in enumerate(values))
    return f'<svg class="sp" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><polyline points="{p}" fill="none" stroke="{color}" stroke-width="1.6"/></svg>'


def donut(parts, size=132, stroke=18):
    r = (size - stroke) / 2
    c = 2 * 3.14159 * r
    tot = sum(v for _, v, _ in parts)
    off = 0
    out = [f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}"><g transform="rotate(-90 {size / 2} {size / 2})">']
    for _, v, color in parts:
        seg = c * v / tot
        out.append(f'<circle cx="{size / 2}" cy="{size / 2}" r="{r}" fill="none" stroke="{color}" stroke-width="{stroke}" '
                   f'stroke-dasharray="{seg - 1.5:.1f} {c:.1f}" stroke-dashoffset="{-off:.1f}"/>')
        off += seg
    out.append(f'</g><text x="50%" y="48%" text-anchor="middle" class="dn">{fmt(tot)}</text>'
               f'<text x="50%" y="62%" text-anchor="middle" class="ax">近 30 天</text></svg>')
    return "".join(out)


def src_parts():
    return [(SRC_NAME[k], sum(SRC[k]), COL[k]) for k in ("intl", "cn", "web", "api")]


def legend(parts, pct=True):
    tot = sum(v for _, v, _ in parts)
    return "".join(f'<div class="lg"><i style="background:{c}"></i><span>{n}</span><b>{fmt(v)}</b>'
                   f'{f"<em>{v * 100 / tot:.0f}%</em>" if pct else ""}</div>' for n, v, c in parts)


def hbars(rows, color="#7c3aed"):
    mx = max(v for _, v in rows)
    return "".join(f'<div class="hb"><span>{n}</span><div><i style="width:{v * 100 / mx:.0f}%;background:{color}"></i></div><b>{fmt(v)}</b></div>' for n, v in rows)


def total(s, last=7):
    return sum(s[-last:])


def delta(s, last=7):
    a, b = sum(s[-last:]), sum(s[-2 * last:-last])
    return (a - b) * 100 / b


TOP_POSTS = [
    ("秋天的第一场散步", "长文章", "@lin", 214, 38, "乐趣记事本"),
    ("独立开发第一年复盘：收入、失误和下一步", "长文章", "@hk", 187, 52, "OmniFire"),
    ("周末在河边拍到的晚霞，颜色比夏天还热闹。", "短内容 · 2 图", "@momo", 162, 21, "乐趣记事本"),
    ("给新手的播客录音设备清单", "长文章 · 1 音频", "@river", 129, 17, "网页"),
    ("今天把书桌整理了一遍，效率真的高了不少", "短内容", "@ann", 98, 30, "乐趣记事本"),
]
COUNTRIES = [("中国大陆", 41210), ("美国", 18320), ("加拿大", 9120), ("中国台湾", 7480), ("日本", 6210), ("新加坡", 3920), ("其他", 21450)]
REFERRERS = [("直接访问 / App 内打开", 52100), ("微信", 21800), ("X（Twitter）", 9800), ("Google", 8400), ("Telegram", 5300), ("其他", 10300)]

BASE_CSS = """
*{box-sizing:border-box}html,body{margin:0}
body{background:#e8eaee;font:14px/1.5 Inter,-apple-system,"Segoe UI",Roboto,"PingFang SC","Noto Sans SC","WenQuanYi Zen Hei",sans-serif;color:#1f2937}
.sheet{font-size:22px;margin:28px 40px 4px}.note{margin:0 40px 18px;color:#6b7280;max-width:1100px}
.cap{font-weight:600;color:#6b7280;margin:0 0 8px;font-size:12px;letter-spacing:.02em}
.row{display:flex;gap:28px;padding:0 40px 36px;flex-wrap:wrap;align-items:flex-start}
.ic{flex:none;vertical-align:-3px}
.ch{display:block;width:100%;height:auto}.ax{font-size:10px;fill:#9ca3af}.dn{font-size:18px;font-weight:700;fill:#1f2937}
.muted{color:#6b7280}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.up{color:#15803d}.dnv{color:#dc2626}
.tag{display:inline-block;border-radius:999px;padding:0 8px;font-size:11.5px;line-height:20px;background:#f3f4f6;color:#4b5563;white-space:nowrap}
.tag.r{background:#fef2f2;color:#b91c1c}.tag.y{background:#fffbeb;color:#b45309}.tag.g{background:#f0fdf4;color:#15803d}.tag.b{background:#eff6ff;color:#1d4ed8}.tag.v{background:#f5f3ff;color:#6d28d9}
.btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #e5e7eb;background:#fff;border-radius:8px;padding:6px 12px;font-weight:600;font-size:13px;white-space:nowrap;color:#374151}
.btn.p{background:#7c3aed;border-color:#7c3aed;color:#fff}.btn.d{background:#dc2626;border-color:#dc2626;color:#fff}.btn.sm{padding:3px 9px;font-size:12px;font-weight:500}
.seg{display:inline-flex;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff}.seg span{padding:5px 11px;font-size:12.5px;color:#4b5563;border-left:1px solid #e5e7eb}.seg span:first-child{border:0}.seg .on{background:#f5f3ff;color:#6d28d9;font-weight:600}
input,select{font:inherit;font-size:13px;border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;background:#fff;color:inherit}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 12px;border-bottom:1px solid #f0f1f3;vertical-align:middle}
th{font-size:12px;color:#6b7280;font-weight:500;background:#fafafb}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.lg{display:grid;grid-template-columns:10px 1fr auto 40px;gap:8px;align-items:center;font-size:13px;margin:5px 0}.lg i{width:10px;height:10px;border-radius:3px}.lg b{font-weight:600;font-variant-numeric:tabular-nums}.lg em{font-style:normal;color:#6b7280;text-align:right}
.hb{display:grid;grid-template-columns:120px 1fr 64px;gap:10px;align-items:center;font-size:13px;margin:7px 0}.hb div{background:#f3f4f6;border-radius:4px;height:8px;overflow:hidden}.hb i{display:block;height:100%;border-radius:4px}.hb b{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
.newdata{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:#b45309;background:#fffbeb;border:1px dashed #f59e0b;border-radius:999px;padding:0 8px;line-height:20px;font-weight:500}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#16a34a;margin-right:6px}.dot.y{background:#f59e0b}.dot.r{background:#dc2626}
.opt{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;width:420px;font-size:13.5px;line-height:1.75}
.opt h3{margin:0 0 6px;font-size:15px}
"""


def page(title, css, body):
    return (f'<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><title>{title}</title>'
            f"<style>{BASE_CSS}{css}</style></head><body>{body}</body></html>")
