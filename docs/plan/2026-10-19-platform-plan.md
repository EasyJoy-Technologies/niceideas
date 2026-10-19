# NiceIdeas 平台方案（niceideas.app）v3

> 状态：**已定稿（自研）**，§14 只剩两项小确认。尚未写代码、未动任何环境。
> 日期：2026-10-19（v1 11:27 → v2 13:12 → v3 14:23 吸收全部决策）
> 作者：nicematrix-system agent；实现方：niceideas agent
> 选型依据：[`2026-10-19-build-vs-sharkey-evaluation.md`](2026-10-19-build-vs-sharkey-evaluation.md)

---

## 0. 分工

| 方 | 负责 |
|---|---|
| **niceideas agent**（本仓库） | 平台全部实现：服务、数据库、分享页、Web、第一方/第三方 API、审核后台、部署 |
| **nicematrix-system agent** | NiceMatrix ID（Logto）侧配置：Web 应用、API resource、OmniFire 第三方应用；后端删号联动；身份校验口径 |
| **NiceNote agent** | 乐趣记事本发布入口、文档序列化、编辑同步推送、撤回/删除联动 |
| **OmniFire agent** | 新增 NiceIdeas 发布适配器（短帖 + 长文 + 编辑 + 删除） |

各方只改自己的仓库；跨方事项按本文契约交接。

## 1. 需求与决策

| # | 内容 |
|---|---|
| R1 | Twitter（短想法）+ 博客（长图文）；长文在流里显示摘要，点开看全文 |
| R2 | 乐趣记事本记事可发布到平台 |
| R3 | 纯文本直接发布；图文音频混排转为好看的网页，手机/PC 自适应；分享出去的是一个链接 |
| R4 | 主页：关注的人的公开内容 + 自己的内容 |
| R5 | 账号 = NiceMatrix ID，与乐趣记事本国内/国际版为同一账号 |
| R6 | 第三方 API 发布，首个对接 OmniFire |
| D1 | **自研**，不基于 Sharkey |
| D2 | 独立仓库 + 独立 agent（niceideas） |
| D3 | 国内外都用 niceideas.app，只部署在境外 prod-1，不在国内部署 |
| D4 | 改记事后默认跟着更新（作者可改为"固定为当前版本"） |
| D5 | 首版内容类型 = 文字、待办、图片、音频（与乐趣记事本一致） |
| D6 | 国际：全部公开、全部进时间线；定向分享 / 仅持链接可见以后再议 |
| D7 | 发布者不要求绑定手机号，有 NiceMatrix ID 账号即可 |
| D8 | **国内用户：只开放具体链接分享，主页（时间线等社交功能）不对国内用户开放**（规则见 §4） |
| D9 | 撤回 / 下架内容**保留 30 天**后物理删除 |
| D10 | 界面支持大部分语种（见 §7） |
| D11 | 机器内容审核放到后期；v1 = 举报 + 人工下架 + 限流 |

## 2. 架构

```
乐趣记事本(国际/国内) ──Logto 业务 token──┐
OmniFire ──第三方授权 token────────────────┤
浏览器 ──会话 cookie──────────────────────┼─▶ niceideas.app（prod-1，单个服务）
                                          │     ├─ SSR：帖子页 /p/<slug>、个人页 /@handle（OG/微信卡片、免 JS 可读）
                                          │     ├─ Web App：登录、时间线、发帖、关注、设置
                                          │     ├─ API：/api/v1/*（第一方 + 第三方）
                                          │     └─ 后台：审核与运营（独立权限）
                                          ├─▶ PostgreSQL（niceideas 独立库）
                                          └─▶ Cloudflare R2 发布桶 → media.niceideas.app（只放已发布的派生媒体）
id.nicematrix.com（Logto）：登录、令牌签发、第三方授权同意页
api.nicematrix.com：删号编排 → 调 niceideas 内部接口（HMAC 签名）
```

- **技术栈**：TypeScript + Next.js（SSR、OG 与 Web 一套代码）+ PostgreSQL + R2 + `sharp`；i18n 用 `next-intl`（全局 I18N 标准）。与 OmniFire 同栈。
- **单服务**：SSR + Web + API 同进程，prod-1 上 systemd 管理；staging = `t.niceideas.app`。
- **与 NiceMatrix 后端解耦**：不读自有云 `store_*`、不共享数据库；只经 Logto 令牌与删号 HMAC 契约交互。
- **不依赖自有云同步**：发布内容由客户端提交（国内自有云未上线；未开同步的用户也要能发；私有加密域与公开域不耦合）。
- **资源**：prod-1 当前可用内存约 3.7 GB；本服务预估 0.3–0.5 GB【估计】。PostgreSQL 独立容器，沿用 prod-1 的备份 / PITR 做法，并设日志上限。
- **开发 / 部署路径**：开发 `/root/projects/niceideas`；部署 `/var/www/niceideas`（prod）、`/var/www/niceideas-staging`（staging），部署目录不放 git 工作区。

## 3. 账号打通（NiceMatrix ID）

| 场景 | 做法 |
|---|---|
| Web 登录 | Logto 新建 niceideas Web 应用（服务端 OIDC Code + PKCE，HttpOnly 会话）；已在其他 NiceMatrix 网页登录的用户 SSO 自动登录 |
| 用户标识 | Logto `sub` 为唯一主键；国内/国际同一人；展示名/头像首登时从 userinfo 取，之后可在平台修改 |
| 首次进入 | 自动建平台资料；handle 自动生成（可改，唯一，保留字黑名单） |
| 乐趣记事本调用 | 直接用其现有业务 token：按 Logto JWKS 验签，接受两区业务 audience（`https://api.nicematrix.com`、`https://apiv3.ej-mobile.cn`）**且** `client_id` 在第一方白名单。不用改登录、不用重新登录 |
| 第三方（OmniFire） | Logto 注册 API resource `https://api.niceideas.app` + scopes `posts:read` / `posts:write` / `media:write`；OmniFire 登记为**第三方应用**（展示授权同意页） |
| 手机号 | 不要求（D7） |
| 删号 | 见 §10 |

## 4. 国内用户规则（D8）

"国内用户只开放具体链接分享，主页不对国内用户开放"落为两条可执行规则：

| 规则 | 判定依据 | 效果 |
|---|---|---|
| **G1 国内发布 = 仅链接** | 发布请求来自乐趣记事本**国内版**客户端（token 的 `client_id` 属于国内版白名单 / audience 为 `https://apiv3.ej-mobile.cn`） | 帖子 `distribution = link_only`：拿到链接的人都能看；**不进**任何时间线、发现页、个人主页、搜索；不可被关注流聚合 |
| **G2 主页不对国内开放** | 访问者网络位于中国大陆（Cloudflare `CF-IPCountry = CN`；港澳台不在内） | 首页 / 发现 / 个人主页 / 关注 / Web 发帖等社交页面不提供，显示简洁的品牌说明页；**具体帖子链接正常打开**；社交类 API 对该来源返回不可用 |

- 两条规则都是**服务端单一判定模块**（`region-policy`），页面与 API 统一调用，不散落在各处；判定结果写入访问日志便于核对。
- 帖子页对所有人一致：任何人打开具体链接都能看（G1 的帖子、国际用户的帖子都一样）。
- 国际版用户人在中国大陆时，同样只能打开具体链接（按网络位置判定，最简单可靠）。
- 规则以配置开关实现，日后放开国内社交功能时只改配置。
- 国内发布的帖子页面不展示"关注作者 / 作者主页"入口。

## 5. 数据模型（niceideas 库）

| 表 | 作用 | 要点 |
|---|---|---|
| `profile` | 平台资料 | `user_id`(sub)、`handle`、展示名、头像、简介、语言偏好、状态 |
| `post` | 一条发布 | `slug`（≥12 位随机，不可枚举）、`author_id`、`kind` short/article、`distribution` public/link_only、`status` active/unpublished/removed/author_deleting、`source`（nicenote_intl / nicenote_cn / web / api:omnifire）、`source_ref`（记事 UUID 或第三方幂等键）、`sync_mode` follow/frozen、`title`、`summary`、`cover_media_id`、`current_revision_id`、`source_updated_at`、`published_at`、`purge_after` |
| `post_revision` | 内容版本 | 规范化文档 JSONB、`content_hash`、`source_updated_at` |
| `media` | 派生媒体 | `owner_id`、`sha256`、kind image/audio、mime、尺寸/时长、各尺寸 key |
| `revision_media` | 修订↔媒体引用 | GC 依据 |
| `follow` | 关注 | `(follower_id, followee_id)` |
| `report` / `moderation_action` | 举报与处置 | 原因、处理人、处置时间 |
| `api_client` | 第三方客户端登记 | Logto client_id、名称、状态、限流档 |
| `idempotency` | 幂等键 | 客户端 / 第三方重试去重 |

- `kind`：纯文字/待办、无媒体、≤500 字 → `short`（流里全文）；否则 `article`（流里显示标题 + 摘要 + 封面，点开全文）。作者可手动切换。
- 一篇记事最多一条有效发布：`(author_id, source, source_ref)` 部分唯一；重复点"分享"= 返回已有链接。
- 定向可见、仅持链接（国际）等 v1 不建表，需要时加迁移。

## 6. 内容格式与渲染

- 客户端提交**规范化文档**（块数组），不提交 HTML：`text`（plain/md）、`todo`（只读勾选态）、`image`、`audio`（可带打点，v1 只展示播放器）。
- 服务端：校验 → 存修订 → 渲染。只从结构化块生成 HTML；Markdown 禁原始 HTML；输出再过白名单清洗；严格 CSP；无第三方脚本。
- 图片：生成 480/960/1600 webp + 兜底格式，**剥离 EXIF/GPS**，禁 SVG。音频：校验格式与时长上限，HTML5 播放器。
- 排版：移动优先单栏、PC 居中阅读宽度、懒加载、图片灯箱；遵循 niceideas `DESIGN.md`。
- 分享卡片：OG / Twitter Card / 微信抓取所需的标题、摘要、封面。
- 不发布：记事的位置、标签、转写文本（以后如需由作者显式勾选）。

## 7. 多语言（D10）

- **首批 20 种界面语言**（与 OmniFire 一致，便于复用流程）：简体中文、繁體中文、English、日本語、한국어、Español、Français、Deutsch、Italiano、Português、Русский、العربية、हिन्दी、Bahasa Indonesia、ไทย、Tiếng Việt、Türkçe、Nederlands、Polski、Українська。
- 阿拉伯语为从右到左（RTL），布局需按 `dir` 镜像；字体按语种回退。
- 语言选择：登录用户用资料里的偏好；否则按浏览器 `Accept-Language`；可手动切换并记住。
- 帖子页的界面文字（按钮、"内容已撤回"、举报等）跟随**访问者**语言；帖子正文是作者原文，不翻译。
- 零硬编码：所有界面文字、错误、邮件/通知、OG 默认文案走 i18n key；每次新增 key 必须同时提交 20 种真实翻译（禁止英文兜底）；CI 校验各语言 key 集合一致。
- 日期、数字按访问者语言格式化，时间按访问者时区显示。
- 以后加语种只需新增一个语言文件 + 注册。

## 8. 乐趣记事本接入契约（要点；详细契约由 niceideas agent 第 1 天交付）

| 接口 | 用途 |
|---|---|
| `POST /api/v1/media` | 上传媒体（带 sha256，已存在则直接返回） |
| `POST /api/v1/posts` | 发布（文档 + `source_ref` + 记事 `update_time`），返回链接；国内版自动为 `link_only` |
| `PUT /api/v1/posts/{id}/content` | 编辑同步：新文档 + `update_time` |
| `PATCH /api/v1/posts/{id}` | 改摘要/封面/`sync_mode`/kind |
| `DELETE /api/v1/posts/{id}` | 撤回 |
| `GET /api/v1/me/sources?source=nicenote` | 已发布记事清单（多设备判断用） |

同步规则：本地保存后防抖约 10 s 推送；`content_hash` 不变 → 空操作；`update_time` 早于现有修订 → 拒绝（旧设备不能覆盖新内容）；
成功 → 新修订原子切换、清缓存，链接不变，≤1 分钟可见。其他设备改了已发布记事：客户端拉 `me/sources` 命中后推送。

## 9. 第三方发布（OmniFire 起）

- 授权：用户在 OmniFire 点"连接 NiceIdeas" → Logto 同意页 → OmniFire 获得 access/refresh token（resource `https://api.niceideas.app`）。
- 能力：发短帖、发长文（同一文档格式）、上传媒体、编辑、删除、读自己的帖子。
- 管控：`api_client` 白名单（v1 仅 OmniFire）；`Idempotency-Key` 必填；按客户端 + 用户双重限流；帖子标注"来自 OmniFire"；用户可在 NiceIdeas 设置里查看并撤销授权。
- 国内规则同样适用：从中国大陆网络发起的第三方发布 → `link_only`（G2 判定）。

## 10. 数据边界与生命周期

- **记事 = 私有原件；发布 = 派生的公开副本**。两套存储、两套权限；平台永不写回记事。

| 事件 | 处理 |
|---|---|
| 发布 | 建帖 + 修订 1 + 派生媒体，返回链接 |
| 改记事（跟随） | 新修订，链接不变 |
| 改为"固定" | 不再接受推送 |
| 撤回 | 页面立即 410"内容已撤回"，媒体立即从公开路径摘除；`purge_after = 撤回时间 + 30 天`，到期物理删除帖子、修订与媒体 |
| 后台下架 | 同撤回（作者可见原因），30 天后物理删除 |
| 记事删除 / 进回收站 | 客户端提示"已分享，删除将同时撤回"，确认后撤回 |
| 旧修订媒体 | 无引用 7 天后删除 |
| 提交注销（15 天冷静期开始） | NiceMatrix 后端调 niceideas 内部接口：立即下线该用户全部帖子与资料 |
| 撤销注销 | 恢复上线 |
| 冷静期结束 | 立即物理删除帖子、修订、媒体、关注关系（不再额外保留 30 天） |

- 每日清理任务按 `purge_after` 执行，幂等、可重试、有告警。
- NiceMatrix 后端改动（nicematrix-system agent）：删号编排新增"通知 niceideas"步骤（HMAC 签名、幂等、失败重试与告警）。

## 11. 审核与安全

- v1：每个帖子页有举报入口；后台下架 + 审计日志；发布限流。机器内容审核后期再接（D11）。
- slug 不可枚举；渲染时检查状态，不依赖链接保密。
- 限流：每用户每小时/每天发布数、单帖大小、单帖媒体数、单用户发布总容量。
- 媒体走独立子域；严格 CSP；上传按真实文件头识别类型。

## 12. 国内访问相关（已知风险，记录不展开）

- 数据与页面均在境外：国内用户内容出境；Cloudflare 在国内访问速度不稳定；境外域名在微信内可能被拦截或提示风险。
- 上线后第一周用国内网络与微信实测打开率与速度，作为是否需要国内加速的依据。

## 13. 计划（客户端与 OmniFire 并行）

| 周 | niceideas agent | nicematrix-system agent | 客户端 / OmniFire |
|---|---|---|---|
| 1 | 仓库骨架、staging、数据模型、发布/修订/撤回/同步 API、媒体管线、SSR 帖子页、国内规则模块、i18n 框架 + 20 语种 | Logto Web 应用 + 第一方白名单口径；删号联动契约与后端实现（先 staging） | 乐趣记事本按契约开发发布与同步 |
| 2 | Web：登录、资料/handle、关注、首页/发现/个人页、Web 写短帖与长文、长文卡片 | 删号联动上生产（需确认） | 乐趣记事本测试包联调 |
| 3 | 第三方 API、审核后台、举报、限流、30 天清理任务 | Logto API resource + OmniFire 第三方应用 | OmniFire 适配器 |
| 4 | 安全审查、性能、全语种核对、OG/微信实测、上生产（需确认） | 生产核验 | 发版（依商店审核） |

每个生产环境上线均需 Xianglin 单独确认。

## 14. 待确认

| # | 问题 | 建议 |
|---|---|---|
| Q1 | 国内判定用 §4 的 G1（国内版客户端发布）+ G2（大陆网络访问）是否认可 | 认可则按此实现 |
| Q2 | 首批 20 种语言是否够用 | 够用；以后按需增加 |
