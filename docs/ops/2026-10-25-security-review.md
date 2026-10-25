# NiceIdeas 安全审查（2026-10-25，v1.0.66 代码 + staging / 生产部署）

## 结论
发现 2 个需要修的问题，2 处加固，其余检查项都正常。

| # | 问题 | 风险 | 处理 |
|---|---|---|---|
| S1 | **源站可以绕过 Cloudflare 直接访问**（直连 prod2 的 443 端口返回 200）。应用信任请求头里的 `CF-Connecting-IP`（访客 IP）和 `CF-IPCountry`（国家），直连时这两个头可以伪造：按 IP 的限流和封禁可以被绕过，中国大陆规则也可以被绕过。 | 中 | nginx 只放行 Cloudflare 的地址段，其他直接返回 403；同时补上 IPv6 地址段（原来只信任 IPv4）。已写进 `deploy/niceideas.app.conf` 和 `deploy/t.niceideas.app.conf`，`nginx -t` 语法测试通过。**改 nginx 要你确认后才能上线**（staging 和生产）。 |
| S2 | **登录后跳转可以被引到外站**：`/auth/sign-in?next=` 和关注表单的 `next` 只拦了 `//` 开头，没拦 `/<Tab>/evil.example` 这种写法。浏览器会把 Tab 和换行去掉，结果就变成跳到外站。 | 低到中（可用于钓鱼） | 所有跳转目标统一走一个检查（`src/server/http/safe-path.ts`），拒绝空白、控制字符和反斜杠，并补了测试。v1.0.67。 |
| H1 | 网站没有发 HSTS 头 | 低 | 所有响应加 `Strict-Transport-Security: max-age=31536000`，静态文件也加 `nosniff`。v1.0.67。 |
| H2 | 生产备份只存在 prod2 本机 | 运维 | v1.0.66 增加异地备份（R2 私有桶，保留 30 天），需要随生产部署启用。 |

## 检查过、没有问题的项
- 依赖：`pnpm audit --prod` 无已知漏洞。
- 页面响应头：CSP 严格（`script-src 'self'`、`frame-ancestors 'none'`、`object-src 'none'`、`base-uri 'none'`），`nosniff`，`Referrer-Policy`。
- Cookie：`HttpOnly`、`SameSite=Lax`，https 下加 `Secure`；会话存在服务器端。
- 跨站请求：所有网页表单的写操作（发帖、删帖、关注、设置、登出、后台操作、点赞、评论、举报）都检查 `Origin`，不是本站就拒绝。开放 API 用 Bearer 令牌，内部接口用 HMAC 签名，都不依赖 Cookie。
- 后台权限：每个页面和操作都按 `admin_member` 和 `ADMIN_USER_IDS` 查角色，没有权限返回 404；只读角色不能执行操作。
- 内容渲染：Markdown 经 sanitize-html 白名单过滤（链接只允许 http、https、mailto），其他文本统一转义。
- 内部接口：来源接口用 HMAC 签名，带时间窗、一次性随机数和调用方白名单（生产实测：未签名 401，调用方不对 403）；注销事件用 HMAC 签名，带时间窗，按事件 ID 去重。
- 限流：发帖、修订、媒体、评论、点赞、举报都有按用户、应用或 IP 的上限。
- 仓库：没有提交过密钥（查过私钥、云密钥、令牌的特征）。

## 以后再看
- 有清缓存权限的 Cloudflare token 到位后：删帖和注销时清掉媒体的边缘缓存。
- 网页上传图片现在在网站进程里处理，可以改成交给 worker，减少大图拖慢网站的风险。
