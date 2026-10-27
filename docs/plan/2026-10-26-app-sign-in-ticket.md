# App 内以本人身份打开 NiceIdeas：一次性登录票 — NiceIdeas 实现方案

日期：2026-10-26 · 状态：已确认（Xianglin 21:47：按方案做；中国大陆也要能处在登录状态）· 版本：v1.0.78 · 契约：nicematrix-backend `docs/integration/niceideas-share.md` §10（10.2–10.4 由 NiceIdeas 实现）。

## 1. 位置与边界
| 部分 | 归属 | 说明 |
|---|---|---|
| 签发 `POST /api/internal/v1/nicenote/web-tickets` | `src/server/nicenote/`（来源接口层） | 走现有 `sourceRoute`（验签、8 MB 上限、错误格式） |
| 作者资料准备 | 从 `create-share.ts` 抽出 `source-author.ts` | `ensureProfile` → 非 active 抛 `user.deleting` → `followNiceMatrixProfile`；建帖与签票共用，不复制 |
| 票的存取 | `src/server/db/repos/web-tickets.ts` | 插入 / 原子兑换 / 维护清理 |
| 票的生成与校验 | `src/server/auth/app-ticket/ticket.ts` | 256 位随机 base64url，库里只存 SHA-256，60 秒 |
| 兑换 `POST /auth/app-ticket` | `src/server/auth/app-ticket/exchange.ts` + `src/app/auth/app-ticket/route.ts` | 表单解析、跨站判断、会话处理、303 |
| 跨站判断 | `src/server/auth/app-ticket/request-site.ts` | 纯函数，单测覆盖 |
| 会话来源 | `session.ts` / `repos/sessions.ts` | `startSession(db, userId, source)`；`endSession` 返回被结束会话的来源 |
| 退出 | `sign-in-flow.ts` `signOut` | app 来源 → 只结束会话回首页；web 来源不变 |

## 2. 数据（迁移 0022）
- `web_ticket(id_hash PK, user_id → profile ON DELETE CASCADE, expires_at, used_at)`。
- 兑换一条语句：`UPDATE … SET used_at = now() WHERE id_hash = $1 AND used_at IS NULL RETURNING user_id, expires_at`
  （查找 + 作废原子完成；返回行过期 → `expired`；无返回行 → 再查一次只为区分日志类别 `used` / `invalid`）。
- `web_session.source text NOT NULL DEFAULT 'web' CHECK (source IN ('web','app'))`；已有会话为 web。
- 每日维护：删除 `expires_at < now()` 的票（已用的票也在 60 秒内过期，一并清掉）。

## 3. 签发
- 请求 `{ userId, profile }`，profile 校验沿用建帖的 schema（抽成共用）。
- 201 `{ ticket, expiresAt, exchangeUrl = PUBLIC_BASE_URL + /auth/app-ticket }`；不幂等；用户非 active / 已注销 → 409 `user.deleting`。
- 日志只记 `{event:"web_ticket", action:"issue"}`，不记票、不记 userId 以外的资料。

## 4. 兑换（一律 303 + `Cache-Control: no-store`，Location = `safeNext(next)`）
1. 跨站（`Sec-Fetch-Site` = cross-site / same-site，或 `Origin` 存在且既非本站也非 `null`）→ 直接跳转，不读票、不动会话。
2. 正文上限 4 KB；无 `Content-Type` 或 `application/x-www-form-urlencoded` → 表单解析；其他类型 / 超限 → 按无效票。
3. 票有效且用户 active：当前会话同一用户 → 保留（`reused`）；否则结束旧会话（有旧会话 → `switched`，无 → `ok`），新建 app 来源会话；清 `ni_sso`。
4. 票无效 / 过期 / 已用 / 用户非 active → 结束已有会话，访客跳转。
5. 日志：`{event:"app_ticket", result, secFetchSite, origin: none|null|self|other, contentType}` —— 不记票；
   请求头三项用于验收第 10 条的真机实测回报。

## 5. 退出
- app 来源：结束会话 + 设 `ni_sso`（避免回首页时 WebView 里再走静默单点去 Logto）→ 303 `/`。
- web 来源：保持现状。`isSameOrigin` 保持不变，真机确认 WebView 里页面提交的退出表单带本站 Origin。

## 6. 决定与实现中补充的点
1. **中国大陆（已同意）**：`/auth/app-ticket` 归入新的访问类别 `app_sign_in`（大陆放行），从 451 代理路径中排除。
   实现中发现：大陆的帖子页原来**完全不读会话**（`pageContext` 在受限时 viewer 固定为空），只放行兑换并不能让国内用户处在登录状态。
   因此改为"页面允许访问时就识别登录用户"：大陆只有帖子页允许，所以只影响 `/p/…`——作者能看到自己的私有帖子；
   受限页面照旧不显示账号菜单、通知、导航；作者"⋯"菜单在大陆不显示"编辑"（编辑页在大陆是 451），"设为私有/公开""删除"可用。
   451 页本身改按 site 类别取上下文（大陆不再为它查会话，行为与原来相同）。
2. **隐私政策**：不改（Cookie 仍是 `ni_sid`，不新增收集的数据）。
3. **Cloudflare**：部署 staging 后从外部经 Cloudflare 实测（无 Origin 的表单 POST、303、no-store、不被拦截）。
4. **顺带修复（同一根因）**：`safeRedirectPath` 对非 ASCII 字符做百分号编码。原来 `next` 里有中文（如 App 传 `/search?q=中文`）
   时写入 `Location` 会抛异常（500）；网页登录、语言/主题切换的跳转同样受益，ASCII 路径结果不变。
5. **发现、不在本次范围**：网页上的点赞、评论目前都不绑定登录用户（点赞按浏览器、评论均为匿名），App 会话同样如此；
   契约 §10 目的里"点赞、评论都是本人身份"需要另立任务（署名评论、评论显示、`signed_in` 评论模式）。

## 7. 测试与文档
- 单元：跨站判断、表单解析、票格式。集成：签发（新用户建资料+登记 / 已有用户跟随 / 注销中 409 / 验签）、兑换全部分支
  （ok / reused 不增行 / switched 删旧会话 / 二次使用 / 过期 / 用户注销中 / 跨站不动会话 / next 三种恶意值 / 无 Content-Type）、
  app 来源退出不跳 Logto、维护清理。
- 文档：`docs/api/nicenote.md`（签发接口 + 兑换）、README 新增"会话与 Cookie"小节、`changelog/v1.0.78.md`。无新用户文案。
- 真机 Android / iOS 验收需要 App 端配合（后台 1.2.753 上 staging 后）；我能做的是 staging 上用 curl 经 Cloudflare 跑完所有服务端分支。
