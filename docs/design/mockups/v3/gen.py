"""v3 drafts: wide three-column shell (signed out / signed in), language menu, long-article page. Reuses v2 helpers."""
import re
src = open("../v2/gen.py").read()
exec(src[:src.index("PAGES =")])
LOCK = '<img class="lockup" src="../../../../public/brand/lockup.svg" alt="NiceIdeas">'
def fix(h): return h.replace('src="assets/', 'src="../v2/assets/').replace('url(assets/', 'url(../v2/assets/')
def page(title, body, mobile=False):
    return ('<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{title}</title><link rel="stylesheet" href="../v2/ui.css"><link rel="stylesheet" href="../v2/layout.css"><link rel="stylesheet" href="v3.css"></head>'
            f'<body{" class=\"m\"" if mobile else ""}>{fix(body)}</body></html>')
SRC_R = '<span class="src-r"><img src="assets/nicenote.png" alt="">来自 乐趣记事本</span>'
def cards():
    h = feed_cards()
    h = re.sub(r'<div class="meta" style="margin-top:8px">.*?</div>', '', h)
    h = h.replace('</span></div></div>', '</span></div>' + SRC_R + '</div>')
    return h
LANGS = ["简体中文","繁體中文","English","日本語","한국어","Español","Français","Deutsch","Português","Русский"]
def lang(open_=False):
    menu = ('<div class="langmenu">' + "".join(f'<div class="{"cur" if i==0 else ""}">{l}</div>' for i,l in enumerate(LANGS)) + '</div>') if open_ else ""
    return f'<span class="langbtn">{ic("globe")}简体中文 ▾{menu}</span>'
def rail(signed_in, active="发现"):
    if signed_in:
        items = [("home","首页",""),("compass","发现",""),("bell","通知",'<span class="badge">3</span>'),("user","我的主页",""),("settings","设置","")]
        nav = "".join(f'<a class="nav{" on" if n==active else ""}" href="#">{ic(i)}{n}{b}</a>' for i,n,b in items)
        bottom = f'<div class="me"><img class="avatar" src="assets/avatar.webp" width="40" height="40" alt=""><div class="who"><div class="name">林小舟</div><div class="handle">@linxiaozhou</div></div>{ic("more")}</div>'
        return f'<aside class="rail">{LOCK}{nav}<span class="btn btn-primary btn-post">{ic("plus")}发布</span><div class="rail-bottom">{bottom}</div></aside>'
    nav = f'<a class="nav on" href="#">{ic("compass")}发现</a><a class="nav" href="#">{ic("search")}搜索</a>'
    bottom = '<div class="card signin"><p>登录后可以关注作者、发布想法、收到回复通知。</p><span class="btn btn-primary">登录 / 注册</span></div>'
    return f'<aside class="rail">{LOCK}{nav}<div class="rail-bottom">{bottom}</div></aside>'
def foot(open_=False):
    return (f'<div class="aside-foot"><div class="links"><a>关于 NiceIdeas</a><a>社区准则</a><a>使用条款</a><a>隐私政策</a><a>帮助</a></div>'
            f'<div class="row">{lang(open_)}<span>© 2026 NiceIdeas</span></div></div>')
def suggest():
    sug = "".join(f'<div class="sug"><img class="avatar" src="assets/av{i}.webp" width="38" height="38" alt=""><div class="who"><div class="name">{n}</div><div class="handle">@{h}</div></div><span class="btn btn-secondary btn-sm">关注</span></div>' for i,n,h in [(4,"小满","xiaoman"),(5,"Momo 的手账","momo"),(3,"阿森","asen")])
    return f'<div class="card box"><h3>推荐作者<a>更多</a></h3>{sug}</div>'
def hot():
    items = [("lake","周末去湖边：一份慢下来的清单","林小舟 · 128 赞"),("autumn","秋天的十个小仪式","小满 · 96 赞"),("flower","把花田装进手账","Momo 的手账 · 74 赞")]
    return '<div class="card box"><h3>热门长文</h3>' + "".join(f'<div class="hot"><img src="assets/{a}.webp" alt=""><div>{t}<span>{m}</span></div></div>' for a,t,m in items) + '</div>'
def aside(open_=False, extra=None):
    mid = extra if extra is not None else suggest() + hot()
    return f'<aside class="aside3"><div class="search">{ic("search")}搜索 NiceIdeas</div>{mid}{foot(open_)}</aside>'
def discover(signed_in=False, open_=False):
    h = '<div class="main-h"><h1>发现</h1><div class="seg"><span class="on">全部</span><span>长文</span><span>图片</span></div></div>'
    return page("发现", f'<div class="shell3">{rail(signed_in)}<main class="main">{h}{cards()}</main>{aside(open_)}</div>')
def article_main():
    follow = '<span class="btn btn-secondary btn-sm">关注</span>'
    return (f'<article class="card art"><div class="author"><img class="avatar" src="assets/avatar.webp" alt=""><div class="who"><div class="name">林小舟</div>'
            f'<div class="handle">@linxiaozhou<i class="dot"></i>10月19日 16:20<i class="dot"></i>阅读约 3 分钟</div></div>{follow}</div>'
            f'<h1>周末去湖边：一份慢下来的清单</h1>{ARTICLE_BODY}'
            f'<div class="art-end">{SRC}<span>编辑于 10月19日 18:05</span></div>{actions("128","12",liked=True)}</article>{comments_block()}')
def article(scrolled=False):
    card = ('<div class="card authorcard"><div class="top"><img class="avatar" src="assets/avatar.webp" alt=""><div class="who"><div class="name">林小舟</div><div class="handle">@linxiaozhou</div></div></div>'
            '<p>喜欢散步、记录和慢慢生活。用乐趣记事本写下每一个小想法。</p><div class="st"><span><b>42</b> 帖子</span><span><b>1.2k</b> 粉丝</span><span><b>3.4k</b> 获赞</span></div>'
            '<span class="btn btn-secondary btn-sm">关注</span></div>')
    more = ('<div class="card box"><h3>作者的其他长文<a>全部</a></h3>' + "".join(f'<div class="hot"><img src="assets/{a}.webp" alt=""><div>{t}<span>{m}</span></div></div>' for a,t,m in [("flower","傍晚的花田","上周 · 88 赞"),("sea","海边的秋天","10月3日 · 56 赞")]) + '</div>')
    back = f'<div class="back">← 长文</div>'
    return page("长文", f'<div class="shell3">{rail(False)}<main class="main">{back}{article_main()}</main>{aside(extra=card+more)}</div>')
def article_m():
    hdr = '<header class="m-hdr"><img src="../../../../public/brand/mark.svg" width="28" height="28" alt=""><span class="btn btn-primary btn-sm">登录 / 注册</span></header>'
    a = article_main().replace('<span class="btn btn-secondary btn-sm">关注</span></div>\n<h1>', '</div><h1>', 1)
    bar = f'<nav class="m-bar"><a class="act liked" href="#">{ic("heart")}128</a><a class="act" href="#">{ic("msg")}12</a><a class="act" href="#">{ic("share")}分享</a></nav>'
    ftr = ('<footer class="ftr"><div class="ftr-in" style="padding:14px 16px 72px;gap:8px">'
           f'<div style="display:flex;align-items:center;gap:10px">{LOCK.replace("class=\"lockup\"", "class=\"lockup-s\"")}<span style="font-size:12px;color:var(--muted)">随时随地分享你的好主意！</span></div>'
           '<div class="ftr-links" style="font-size:12px;gap:4px 14px"><a>关于 NiceIdeas</a><a>社区准则</a><a>使用条款</a><a>隐私政策</a><a>帮助</a></div>'
           f'<div class="ftr-meta" style="border:0;padding:0"><span>© 2026 NiceIdeas</span>{lang()}</div></div></footer>')
    return page("长文", f'{hdr}<main class="post-wrap">{a}</main>{ftr}{bar}', mobile=True)
PAGES3 = {"discover-out": discover(), "discover-in": discover(True), "discover-lang": discover(open_=True), "article": article(), "article-m": article_m()}
for k, v in PAGES3.items(): open(f"{k}.html", "w").write(v)
print("ok")
