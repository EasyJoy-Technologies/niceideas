# NiceIdeas 执行计划（实现方：niceideas agent）

> 依据：[`2026-10-19-platform-plan.md`](2026-10-19-platform-plan.md) v5 · 日期：2026-10-19
> 本文只记录"怎么做"；需求与决策以平台方案为准，冲突时以平台方案为准。

## 1. 调研结论（已核实）

| 项 | 现状 |
|---|---|
| DNS | `niceideas.app`、`*.niceideas.app` → 本机 135.181.147.90（Cloudflare 代理，SSL=Full，IP 地理位置=开）。本机 nginx 尚无 niceideas 站点，当前落到默认站点（显示 NiceSpace） |
| 证书 | `/etc/ssl/niceideas.app.pem`（Cloudflare 签发，Full 模式可用） |
| 本机 | Node 24.19 / pnpm 10.33 / Docker；可用内存约 5.8 GB；磁盘余 24 GB；端口 3110、25434 空闲 |
| prod-1 | 46.224.6.74，可用内存约 3.6 GB；尚无 niceideas 任何配置 |
| R2 | 账号 NiceMatrix；尚无 niceideas 桶；OmniFire 先例：`omnifire-staging` 桶 + 自定义域 `media-staging.omnifire.app` |
| Logto | 两区同一 issuer `https://id.nicematrix.com/oidc`（nicematrix-backend 同口径） |
| 部署目录 | `/var/www/niceideas{,-staging}` 内有旧的 Sharkey 时期 git 目录（方案要求部署目录不放 git） |

## 2. 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 框架 | Next.js 15 App Router + TypeScript strict，`output: standalone`，单包单服务 | 方案指定；与 OmniFire 同栈 |
| 数据库 | PostgreSQL 17 独立容器；Kysely + `pg`；SQL 迁移由 Kysely Migrator 执行 | 类型安全、无代码生成引擎、部分唯一索引/JSONB 直写 SQL |
| 鉴权 | `jose` 远程 JWKS 验签；issuer/audience/第一方 client_id 白名单均走配置 | 与 nicematrix-backend 口径一致 |
| 媒体 | `sharp`（480/960/1600 webp + jpeg 兜底，自动旋转，丢弃 EXIF/GPS）；`file-type` 按文件头识别；`music-metadata` 取时长；存储驱动 = 本地（开发/测试）/ R2（staging/prod） | 方案 §6、§11 |
| 渲染 | 结构化块 → HTML；Markdown 用 `markdown-it`（禁原始 HTML）+ `sanitize-html` 白名单；nonce CSP；无第三方脚本 | 方案 §6 |
| i18n | `next-intl`，`messages/{locale}.json` 40 种；URL 不带语言前缀（分享链接稳定）；cookie → 资料偏好 → Accept-Language 近似匹配 | 方案 §7、全局 I18N 标准 |
| 测试 | Vitest；集成测试用 testcontainers 起真实 PostgreSQL；i18n 一致性、文件行数、硬编码文案检查脚本进 `pnpm check` | 方案 §7.2 CI 要求 |
| 运行 | staging：本机 systemd `niceideas-staging.service`（端口 3110）+ nginx `t.niceideas.app` + 容器 `niceideas-postgres-staging` | 沿用本机 9696tools/OmniFire 做法 |

## 3. 代码分层（单一职责）

```
src/app/            路由层（页面 + /api/v1 route handlers，只做参数解析与响应）
src/server/config/  环境配置（zod 校验）
src/server/db/      连接、表类型、迁移、仓储（只在这里写 SQL）
src/server/auth/    令牌校验、主体解析
src/server/region/  region-policy（中国大陆规则唯一判定点）
src/server/posts/   发布/修订/同步/撤回业务
src/server/media/   媒体识别、处理、存储驱动
src/server/render/  文档校验与 HTML 渲染
src/components/     UI 组件（不碰数据库）
src/i18n/ messages/ 多语言
```

## 4. 分步交付（每步：实现 → 自检自测 → 提交推送 → 汇报）

### 阶段 1（目标 M1）
1. 骨架：Next.js、lint、测试、i18n 框架 + 40 语言、版本号/`/api/v1/meta`、changelog、检查脚本、设计令牌
2. 数据模型：全部 §5 表 + 迁移 + 仓储
3. 鉴权：第一方令牌校验、资料自动创建
4. 媒体管线 + `POST /api/v1/media`
5. 文档格式校验 + 渲染器
6. 发布 API：发布/编辑同步/改属性/撤回/已发布清单、幂等、基础限流
7. SSR 帖子页 `/p/<slug>`：自适应排版、灯箱、OG/微信卡片、410/404
8. region-policy + 中间件 + 大陆报错页 + 访问日志
9. 内部测试发布工具（服务端 CLI，不新增 HTTP 后门）
10. staging 基础设施 + 部署脚本 → **M1 验收**

### 阶段 2–4
按平台方案 §13 推进；依赖项：Logto Web 应用（阶段 2 登录）、API resource + OmniFire 第三方应用（阶段 3）、删号 HMAC 契约（阶段 3）均由 nicematrix-system agent 提供；生产上线需单独确认。
