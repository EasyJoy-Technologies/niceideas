# 管理后台（方案 A）与深色模式 — 实现方案（2026-10-22）

状态：待 Xianglin 确认。设计稿：`docs/design/mockups/admin/dashboard-a.html`、`stats-and-modules.html`；深色模式预览：工作区 `review/dark/`。

## 1. 深色模式（前台 + 后台共用）

### 1.1 切换按钮位置
| 位置 | 形式 | 说明 |
|---|---|---|
| 宽屏右栏底部，语言旁 | 三段图标：跟随系统 / 浅色 / 深色 | 和语言、© 放在一起，属于“偏好设置”；不占顶部空间 |
| 手机顶栏，语言图标左边 | 一个图标按钮，点开三项菜单 | 图标显示当前模式；和语言菜单同一种下拉 |
| 信息页（关于/条款等）顶栏 | 同手机顶栏按钮 | 信息页没有右栏 |
| 帖子页 / 窄屏页脚 | 页脚 © 旁同三段图标 | 帖子页没有右栏 |
| 账号菜单、设置页 | “外观”一项 | 登录用户的第二入口 |
| 后台 | 侧栏底部个人信息旁 | 同一个偏好，前后台一致 |

默认 **跟随系统**。

### 1.2 实现
- 偏好存 cookie `ni_theme`（auto / light / dark，1 年），服务端在 `<html data-theme>` 直接输出，**首屏不闪**（CSP 禁内联脚本，不能靠脚本提前改）。
- 不开 JS：按钮是链接 `/api/web/theme?t=dark&next=<当前页>`（同语言切换的做法，只接受站内路径）；开 JS：立即切换并写 cookie，不刷新页面。
- 颜色全部走 `tokens.css` 变量：新增深色变量组，`[data-theme=dark]` 与 `@media (prefers-color-scheme: dark) :root[data-theme=auto]` 共用；把各 CSS 里约 46 处写死的颜色改为变量（新增 `--ni-color-hover`、`--ni-color-muted`、`--ni-color-divider`、状态色浅底等）。
- Logo：深色用已有的 `lockup-dark.svg`（`<picture>` 按主题切换）；`theme-color` 输出两条（按系统明暗）。
- 页面缓存键加入主题；`Vary: Cookie` 已有。
- 用户内容（图片、封面、分享图）不变色。
- 文案：`theme.auto / light / dark / label` 等新键，40 种语言母语水平。

### 1.3 验证
每个页面类型 × 浅/深 × 桌面/手机截图；对比度检查（正文 ≥ 4.5:1）；无 JS 回退可切换；切换后刷新、换页保持。

## 2. 管理后台（方案 A：浅色侧栏 + 卡片网格）

### 2.1 结构
- 路由 `/admin`（概览）、`/admin/stats`、`/admin/posts`、`/admin/comments`、`/admin/media`、`/admin/reports`、`/admin/bans`、`/admin/audit`、`/admin/users`、`/admin/apps`、`/admin/system`、`/admin/settings`、`/admin/admins`。
- 服务端直出，不开 JS 也能用；JS 只做增强（快捷键、即时筛选）。
- 分层：`src/server/admin/<模块>/`（查询 + 动作，复用现有 moderation 服务）→ `src/server/admin-ui/`（后台外壳、表格、图表、表单组件）→ `src/app/admin/**/route.ts`。后台外壳与前台分开，样式 `public/styles/admin/*.css`，只在后台加载。
- 图表：服务端生成 SVG（柱状、折线、环形、迷你趋势），不引入图表库，符合 CSP。
- 权限：新表 `admin_member`（user_id、角色 admin / moderator / viewer），首次由 `ADMIN_USER_IDS` 写入；每个页面和动作按角色检查。所有修改写原因，进审计日志。
- 统计查询走按天汇总表（`stats_daily`，每小时任务更新），概览和统计页不直接扫大表。

### 2.2 分期（每期都先上 staging，验收后再上生产）
| 期 | 内容 | 数据库变更 |
|---|---|---|
| A1 | 深色模式（前台）；后台外壳（侧栏、顶栏、深色）；概览；举报队列（从现有 /admin 迁移，合并同一对象的举报，右侧详情）；帖子；评论；封禁；审计日志 | `admin_member` |
| A2 | 数据统计：内容、互动、用户与增长、接入应用（用现有数据）；用户；接入应用；系统状态；CSV 导出 | `stats_daily` |
| A3 | 流量采集与统计（浏览、访客、地区、来路）；媒体；设置；管理员管理（含：账号菜单的后台入口改为按 `admin_member` 角色显示，目前只对 `ADMIN_USER_IDS` 显示） | `traffic_daily` |

### 2.3 流量采集（A3，隐私）
- 只存按天 × 帖子 × 国家 × 来路类别的计数，不存 IP、UA 或个人标识。
- 访客数用当天轮换盐的哈希做去重，第二天丢弃盐，事后无法还原。
- 排除爬虫与预览抓取（另计“分享图抓取”次数）；中国大陆访客同样计数，只用于统计。
- 条款与隐私政策需补一句说明（40 种语言），随 A3 一起提交。

## 3. 待确认
1. 深色切换位置（1.1）是否认可。
2. 分期顺序：A1 先做深色模式和审核相关页面，统计放 A2。
3. 流量采集口径（2.3）。
4. 生产管理员：需要 Xianglin 的 NiceMatrix 生产用户 ID。
