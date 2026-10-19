# Phase 1 架构设计（M1：staging 上真实生成帖子网页与链接）

> 依据平台方案 v5 §2–§11。本文是实现约束；改动需同步更新本文。

## 1. 请求路径与模块归属

| 请求 | 入口 | 中国大陆判定 | 说明 |
|---|---|---|---|
| `/p/<slug>` 帖子页 | Route Handler，服务端拼装 HTML（`src/server/share/`） | `region-policy`（允许） | 无框架 JS、免 JS 可读；可返回 200/404/410/451；自带 CSP |
| 其余页面（`/`、以后的 Web App） | React 页面 | `src/proxy.ts` 调 `region-policy`（大陆→451 页） | nonce CSP 由 proxy 生成 |
| `/api/v1/*` | Route Handler + `src/server/http/api-route.ts` 包装 | 包装器调 `region-policy`，按路由声明的访问类别判定 | proxy 不匹配 API（避免请求体被 proxy 缓冲截断） |
| 静态资源 `/_next/static`、`/assets`、`/fonts` | Next 静态 | 不判定（无内容） | 帖子页依赖 |
| 媒体 | R2 公开桶自定义域 | 不经本服务 | 只放已发布媒体 |

## 2. 分层

- `src/app/**`：只做参数解析、调用服务、返回响应。
- `src/server/config`：环境变量（zod 校验，启动即失败，不带默认的敏感值）。
- `src/server/db`：连接池、表类型、迁移、仓储；SQL 只在这里。
- `src/server/auth`：Bearer 令牌校验 → `Principal`（userId、source、clientId、kind=first_party|third_party）。
- `src/server/region`：`region-policy` 唯一判定点（纯函数 + 日志）。
- `src/server/documents`：规范化文档 schema、kind/标题/摘要推导、content_hash。
- `src/server/render`：文档 → 安全 HTML（帖子页与以后的 Web App 共用）。
- `src/server/media`：类型识别、图片派生、音频校验、存储驱动、发布投影（公开桶）。
- `src/server/posts`：发布/同步/属性/撤回/清单业务、限流。
- `src/server/share`：帖子页与错误页 HTML 模板（自动转义）。
- `src/i18n` + `messages/*.json`：40 种语言。

## 3. 规范化文档 v1

```json
{ "version": 1, "title": "可选，≤200 字",
  "blocks": [
    { "type": "text", "format": "plain|markdown", "text": "…" },
    { "type": "todo", "items": [{ "text": "…", "checked": true }] },
    { "type": "image", "mediaId": "<uuid>", "alt": "可选", "caption": "可选" },
    { "type": "audio", "mediaId": "<uuid>", "title": "可选", "markers": [{ "timeMs": 1200, "label": "可选" }] } ] }
```

- 上限（可配置）：块 ≤ 300；正文合计 ≤ 100,000 字；图片块 ≤ 50；音频块 ≤ 10。
- `mediaId` 必须属于作者本人、类型与块一致、处理完成。
- `content_hash` = 规范化 JSON（键排序）的 sha256。
- kind 自动：只有 text/todo、无媒体、可见字数 ≤ 500 → `short`，否则 `article`；作者手动设置后不再自动改。
- 标题：文档 `title`，否则空；摘要：正文前 200 字纯文本；封面：第一张图。作者自定义摘要/封面后不随同步改变。

## 4. 媒体

- 上传 `POST /api/v1/media`（multipart：`file` + `sha256`）。同一作者同一 sha256 → 直接返回已有。
- 按文件头识别：图片 jpeg/png/webp/gif/avif（禁 SVG；gif 取首帧；HEIC 不支持，客户端先转 JPEG）；音频 mp3/m4a(aac)/ogg/opus/webm/wav。
- 图片：自动旋转后去掉全部元数据（EXIF/GPS），生成宽 480/960/1600 的 webp（不放大）+ 1600 jpeg 兜底。
- 音频：原样保存（不转码），校验时长与大小。
- 存储：**私有桶**存全部派生文件；**公开桶**只放"被某个上线帖子的当前修订引用"的媒体（`media.public_at`）。
  - 上线：先复制到公开桶再提交事务（失败最多留下孤儿，由对账清掉）。
  - 下线（撤回/下架/删号冷静期/修订不再引用）：事务提交后从公开桶删除并清 CDN 缓存；失败记日志，由对账重试。
- 未被任何帖子当前修订引用的媒体记 `detached_at`，7 天后物理删除；随撤回帖子一起的媒体在帖子 30 天到期时删除。

## 5. 帖子生命周期

- `status`：`active` / `unpublished`（作者撤回）/ `removed`（后台下架）/ `author_deleting`（删号冷静期）。
- 有效发布唯一：`(author_id, source, source_ref)` 在 `active|author_deleting` 范围内唯一；撤回后再分享 = 新帖。
- 同步：行锁串行；`frozen` 拒绝；hash 相同空操作；`source_updated_at` 早于当前修订拒绝；否则新修订原子切换。
- 撤回/下架：`purge_after = now + 30d`；帖子页立即 410。

## 6. API 约定

- 鉴权：`Authorization: Bearer <Logto access token>`。第一方 = issuer 匹配 + `aud` ∈ 两区业务 audience + `client_id` ∈ 白名单；`aud` 决定 `source`（intl/cn）。
- 错误体只返回机器可读码：`{"error":{"code":"post.stale_update","status":409}}`，不返回人类可读文案（客户端按码本地化）。
- `Idempotency-Key`：第一方可选、第三方必填；24 小时内同键同请求返回同一结果，同键不同请求 → 422。

## 7. 中国大陆规则

- `region-policy.decide({ country, access })`：`country` 来自 `CF-IPCountry`；仅 `CN` 受限；`REGION_POLICY_CN=link_only|off`。
- 访问类别：`share`（帖子页）、`publish_api`（第一方发布类）、`third_party_api`、`public_meta` → 允许；`site`、`site_api` → 拒绝（页面 451、API 451 + `region.restricted`）。
- 每次涉及 CN 的判定写一行结构化日志；帖子页在 CN 下不渲染任何站内导航。
