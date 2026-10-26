# 分享链路审查修复（nicematrix-system 交接，2026-10-26）— 方案（Xianglin 2026-10-26 14:05 已确认，按建议执行）

依据：`nicematrix-system/reports/2026-10-26-niceideas-sharing-reverification.md`（以它为准）、`2026-10-25-niceideas-sharing-deep-review.md`（证据/复现）、后台契约 `nicematrix-backend/docs/integration/niceideas-share.md`（1.2.750）。
基线：dev `main` = 1.0.69（staging）；生产 1.0.65。复现脚本 R-N01…R-N12 在 1.0.69 上复跑 **12/12 仍复现**（2026-10-26 13:45）。

## 0. 分批

| 批 | 内容 | 版本 | 说明 |
|---|---|---|---|
| **S1（本方案）** | F02 → F01 → F03（注销相关，统一锁顺序） | 1.0.70，迁移 0017 | 本次确认后实施，只上 staging |
| S2 | F06 + F12 + F20（媒体意图写进 media/media_job 行，worker 串行搬运）、F15、F19 | 1.0.71 | S1 上线后另出方案 |
| 门禁 | F11（冻结 UI 前）、F13（多 worker 前） | — | 写进上线清单，本轮不改 |
| 不改 | F16（后台已截断）、G02（后台处理） | — | 知悉 |
| 需定策略 | F21 MP3 标签、F22 CDN 缓存、F26 音频标记 | — | 见 §5 |

## 1. 统一锁顺序（S1 核心）

- 顺序固定：**先 profile，后 post**。
  - 注销事件处理（申请/取消/最终）：`SELECT profile … FOR NO KEY UPDATE`（不用 FOR UPDATE：点赞/评论插入会对 profile 取 KEY SHARE，FOR UPDATE 会与之互相等待造成死锁）。
  - 推送内容、媒体刷新、管理员恢复、来源建帖、媒体入库：事务内先 `FOR SHARE` 锁 profile（同时查 tombstone），再 `lockPost`。
- 新模块 `src/server/profiles/author-gate.ts`：`lockAuthor(trx, userId)` → `active | deleting | gone`（gone = tombstone 存在或 profile 已删）。所有写路径共用，不各自查询。

## 2. F02 冷静期把关

1. `deletion_requested`：单事务 = 锁 profile → 状态 `deleting` → 删会话 → `active → author_deleting`。提交后按**当前状态**撤回媒体（`author_deleting` 帖子的当前媒体，而不是“本次切换的帖子”），重投时也能补齐。
2. 推送（`push-content.ts`）：锁内看作者状态。
   - `deleting`：照常保存内容，但 `preparing → author_deleting`（不转 active），不登记公开媒体；`gone`：409 `user.deleting`。
   - 事务前已为“会上线”搬到公开桶的媒体，若锁内结论变为不上线 → 提交后立即 `withdrawUnreferencedMedia` 补偿（S2 彻底改为 worker 搬运）。
3. 媒体刷新（`apply-share-media.ts`）：同上锁顺序与补偿；只有锁内帖子 active 才登记公开。
4. 管理员恢复（`moderation/admin.ts`）：锁内重查；作者 `deleting` → `removed → author_deleting`，不搬媒体；`restored` 事件照发（后台会 GET 真实状态）。
5. 取消注销：保持现有 `author_deleting → active`（覆盖冷静期内才有内容的帖子；不动 removed/unpublished）。
6. `switchAuthorPosts` 同时推进 `updated_at`（后台 1.2.750 按 updatedAt 排序的要求）。
7. 公开读取防御：分享页 `load-post`（含 preparing 页）、OG 图路由：作者非 active → 410。列表/搜索/推荐/作者侧栏已按 `profile.status='active'` 过滤（已逐一核对：feed、suggest、search、load-post-aside）。
8. **同类缺口（审查未列，建议一并修）**：`/api/v1/posts` 建帖与同步（`create-post.ts`、`switch-revision.ts`）不查作者状态，冷静期内持有令牌的应用仍能发出 active 帖子并把媒体搬到公开桶 → 同样锁内检查，回 409 `user.deleting`。

不新增帖子状态（`author_deleting` 已在枚举、后台 post-check、管理列表中）。

## 3. F01 注销接收：先副作用后记账

- 迁移 0017：`account_event` 加 `completed_at`（可空）、`claimed_until`（可空）；**存量行 `completed_at = processed_at`**（保持现状语义）。
- 领取：`INSERT … ON CONFLICT DO UPDATE SET claimed_until = now()+租约 WHERE completed_at IS NULL AND (claimed_until IS NULL OR claimed_until < now())`。
  - 返回行 → 执行；已完成 → `duplicate`；他人持有租约 → **503**（prod-1/prod-3 双投递，后台退避重投）。
- 全部步骤成功后写 `completed_at`；失败 → 清租约 + 5xx（后台重投时整段重跑，各步骤幂等）。
- “过期事件”判定只看**已完成**的事件；`purgeOldAccountEvents` 只删已完成的。
- 冷静期/取消/profile_updated 走同一领取-完成流程（覆盖同样的“先记账”窗口）。
- 文件拆分：`account-events.ts`（验签/schema）、`apply-account-event.ts`（领取/分派/完成）、`account-deletion.ts`（三种注销步骤）；repo 加 claim/complete/release。

## 4. F03 终态隔断（tombstone）

- 新表 `deleted_account(user_id PK, deleted_at)`，不改 `profile.status` 枚举。
- 最终注销第一步：锁 profile → 写 tombstone（幂等）→ 提交；之后删对象、删帖、删 profile（删帖后**重新列一次 owner 媒体**，接住期间入库的）。
- 检查点（锁内）：`ensureProfile` 新建分支（`INSERT … WHERE NOT EXISTS tombstone`）、来源建帖、推送、worker 媒体入库（命中则删除刚 PUT 的对象并放弃）。命中 → 409 `user.deleting`。
- 调用 `ensureProfile` 的其他入口：网页登录命中 → 走现有“账号注销中”页（403），`/me`、`/media`、`/posts` → 409 `user.deleting`。
- 保留期：见 §5 问题 2。不随 90 天事件清理删除。

## 5. 决定（Xianglin 2026-10-26 14:05：全部按建议）

已定：1 按方案实施（含 §2.8）；2 tombstone 永久保留；3 冷静期内的推送保存但保持下线；4 F21 白名单方向确认（S2 实施），F22/F26 S2 出方案时再定具体做法。

原问题：

1. **S1 方案是否按上面实施**（含 §2.8 同类缺口）。
2. **tombstone 保留期**：建议 **永久**（只存 user_id + 时间，NiceMatrix 用户 ID 不复用，最简单无窗口）；或 1 年后清理。
3. 冷静期内到达的推送：建议 **保存但保持下线**（取消注销立即恢复，不依赖后台补推）；备选：直接回 409 让后台取消后补推。
4. 之后再定（不阻塞 S1）：F21 公开 MP3 标签策略（建议白名单只留标题/艺人/时长等，去位置/设备/路径/封面，只改标签不重编码）；F22 生产升到 1.0.66+ 后媒体边缘缓存 1 小时 → 改小 s-maxage 还是撤回时做 CDN purge；F26 音频标记渲染还是契约写“不展示”。

## 6. 自测与验收

- 新增集成测试（真实 PG）：
  - preparing 首推 / active 更新 / 管理员恢复 / 媒体完成，各与 `deletion_requested` 交错（含“事务前已搬公开、锁内转下线”的补偿）；取消后状态精确恢复，冷静期前已 removed/unpublished 的不恢复。
  - F01：R-N01 故障注入 → 500 → 重投 → `applied` 且内容删净；并发双投递 → 一个 503；存量 completed 行仍判 duplicate；清理不删未完成事件。
  - F03：R-N09 → 最终注销后 createShare/推送/ensureProfile/媒体入库全部被拒，profile 不复活。
  - 公开读取：作者 deleting 时分享页、preparing 页、OG 均 410。
- 复现脚本：R-N01/R-N02/R-N09 断言的缺陷不再成立（脚本对应用例由通过转为失败），其余 9 项结果不变。
- `pnpm check` 全绿（lint、typecheck、i18n、structure、全部测试）。
- 无新增界面文案（错误码沿用 `user.deleting`）；契约 `docs/api/account-events.md`、`docs/api/nicenote.md` 同步更新（503 进行中、completed 语义、tombstone）。

## 7. 上线

- 提交 + 推送 → staging（迁移 0017 只加列加表，旧代码可忽略）→ 验证健康与注销三路径 → 回报 nicematrix-system。
- **生产另行确认**。注意生产仍是 1.0.65，升级会连带 1.0.66–1.0.69（含 F22 的 `s-maxage=3600`）；上线前先只读查询生产库是否已有“事件已记、内容未删”的 R-N01 受害账号（`deletion_completed` 已记但 profile 仍在），有则另报处置。
