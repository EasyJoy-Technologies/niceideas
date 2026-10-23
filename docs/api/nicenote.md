# 乐趣记事本（NiceNote）→ NiceIdeas 发布接口

第一方对接说明（平台方案 §8）。国际版、国内版乐趣记事本共用同一套接口；第三方应用（OmniFire 等）另见 `third-party.md`。

## 1. 地址

| 环境 | Base URL | 帖子链接 | 媒体域名 |
|---|---|---|---|
| 生产 | `https://niceideas.app/api/v1` | `https://niceideas.app/p/<slug>` | `https://media.niceideas.app` |
| Staging | `https://t.niceideas.app/api/v1` | `https://t.niceideas.app/p/<slug>` | `https://media-staging.niceideas.app` |

- 中国大陆网络可以调用本文所有接口，**`GET /me` 除外**（返回 451 `region.restricted`）。帖子链接和媒体在中国大陆网络下可以打开。
- `GET /meta`（无需令牌）返回 `{ name, version, environment, apiVersion }`，可用于连通性检查。

## 2. 令牌

`Authorization: Bearer <NiceMatrix ID 的 access token>`，即乐趣记事本访问自家业务 API 时用的同一个 JWT，不需要另外申请。

| 环境 | `iss` | `aud` → 帖子来源 | 允许的 `client_id` |
|---|---|---|---|
| 生产 · 国际版 | `https://id.nicematrix.com/oidc` | `https://api.nicematrix.com` → `nicenote_intl` | 见下方说明 |
| 生产 · 国内版 | `https://id.nicematrix.com/oidc` | `https://apiv3.ej-mobile.cn` → `nicenote_cn` | `wgooa3e48a5l830v97x7a` |
| Staging | `https://id-staging.nicematrix.com/oidc` | `https://api-staging.nicematrix.com` → `nicenote_intl` | `2zxg5iw5pu48eejm88bv1` |

- 服务端校验签名（JWKS）、`iss`、`exp`（允许少量时钟误差）、`aud`、`client_id`。
- `aud` 必须正好对应**一个**来源；`client_id` 必须在 NiceIdeas 的白名单（`FIRST_PARTY_CLIENT_IDS`）里，否则返回 403 `auth.client_not_allowed`。
- 生产白名单目前只有上表中的一个 ID。国际版各端如使用其他 `client_id`，需要先告知 NiceIdeas 加入白名单。
- **不需要先在网页登录 NiceIdeas。** 第一次调用任何接口时，NiceIdeas 会自动为该用户建立资料：用户名先用 NiceMatrix 用户 ID，昵称为空（页面显示 `@用户ID`）；用户以后在网页登录时，用户名、昵称、头像会同步为 NiceMatrix 的资料。
- 帖子按令牌里的 `sub`（NiceMatrix 用户 ID）归属；同一个人在国际版和国内版发布的是同一个账号下的帖子，只是来源不同。

## 3. 接口一览

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/media` | 上传一个图片或音频文件 |
| POST | `/posts` | 发布一条记事，返回链接 |
| PUT | `/posts/{id}/content` | 记事内容改了以后同步 |
| PATCH | `/posts/{id}` | 修改摘要、封面、类型、同步方式、评论设置 |
| DELETE | `/posts/{id}` | 撤回 |
| GET | `/posts/{id}` | 查询一条已发布的帖子 |
| GET | `/me/sources?source=nicenote` | 当前用户所有已发布记事（多设备判断） |
| GET | `/posts/{id}/comments` | 帖子下最近 200 条评论 |
| DELETE | `/posts/{id}/comments/{commentId}` | 作者删除自己帖子下的评论 |
| GET | `/me` | 当前用户在 NiceIdeas 的资料（中国大陆网络不可用） |

请求和响应都是 JSON（`/media` 除外），UTF-8，请求体 ≤ 2 MB。所有响应都是 `Cache-Control: no-store`。

## 4. 文档格式

发布和同步时，记事内容转换成下面的文档：

```json
{
  "version": 1,
  "title": "周末去爬山",
  "blocks": [
    { "type": "text", "format": "markdown", "text": "**天气很好**，路线见下图。" },
    { "type": "image", "mediaId": "6f1c…", "caption": "山顶", "alt": "山顶的风景" },
    { "type": "todo", "items": [{ "text": "带水", "checked": true }, { "text": "带外套" }] },
    { "type": "audio", "mediaId": "9a2e…", "title": "现场录音", "markers": [{ "timeMs": 30000, "label": "鸟叫" }] }
  ]
}
```

| 块 | 字段 |
|---|---|
| `text` | `text`；`format` = `plain`（默认）或 `markdown`（不支持原始 HTML，链接只允许 http/https/mailto） |
| `todo` | `items[]`：`text`（≤ 2000 字）、`checked`（默认 false），1–500 项 |
| `image` | `mediaId`（先上传），`alt`、`caption` 可选（≤ 500 字） |
| `audio` | `mediaId`（先上传），`title` 可选（≤ 200 字），`markers[]` 可选（`timeMs`、`label`，≤ 200 个） |

限制：`title` ≤ 200 字；1–300 块；全文 ≤ 100,000 字；图片 ≤ 50 张；音频 ≤ 10 段。空白文本块会被去掉，全部为空返回 400 `document.empty`。
文档里的媒体必须是同一用户上传的，且类型与块一致，否则返回 422 `document.media_invalid`（`details.mediaIds` 列出有问题的 ID）。

自动推导（可用 PATCH 覆盖）：
- **类型**：没有图片和音频、且正文 ≤ 500 字 → `short`（短帖），否则 `article`（长文）。
- **摘要**：正文前约 200 字。
- **封面**：第一张图片。

## 5. 上传媒体 `POST /media`

- 请求体是文件的原始字节（不是 multipart）。
- 请求头 `X-Content-SHA256`：文件字节的 sha256，小写十六进制，必填。
- 同一用户上传相同内容 → 返回已有的媒体（200），不会重复存储；新文件返回 201。

```json
{ "media": { "id": "6f1c…", "kind": "image", "mime": "image/jpeg", "sha256": "…", "width": 1920, "height": 1080, "durationMs": null } }
```

| 类型 | 支持格式（按文件内容识别） | 上限 |
|---|---|---|
| 图片 | JPEG、PNG、WebP、GIF、AVIF（不支持 SVG、HEIC、BMP，需先转换） | 30 MB，1 亿像素 |
| 音频 | MP3、M4A/AAC、Ogg/Opus、WebM、WAV | 150 MB，4 小时 |

每个用户媒体总量 5 GB（所有来源合计）。媒体只有在被已发布的帖子引用后才会出现在公开的媒体域名上。

## 6. 发布 `POST /posts`

```json
{
  "document": { "version": 1, "blocks": [ … ] },
  "sourceRef": "<记事 ID>",
  "sourceUpdatedAt": "2026-10-22T19:00:00.000Z",
  "kind": "article",
  "syncMode": "follow"
}
```

| 字段 | 说明 |
|---|---|
| `sourceRef` | 记事在乐趣记事本里的 ID，1–200 个可见 ASCII 字符，必填 |
| `sourceUpdatedAt` | 记事的 `update_time`，ISO 8601 带时区，必填；用于判断多设备推送的先后 |
| `kind` | 可选，`short` / `article`；不传则自动判断 |
| `syncMode` | 可选，`follow`（默认，记事修改后同步到帖子）/ `frozen`（发布后不再随记事更新） |

- 新发布返回 **201** `{ "post": PostDto }`；`post.url` 就是分享链接。
- 同一用户、同一来源、同一 `sourceRef` 已有在线的帖子 → 返回 **200** 和原来的帖子（链接不变，内容不更新；改内容请用 PUT）。
- 撤回后再分享同一条记事，会生成新的帖子和新链接。
- 可选 `Idempotency-Key` 请求头（≤ 200 个可见 ASCII 字符，24 小时有效）：网络重试时用同一个 key，得到同一个结果。

## 7. 同步内容 `PUT /posts/{id}/content`

```json
{ "document": { … }, "sourceUpdatedAt": "2026-10-22T19:05:00.000Z" }
```

- 返回 `{ "changed": true|false, "post": PostDto }`。内容和当前版本相同 → `changed: false`，什么都不改。
- `sourceUpdatedAt` 早于当前版本 → 409 `post.stale_update`（`details.current` 是当前版本的时间），表示旧设备的内容不能覆盖新内容。
- `syncMode` 为 `frozen` → 409 `post.frozen`。
- 链接不变，新内容约 1 分钟内在页面上可见。
- 建议：本地保存后防抖约 10 秒再推送；推送前比较 `contentHash` 可省掉无变化的请求。

## 8. 修改设置 `PATCH /posts/{id}`

所有字段可选，`null` 表示恢复自动：

```json
{ "summary": "自定义摘要", "coverMediaId": "6f1c…", "kind": "article", "syncMode": "frozen", "commentsMode": "signed_in" }
```

- `summary` ≤ 500 字；`coverMediaId` 必须是当前文档里的图片（否则 422 `post.cover_not_in_document`）。
- `commentsMode`：`open`（任何人，含匿名）/ `signed_in`（仅登录用户）/ `closed`。
- 不允许出现其他字段。返回 `{ "post": PostDto }`。

## 9. 撤回 `DELETE /posts/{id}`

- 帖子状态变为 `unpublished`，链接立即失效（页面返回 410），媒体从公开域名撤下。
- 30 天后彻底删除（`post.purgeAfter`）。重复撤回不报错。返回 `{ "post": PostDto }`。
- 被平台下架的帖子（`removed`）不能由作者撤回或修改，返回 409 `post.removed`。

## 10. 多设备 `GET /me/sources?source=nicenote`

返回当前用户国际版和国内版的所有在线帖子：

```json
{ "items": [ { "id": "…", "url": "https://niceideas.app/p/…", "source": "nicenote_intl", "sourceRef": "…", "syncMode": "follow", "kind": "article", "contentHash": "…", "sourceUpdatedAt": "…", "updatedAt": "…" } ] }
```

用法：设备 B 修改了在设备 A 上分享过的记事 → 拉取此清单，按 `sourceRef` 找到帖子 → 用 PUT 推送新内容。

## 11. PostDto

```json
{
  "id": "uuid", "slug": "abcd2345efgh67", "url": "https://niceideas.app/p/abcd2345efgh67",
  "kind": "short|article", "kindLocked": false,
  "status": "active|unpublished|removed|author_deleting",
  "source": "nicenote_intl|nicenote_cn", "sourceRef": "…", "syncMode": "follow|frozen",
  "title": "…", "summary": "…", "summaryLocked": false, "coverMediaId": null, "coverLocked": false,
  "contentHash": "…", "sourceUpdatedAt": "…", "publishedAt": "…", "updatedAt": "…", "purgeAfter": null,
  "likeCount": 0, "commentCount": 0, "commentsMode": "open|signed_in|closed"
}
```

只能查询和管理自己通过乐趣记事本发布的帖子；别人的帖子和网页 / 第三方应用发的帖子一律返回 404 `post.not_found`。

## 12. 错误

格式：`{ "error": { "code": "…", "status": 400, "details": … } }`。客户端按 `code` 显示本地化文案，不要直接展示。

| code | 状态 | 含义 / 处理 |
|---|---|---|
| `auth.missing_token` / `auth.invalid_token` | 401 | 没有令牌、签名或签发方不对、已过期 → 刷新令牌后重试 |
| `auth.audience_not_accepted` | 401 | 令牌的 `aud` 不对 |
| `auth.client_not_allowed` | 403 | `client_id` 不在白名单 |
| `request.invalid` / `request.invalid_json` | 400 | 请求格式不对（`details.issues` 给出字段路径） |
| `request.too_large` | 413 | JSON 超过 2 MB |
| `document.invalid` / `document.empty` / `document.too_long` / `document.too_many_images` / `document.too_many_audios` | 400 | 文档不符合第 4 节 |
| `document.media_invalid` | 422 | 文档引用了不存在、不属于该用户或类型不符的媒体 |
| `media.sha256_required` / `media.empty_body` / `media.hash_mismatch` | 400 | 上传请求头或内容不对 |
| `media.too_large` / `media.quota_exceeded` | 413 | 文件太大 / 超出 5 GB 总量 |
| `media.unsupported_type` | 415 | 不支持的格式 |
| `media.unprocessable` | 422 | 文件损坏或无法解析 |
| `post.not_found` / `comment.not_found` | 404 | 不存在，或不属于当前用户 |
| `post.stale_update` / `post.frozen` / `post.removed` / `post.not_active` | 409 | 见第 7、9 节 |
| `post.cover_not_in_document` | 422 | 封面图片不在文档里 |
| `idempotency.key_invalid` 400 / `idempotency.in_progress` 409 / `idempotency.key_reused` 422 | | 幂等键格式不对 / 同一请求正在处理 / 同一个 key 用于了不同请求 |
| `rate.limited` | 429 | 超出频率限制；按 `Retry-After` 头（`details.retryAfterSeconds`）等待 |
| `region.restricted` | 451 | 该接口在中国大陆网络不可用（只有 `GET /me`） |
| `server.internal` | 500 | 服务端错误，`details.errorId` 用于排查；可稍后重试 |

## 13. 频率限制（每个用户，所有来源合计）

- 发布：每小时 30 条，每天 200 条。
- 内容同步：每小时 720 次。
- 媒体上传：每小时 300 个。

## 14. 联调建议

1. 在 staging 用 staging 的令牌走通：上传图片 → 发布 → 打开 `post.url` → 修改记事后 PUT → 撤回。
2. 国内版在生产验收：分享后确认 `post.source` 为 `nicenote_cn`，并在中国大陆网络下打开帖子链接和图片。
