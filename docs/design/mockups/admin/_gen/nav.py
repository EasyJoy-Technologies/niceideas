"""Full admin information architecture (shared by all variants)."""
from kit import ic

# (group, [(icon, label, badge, active_key)])
NAV = [
    ("", [("home", "概览", "", "dash")]),
    ("数据", [("chart", "数据统计", "", "stats")]),
    ("内容", [("file", "帖子", "", "posts"), ("msg", "评论", "", "comments"), ("image", "媒体", "", "media")]),
    ("审核", [("flag", "举报队列", "7", "reports"), ("ban", "封禁", "", "bans"), ("list", "审计日志", "", "audit")]),
    ("用户", [("users", "用户", "", "users")]),
    ("平台", [("plug", "接入应用", "", "apps"), ("server", "系统状态", "", "system"), ("sliders", "设置", "", "settings"), ("shield", "管理员", "", "admins")]),
]

MODULES = [
    ("概览", "今日要处理的事、核心指标、趋势、来源、热门帖子、系统健康，一屏看完。"),
    ("数据统计", "增长（新用户、发帖作者、留存）、内容（帖子数、长短比例、来源、媒体量）、互动（点赞、评论、匿名占比、关注）、流量（浏览、访客、国家地区、来路、分享图抓取）、第三方应用（各应用发帖与调用量、错误率）。可选时间范围、按天/周/月，导出 CSV。"),
    ("帖子", "全部帖子的表格：按状态、来源、类型、作者、时间筛选，搜索标题和正文；详情里能下架/恢复、改评论设置、看修改历史和处置记录。"),
    ("评论", "全部评论（含匿名）：按状态、帖子、访客筛选；隐藏、删除、恢复；从评论直接封禁访客。"),
    ("媒体", "图片和音频列表，按大小、类型、作者筛选；能看到被哪些帖子引用；违规媒体可单独下架。存储用量。"),
    ("举报队列", "同一对象的举报合并；右侧详情直接处理；常用原因一键填入；已处理/已驳回可回看。"),
    ("封禁", "匿名访客和 IP 哈希封禁：列表、到期、解除、原因。"),
    ("审计日志", "所有管理操作（含设置修改），按操作、处理人、时间筛选，导出。"),
    ("用户", "按 handle / 名字 / 用户 ID 查找；看资料、帖子数、存储用量、被举报次数、注销状态；可限制发帖（本站），不能封 NiceMatrix 账号。"),
    ("接入应用", "第一方和第三方应用：目录状态、本站启用/停用、发帖限额、近期调用量和错误。"),
    ("系统状态", "版本、服务、数据库、存储、后台任务（发布队列、30 天清理、删号事件）、最近错误。"),
    ("设置", "站点公告、发布限流、匿名评论开关与限流、中国大陆访问策略说明（只读）、敏感词（以后）。"),
    ("管理员", "管理员名单与角色（管理员 / 审核员 / 只读），最近登录。"),
]


def nav_html(active="dash", item_cls="ni", grp_cls="ng", icons=True, labels=True):
    out = []
    for grp, items in NAV:
        if grp and labels:
            out.append(f'<div class="{grp_cls}">{grp}</div>')
        for icon, label, badge, key in items:
            on = " on" if key == active else ""
            b = f'<span class="bd">{badge}</span>' if badge else ""
            txt = f"<span>{label}</span>" if labels else ""
            out.append(f'<a class="{item_cls}{on}" title="{label}">{ic(icon) if icons else ""}{txt}{b}</a>')
    return "".join(out)
