"""Variant A round 6 (2026-10-22): larger brand; where to put language + theme.
Option 1: right end of the top bar (global tools, every page). Option 2: a tool row above the account row in the sidebar."""
import os
import sys

from gen import A_CSS, MARK, variant_a
from kit import ic, page
from parts import SHARED_CSS
from variant_a_more import (ACCT_POP, CHECK, DARK_CSS, GLOBE, HALF, LANGS, MOON, MORE, MORE_CSS, SUN, report_queue,
                            theme_menu)

OUT = sys.argv[1]

R6_CSS = """
.brand{gap:12px;padding:6px 8px 18px;font-size:20px;line-height:1.1}.brand .mk{width:36px;height:36px}
.brand small{font-size:12px;margin-top:3px}
.tools{display:flex;align-items:center;gap:2px;padding-inline-start:10px;margin-inline-start:2px;border-inline-start:1px solid #eceef1}
.tb .thm{margin:0;position:relative}.tb .thm>span{width:34px;height:34px}
.tb .thm .pop{top:calc(100% + 8px);bottom:auto;right:0;left:auto}.tb .thm .pop.lp{width:200px}
.ut{display:flex;gap:4px;padding:6px 0 8px;margin-top:auto}.ut+.me{margin-top:0}
.ub{position:relative;flex:1;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;color:#4b5563;font-size:13px;white-space:nowrap}
.ub:hover,.ub.open{background:#f3f4f6}.ub .ic{width:18px;height:18px;flex:none}
.ub .pop{position:absolute;bottom:calc(100% + 6px);left:0;width:190px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:6px;box-shadow:0 12px 32px rgba(17,24,39,.14);z-index:5}
.ub .pop div{display:flex;gap:10px;align-items:center;padding:7px 10px;border-radius:8px}.ub .pop div.on{background:#f5f3ff;color:#6d28d9;font-weight:600}.ub .pop em{margin-inline-start:auto;display:inline-grid}
.dk .tools{border-color:#262a33}.dk .ub{color:#aab0bb}.dk .ub.open,.dk .ub:hover{background:#222631}
.dk .ub .pop{background:#171a21;border-color:#262a33}.dk .ub .pop div.on{background:#241f36;color:#c4b5fd}
"""

OLD_BRAND = '<div class="brand">' + MARK + '<div>niceideas<small>管理后台 · 生产</small></div></div>'


def lang_btn(open_):
    pop = ""
    if open_:
        rows = "".join(f'<div class="{"on" if n == "简体中文" else ""}">{n}{f"<em>{CHECK}</em>" if n == "简体中文" else ""}</div>' for n in LANGS)
        pop = f'<div class="pop lp"><div class="h">语言 · 共 40 种</div>{rows}<div class="mo">更多语言…</div></div>'
    return f'<span class="thm lng{" open" if open_ else ""}" title="语言"><span>{GLOBE}</span>{pop}</span>'


def account(html, acct_open=False):
    acct = f'<span class="acm{" open" if acct_open else ""}"><span>{MORE}</span>{ACCT_POP if acct_open else ""}</span>'
    for old in (ic("ext") + "</div></aside>", theme_menu("auto", False) + "</div></aside>"):
        if old in html:
            return html.replace(old, acct + "</div></aside>", 1)
    raise AssertionError("account row not found")


def option1(html, cur="auto", lang_open=False, theme_open=False, ring=False):
    """Language + theme at the right end of the top bar, after a thin divider."""
    tools = f'<span class="tools{" ring" if ring else ""}">{lang_btn(lang_open)}{theme_menu(cur, theme_open)}</span>'
    assert OLD_BRAND in html and '</div><div class="ct">' in html
    html = html.replace('</div><div class="ct">', tools + '</div><div class="ct">', 1)
    return account(html)


def option2(html, cur="auto", theme_open=False, ring=False):
    """A tool row (language, theme with labels) directly above the account row."""
    icon = {"auto": HALF, "light": SUN, "dark": MOON}[cur]
    label = {"auto": "跟随系统", "light": "浅色", "dark": "深色"}[cur]
    pop = ""
    if theme_open:
        rows = "".join(f'<div class="{"on" if k == cur else ""}">{i}{n}{f"<em>{CHECK}</em>" if k == cur else ""}</div>'
                       for k, i, n in (("auto", HALF, "跟随系统"), ("light", SUN, "浅色"), ("dark", MOON, "深色")))
        pop = f'<div class="pop">{rows}</div>'
    row = (f'<div class="ut{" ring" if ring else ""}"><span class="ub">{GLOBE}简体中文</span>'
           f'<span class="ub{" open" if theme_open else ""}">{icon}{label}{pop}</span></div>')
    html = account(html)
    return html.replace('<div class="me">', row + '<div class="me">', 1)


def write(name, title, note, body, dark=False):
    html = page(title, SHARED_CSS + A_CSS + MORE_CSS + DARK_CSS + R6_CSS, f'<h1 class="sheet">{title}</h1><p class="note">{note}</p><div class="row"><div>{body}</div></div>')
    if dark:
        html = html.replace("<body>", '<body class="dk">', 1)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(html)


def main():
    n1 = "方案一：语言和外观放在顶栏最右边，用细竖线和页面自己的操作（搜索、时间范围、导出）隔开。每个页面都在同一位置。"
    n2 = "方案二：语言和外观带文字，放在账号行上面一行，和导航项同样的样式。"
    write("r6-opt1-light.html", "方案一 · 顶栏右侧（浅色）", n1, option1(variant_a(), ring=True))
    write("r6-opt1-lang.html", "方案一 · 语言菜单展开", n1, option1(variant_a(), lang_open=True))
    write("r6-opt1-dark.html", "方案一 · 深色（外观菜单展开）", n1, option1(variant_a(), "dark", theme_open=True), dark=True)
    write("r6-opt1-reports.html", "方案一 · 举报队列", n1, option1(report_queue()))
    write("r6-opt2-light.html", "方案二 · 账号行上方（浅色）", n2, option2(variant_a(), ring=True))
    write("r6-opt2-open.html", "方案二 · 外观菜单展开", n2, option2(variant_a(), theme_open=True))


if __name__ == "__main__":
    main()
