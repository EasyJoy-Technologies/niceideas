# 需要 nicematrix-system 提供的事项（由 Xianglin 转达）

更新于 2026-10-25。

| # | 事项 | 状态 |
|---|---|---|
| 1 | 乐趣记事本 client_id 白名单 | 作废：乐趣记事本不再直接调用 NiceIdeas，分享改为后台经签名来源接口发起（契约 nicematrix-backend `docs/integration/niceideas-share.md`），`FIRST_PARTY_*` 已删除 |
| 2 | Logto Web 应用（staging + 生产） | 已完成（网页登录 staging 和生产都已上线） |
| 3 | 删号联动 | 已完成：staging 和生产都已订阅，按 `docs/api/account-events.md` 投递；生产端到端测试 2026-10-25 通过 |
| 4 | 开放 API resource + OmniFire 第三方应用 | 后台应用目录已在生产上线（`GET /v1/oauth/apps/{id}`）；待 OmniFire 在生产发帖联调 |
| 5 | NiceIdeas 会员（方案 §17） | 暂不实施；实施前需要独立会员服务键、按 user_id 查询会员状态的接口、会员变化推送（HMAC 签名、幂等） |
| 6 | 帖子可见范围新增「仅关注者 / 仅朋友」（v1.0.93，只在网页上设置） | 仅告知，现在不需要改：帖子对象里 `visibility` 仍只有 public / private（这两种算 private），新增字段 `audience` 给出实际值，`visibility_changed` 事件也带上它；以后乐趣记事本要支持时再对接（`docs/api/nicenote.md`） |
