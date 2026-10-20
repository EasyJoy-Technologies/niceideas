"""Renders round-3 logo effect sheets into docs/design/mockups/v2 (reuses logo-sheet.css)."""
import pathlib
OUT = pathlib.Path(__file__).resolve().parents[2] / "mockups" / "v2"
I = ('<svg class="capI" viewBox="0 0 34 73" aria-hidden="true">'
     '<path d="M2 0h30v11H23v51h9v11H2V62h9V11H2z" fill="currentColor"/></svg>')
WORD = f"Nice<b>{I}deas</b>"
TAG = "随时随地分享你的好主意！"
SHEETS = {
    "g-bloom": ("方向 G 花开", "保留上一轮 C 的风车花（呼应乐趣记事本图标），花心是一颗紫色灵光——好主意在这里绽放"),
    "h-voices": ("方向 H 众声", "八个对话气泡围成一朵花，尖角都指向中心的灵光——大家围绕一个好主意交流"),
    "i-spark-bloom": ("方向 I 灵光", "八片对称花瓣从中心的紫色灵光向外舒展——一个好主意被分享出去"),
}
def page(key, title, desc):
    m, ic, icd = f"assets/logo-{key}.svg", f"assets/icon-{key}.svg", f"assets/icon-{key}-dark.svg"
    return f'''<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><link rel="stylesheet" href="logo-sheet.css"></head><body>
<div class="sheet">
<div class="title"><h1>{title}</h1><p>{desc}</p></div>
<div class="panel"><h3>图形标</h3><div class="big"><img src="{m}" alt=""></div></div>
<div class="panel"><h3>横版标志（浅 / 深底）+ 标语</h3><div class="lockups">
<div class="lockup"><img src="{m}" alt=""><span class="word">{WORD}<small class="tag">{TAG}</small></span></div>
<div class="lockup dark"><img src="{m}" alt=""><span class="word">{WORD}<small class="tag">{TAG}</small></span></div>
<div class="sizes"><figure><img src="{ic}" width="64" alt="">64</figure><figure><img src="{ic}" width="32" alt="">32</figure><figure><img src="{ic}" width="16" alt="">16</figure><figure><img src="{icd}" width="64" alt="">深色</figure><figure><img src="{m}" width="24" alt="">24 无底</figure></div>
</div></div>
<div class="panel"><h3>手机桌面</h3><div class="home">
<div class="app"><img src="{ic}" alt="">NiceIdeas</div><div class="app"><img src="assets/nicenote.png" alt="">乐趣记事本</div>
<div class="app"><i class="g1"></i>信息</div><div class="app"><i class="g2"></i>天气</div><div class="app"><i class="g3"></i>音乐</div>
<div class="app"><i class="g4"></i>备忘录</div><div class="app"><i class="g5"></i>设置</div><div class="app"><i class="g6"></i>相册</div></div></div>
<div class="panel"><h3>浏览器标签 + 网站页眉</h3><div class="browser">
<div class="tabs"><div class="tab on"><img src="{ic}" alt="">周末去湖边 · NiceIdeas</div><div class="tab">新标签页</div></div>
<div class="url">niceideas.app/p/k7m2q9xh4tbn3c</div>
<div class="site"><span class="brand"><img src="{m}" alt=""><span>{WORD}</span></span><span class="btn">加入 NiceIdeas</span></div></div></div>
<div class="panel"><h3>链接预览（纯文字帖的默认分享图）</h3><div class="chat"><div class="bubble"><div class="card">
<div class="og"><img src="{m}" alt=""><span class="w">{WORD}<small class="tag">{TAG}</small></span><small>niceideas.app</small></div>
<div class="meta"><strong>好的想法常常出现在散步的时候</strong><span>林小舟 · niceideas.app</span></div></div><p>https://niceideas.app/p/k7m2q9xh4tbn3c</p></div></div></div>
<div class="panel"><h3>微信聊天里的分享卡片（乐趣记事本 App 内分享）</h3><div class="wechat"><div class="wx">
<strong>周末去湖边：一份慢下来的清单</strong><span>早上七点出发，路上的雾还没散。到湖边时太阳刚好从山后面出来……</span><img src="assets/lake.webp" alt="">
<em><img src="{ic}" alt="">NiceIdeas</em></div></div></div>
</div></body></html>'''
if __name__ == "__main__":
    for key, (t, d) in SHEETS.items():
        (OUT / f"logo-{key}.html").write_text(page(key, t, d))
    print("ok")
