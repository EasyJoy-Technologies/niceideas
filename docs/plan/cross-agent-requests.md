# 需要 nicematrix-system 提供的事项（由 Xianglin 转达）

| # | 事项 | 需要的时间点 | 内容 |
|---|---|---|---|
| 1 | 乐趣记事本 client_id 白名单 | 乐趣记事本对接发布 API 前 | 国际版、国内版各端（iOS / Android / 桌面）的 Logto `client_id` 列表，填入 `FIRST_PARTY_CLIENT_IDS`；令牌 audience 仍为 `https://api.nicematrix.com`（国际）与 `https://apiv3.ej-mobile.cn`（国内） |
| 2 | Logto Web 应用（staging + 生产） | 阶段 2（网页登录） | 回调 `https://t.niceideas.app/auth/callback`、`https://niceideas.app/auth/callback`；登出回跳站点首页 |
| 3 | 删号联动契约 | 阶段 3 | 删号编排新增"通知 niceideas"步骤：HMAC 签名、幂等、失败重试与告警；niceideas 收到后删除该用户资料、帖子、媒体、点赞与评论 |
| 4 | 开放 API resource + OmniFire 第三方应用 | 阶段 3 | audience `https://api.niceideas.app` |
