"""Generates the v2 page mockups (static HTML for review; not product code)."""
P = {
 "heart": '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
 "msg": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
 "share": '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>',
 "more": '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
 "home": '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
 "compass": '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>',
 "bell": '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
 "user": '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
 "search": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
 "settings": '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
 "plus": '<path d="M12 5v14M5 12h14"/>',
 "globe": '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
 "ext": '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
 "music": '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
 "play": '<polygon points="7 4 19 12 7 20 7 4"/>',
 "image": '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
 "mic": '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
 "doc": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8M16 13H8M16 17H8"/>',
 "cal": '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
 "link": '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
 "edit": '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
 "anon": '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
}
def ic(n, cls="i"): return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true">{P[n]}</svg>'
I = '<svg class="capI" viewBox="0 0 34 73" aria-hidden="true"><path d="M2 0h30v11H23v51h9v11H2V62h9V11H2z" fill="currentColor"/></svg>'
LOGO = "assets/logo-a-bloom.svg"
def brand(link=True):
    inner = f'<img src="{LOGO}" alt=""><span>Nice<b>{I}deas</b></span>'
    return f'<a class="brand" href="#">{inner}</a>' if link else f'<span class="brand">{inner}</span>'
SRC = f'<a class="source" href="https://enp.ej-mobile.cn" target="_blank" rel="noopener"><img src="assets/nicenote.png" alt="">来自 乐趣记事本 {ic("ext")}</a>'
SRC_INLINE = '<span class="src-inline"><img src="assets/nicenote.png" alt="">来自 乐趣记事本</span>'
def head(title): return f'<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title><link rel="stylesheet" href="ui.css"><link rel="stylesheet" href="layout.css"></head>'
def actions(likes, comments, liked=False, extra=""):
    return (f'<div class="actions"><a class="act{" liked" if liked else ""}" href="#">{ic("heart")}{likes}</a>'
            f'<a class="act" href="#">{ic("msg")}{comments}</a><a class="act" href="#">{ic("share")}分享</a><span class="act-sp"></span>{extra}<a class="act" href="#" aria-label="更多">{ic("more")}</a></div>')

ARTICLE_BODY = f'''<div class="ni-body">
<div class="ni-text"><p>早上七点出发，路上的雾还没散。到湖边时太阳刚好从山后面出来，水面一下子亮了。</p><p>这次没有赶行程，只给自己列了几件想做的小事。</p></div>
<figure class="ni-image"><img src="assets/lake.webp" alt=""><figcaption>清晨的湖面</figcaption></figure>
<ul class="ni-todo"><li class="ni-done"><label><input type="checkbox" disabled checked><span>沿着湖走一圈</span></label></li><li class="ni-done"><label><input type="checkbox" disabled checked><span>在码头喝一杯热咖啡</span></label></li><li><label><input type="checkbox" disabled><span>录一段风吹芦苇的声音</span></label></li></ul>
<figure class="ni-audio"><figcaption>{ic("music")}湖边的风</figcaption><div class="player"><span class="pp">{ic("play")}</span>0:42<span class="bar"><i></i></span>1:58</div></figure>
<div class="ni-text"><h2>回来的路上</h2><p>路过一片花田，停车拍了好久。<a href="#">这条路线</a>以后还想再走一次。</p><blockquote><p>慢一点，也能走很远。</p></blockquote></div>
</div>'''

def c_actions(likes):
    return (f'<div class="actions"><a class="act" href="#">{ic("heart")}{likes}</a><a class="act" href="#">{ic("msg")}回复</a>'
            f'<span class="act-sp"></span><a class="act" href="#" aria-label="更多">{ic("more")}</a></div>')

def comments_block():
    return f'''<section class="card comments"><h2>评论 <span>12</span></h2>
<div class="composer"><div class="ta">写下你的想法…</div><div class="row"><span class="input">昵称（可选）</span>
<span class="hint">以匿名访客身份发表 · <a href="#">登录</a>后以你的账号评论</span><span class="btn btn-primary btn-sm">发表</span></div></div>
<div class="cmt"><img class="avatar" src="assets/av2.webp" width="36" height="36" alt=""><div class="body"><div class="top"><span class="name">周一一</span><span class="meta">2 小时前</span></div>
<p>好喜欢这种不赶路的旅行！请问湖边的码头咖啡要排队吗？</p>{c_actions("3")}
<div class="cmt reply"><img class="avatar" src="assets/avatar.webp" width="30" height="30" alt=""><div class="body"><div class="top"><span class="name">林小舟</span><span class="tag author">作者</span><span class="meta">1 小时前</span></div><p>早上人很少，基本不用排队～</p></div></div></div></div>
<div class="cmt"><span class="anon">{ic("anon")}</span><div class="body"><div class="top"><span class="name">路过的猫</span><span class="tag">匿名</span><span class="meta">35 分钟前</span></div>
<p>照片里的光线太好看了，是用手机拍的吗？</p>{c_actions("1")}</div></div>
<div class="cmt"><span class="anon">{ic("anon")}</span><div class="body"><div class="top"><span class="name">匿名访客</span><span class="tag">匿名</span><span class="meta">10 分钟前</span></div>
<p>收藏了这条路线，周末也去走走。</p>{c_actions("")}</div></div>
<a class="more-c" href="#">查看全部 12 条评论</a></section>'''

def footer(cn=False):
    links = "" if cn else '<div class="ftr-links"><a href="#">关于 NiceIdeas</a><a href="#">社区准则</a><a href="#">使用条款</a><a href="#">隐私政策</a><a href="#">帮助</a><a href="https://enp.ej-mobile.cn">下载乐趣记事本</a></div>'
    return f'''<footer class="ftr"><div class="ftr-in"><div class="ftr-brand">{brand(not cn)}<p>随时随地分享你的好主意！</p></div>{links}
<div class="ftr-meta"><span>© 2026 NiceIdeas · 版本 1.0.7</span><span class="lang">{ic("globe")}简体中文</span></div></div></footer>'''

def post_page(mobile=False, cn=False):
    if mobile:
        right = "" if cn else '<span class="btn btn-primary btn-sm">打开 NiceIdeas</span>'
        hdr = f'<header class="m-hdr">{brand(not cn)}{right}</header>'
    else:
        right = f'<span class="lang">{ic("globe")}简体中文</span>' + ("" if cn else '<span class="btn btn-ghost btn-sm">登录</span><span class="btn btn-primary btn-sm">加入 NiceIdeas</span>')
        hdr = f'<header class="hdr"><div class="hdr-in">{brand(not cn)}<span class="hdr-sp"></span><div class="hdr-act">{right}</div></div></header>'
    follow = "" if cn else '<span class="btn btn-secondary btn-sm">关注</span>'
    body = f'''{hdr}<main class="post-wrap"><article class="card post">
<div class="author"><img class="avatar" src="assets/avatar.webp" width="44" height="44" alt=""><div class="who"><div class="name">林小舟</div><div class="handle">@linxiaozhou<i class="dot"></i>10月19日 16:20</div></div>{follow}</div>
<div class="src-row">{SRC}</div>
<h1>周末去湖边：一份慢下来的清单</h1>{ARTICLE_BODY}
<div class="updated">编辑于 10月19日 18:05</div>{actions("128","12",liked=True)}</article>
{comments_block()}</main>{footer(cn)}'''
    if mobile:
        body += f'<nav class="m-bar"><a class="act liked" href="#">{ic("heart")}128</a><a class="act" href="#">{ic("msg")}12</a><a class="act" href="#">{ic("share")}分享</a></nav>'
    cls = ' class="m"' if mobile else ""
    return head("周末去湖边 · NiceIdeas") + f"<body{cls}>{body}</body></html>"

def feed_cards(own=False):
    if own:
        return f'''
<article class="card feed-card"><div class="fc-head"><img class="avatar" src="assets/avatar.webp" width="40" height="40" alt=""><div class="who"><span class="name">林小舟</span> <span class="handle">@linxiaozhou<i class="dot"></i>2 小时前</span></div></div>
<a class="article" href="#"><img src="assets/lake.webp" alt=""><div class="t"><div class="kind">长文</div><h3>周末去湖边：一份慢下来的清单</h3><p>早上七点出发，路上的雾还没散。到湖边时太阳刚好从山后面出来，水面一下子亮了。这次没有赶行程，只给自己列了几件想做的小事……</p><div class="rt">阅读约 3 分钟 · 4 张图片 · 1 段音频</div></div></a>
<div class="meta" style="margin-top:8px">{SRC_INLINE}</div>{actions("128","12",liked=True)}</article>
<article class="card feed-card"><div class="fc-head"><img class="avatar" src="assets/avatar.webp" width="40" height="40" alt=""><div class="who"><span class="name">林小舟</span> <span class="handle">@linxiaozhou<i class="dot"></i>3 天前</span></div></div>
<p class="fc-text">今天的待办全部完成 ✓ 给自己奖励一杯热可可。</p>
<div class="meta" style="margin-top:8px">{SRC_INLINE}</div>{actions("36","4")}</article>
<article class="card feed-card"><div class="fc-head"><img class="avatar" src="assets/avatar.webp" width="40" height="40" alt=""><div class="who"><span class="name">林小舟</span> <span class="handle">@linxiaozhou<i class="dot"></i>上周</span></div></div>
<p class="fc-text">傍晚的花田。</p><div class="fc-imgs"><img src="assets/flower.webp" alt=""><img src="assets/autumn.webp" alt=""></div>
<div class="meta" style="margin-top:8px">{SRC_INLINE}</div>{actions("88","9")}</article>'''
    return f'''
<article class="card feed-card"><div class="fc-head"><img class="avatar" src="assets/av2.webp" width="40" height="40" alt=""><div class="who"><span class="name">周一一</span> <span class="handle">@zhouyiyi<i class="dot"></i>5 分钟前</span></div></div>
<p class="fc-text">好的想法常常出现在散步的时候。今天把三个零散的念头连成了一条线，回家第一件事就是把它记下来。</p>
<div class="meta" style="margin-top:8px">{SRC_INLINE}</div>{actions("24","3")}</article>
<article class="card feed-card"><div class="fc-head"><img class="avatar" src="assets/avatar.webp" width="40" height="40" alt=""><div class="who"><span class="name">林小舟</span> <span class="handle">@linxiaozhou<i class="dot"></i>2 小时前</span></div></div>
<a class="article" href="#"><img src="assets/lake.webp" alt=""><div class="t"><div class="kind">长文</div><h3>周末去湖边：一份慢下来的清单</h3><p>早上七点出发，路上的雾还没散。到湖边时太阳刚好从山后面出来，水面一下子亮了。这次没有赶行程，只给自己列了几件想做的小事……</p><div class="rt">阅读约 3 分钟 · 4 张图片 · 1 段音频</div></div></a>
<div class="meta" style="margin-top:8px">{SRC_INLINE}</div>{actions("128","12",liked=True)}</article>
<article class="card feed-card"><div class="fc-head"><img class="avatar" src="assets/av3.webp" width="40" height="40" alt=""><div class="who"><span class="name">阿森</span> <span class="handle">@asen<i class="dot"></i>昨天</span></div></div>
<p class="fc-text">海边的秋天，颜色比夏天还热闹。</p><div class="fc-imgs"><img src="assets/sea.webp" alt=""><img src="assets/autumn.webp" alt=""></div>
<div class="meta" style="margin-top:8px">来自 NiceIdeas 网页版</div>{actions("56","8")}</article>'''

def side(active):
    items = [("home","首页",""),("compass","发现",""),("bell","通知",'<span class="badge">3</span>'),("user","我的主页",""),("settings","设置","")]
    nav = "".join(f'<a class="nav{" on" if n==active else ""}" href="#">{ic(i)}{n}{b}</a>' for i,n,b in items)
    return f'''<aside class="side">{brand()}{nav}<span class="btn btn-primary">{ic("plus")}发布</span>
<div class="me"><img class="avatar" src="assets/avatar.webp" width="38" height="38" alt=""><div class="who"><div class="name">林小舟</div><div class="handle">@linxiaozhou</div></div>{ic("more")}</div></aside>'''

def aside():
    sug = "".join(f'<div class="sug"><img class="avatar" src="assets/av{i}.webp" width="38" height="38" alt=""><div class="who"><div class="name">{n}</div><div class="handle">@{h}</div></div><span class="btn btn-secondary btn-sm">关注</span></div>' for i,n,h in [(4,"小满","xiaoman"),(5,"Momo 的手账","momo"),(3,"阿森","asen")])
    return f'''<aside class="aside"><div class="hdr-search" style="margin:0;max-width:none">{ic("search")}搜索 NiceIdeas</div>
<div class="card box"><h3>推荐关注</h3>{sug}</div><div class="mini-links"><a href="#">关于</a><a href="#">社区准则</a><a href="#">条款</a><a href="#">隐私</a><span>© 2026 NiceIdeas</span></div></aside>'''

def m_tab(active):
    items = [("home","首页"),("compass","发现"),("plus",""),("bell","通知"),("user","我")]
    out = ""
    for i,n in items:
        if i == "plus": out += f'<span><span class="plus">{ic("plus")}</span></span>'
        else: out += f'<span class="{"on" if n==active else ""}">{ic(i)}{n}</span>'
    return f'<nav class="m-tab">{out}</nav>'

def timeline(mobile=False):
    compose = f'''<div class="card compose"><img class="avatar" src="assets/avatar.webp" width="40" height="40" alt=""><div class="f"><div class="ph">有什么新想法？</div>
<div class="row"><span class="ib">{ic("image")}</span><span class="ib">{ic("mic")}</span><span class="ib">{ic("doc")}</span><span class="act-sp"></span><span class="btn btn-primary btn-sm">发布</span></div></div></div>'''
    head_ = '<div class="main-h"><h1>首页</h1><div class="seg"><span class="on">关注</span><span>全部</span></div></div>'
    if mobile:
        return head("首页 · NiceIdeas") + f'<body class="m"><header class="m-hdr">{brand()}<span>{ic("search")}</span></header><main class="main">{compose}{feed_cards()}</main>{m_tab("首页")}</body></html>'
    return head("首页 · NiceIdeas") + f'<body><div class="shell">{side("首页")}<main class="main">{head_}{compose}{feed_cards()}</main>{aside()}</div></body></html>'

def profile(mobile=False):
    prof = f'''<section class="card prof"><div class="banner"></div><div class="pi"><div class="ava-row"><img class="avatar" src="assets/avatar.webp" alt=""><span class="btn btn-ghost btn-sm">{ic("edit")}编辑资料</span></div>
<h1>林小舟</h1><div class="handle">@linxiaozhou</div><p class="bio">喜欢散步、记录和慢慢生活。用乐趣记事本写下每一个小想法。</p>
<div class="facts"><span>{ic("link")}xiaozhou.blog</span><span>{ic("cal")}2026年10月加入</span></div>
<div class="stats"><span><b>42</b> 帖子</span><span><b>128</b> 关注</span><span><b>1.2k</b> 粉丝</span><span><b>3.4k</b> 获赞</span></div></div>
<div class="tabs"><span class="on">全部</span><span>长文</span><span>图片</span><span>赞过</span></div></section>'''
    if mobile:
        return head("林小舟 · NiceIdeas") + f'<body class="m"><header class="m-hdr">{brand()}<span>{ic("settings")}</span></header><main class="main">{prof}{feed_cards(own=True)}</main>{m_tab("我")}</body></html>'
    return head("林小舟 · NiceIdeas") + f'<body><div class="shell">{side("我的主页")}<main class="main">{prof}{feed_cards(own=True)}</main>{aside()}</div></body></html>'

PAGES = {"post": post_page(), "post-m": post_page(True), "post-cn-m": post_page(True, True), "post-cn": post_page(cn=True),
         "timeline": timeline(), "timeline-m": timeline(True), "profile": profile(), "profile-m": profile(True)}
for k, v in PAGES.items(): open(f"{k}.html", "w").write(v)
print("ok")
