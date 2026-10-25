# 需要 nicematrix-system 提供的事项（由 Xianglin 转达）

更新于 2026-10-25。

| # | 事项 | 状态 |
|---|---|---|
| 1 | 乐趣记事本 client_id 白名单 | 作废：乐趣记事本不再直接调用 NiceIdeas，分享改为后台经签名来源接口发起（契约 nicematrix-backend `docs/integration/niceideas-share.md`），`FIRST_PARTY_*` 已删除 |
| 2 | Logto Web 应用（staging + 生产） | 已完成（网页登录 staging 和生产都已上线） |
| 3 | 删号联动 | 已完成：staging 和生产都已订阅，按 `docs/api/account-events.md` 投递；生产端到端测试 2026-10-25 通过 |
| 4 | 开放 API resource + OmniFire 第三方应用 | 后台应用目录已在生产上线（`GET /v1/oauth/apps/{id}`）；待 OmniFire 在生产发帖联调 |
| 5 | NiceIdeas 会员（方案 §17） | 暂不实施；实施前需要独立会员服务键、按 user_id 查询会员状态的接口、会员变化推送（HMAC 签名、幂等） |
