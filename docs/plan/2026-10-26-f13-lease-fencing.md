# F13 worker 租约 fencing — 方案（待确认）

依据：`nicematrix-system/handoffs/2026-10-26-niceideas-f13-lease-fencing.md`；复现 R-N06。
基线：dev `main` = 1.0.72（staging，含 F22）；交接以 `9235050` 为准，相关文件 F22 未改动（只多了 cdn_purge 队列）。
目标：允许多 worker 并行；单 worker 下调度、重试节奏、超时、日志格式不变。版本 1.0.73，迁移 0020（只加列）。

## 1. 迁移 0020_lease_tokens

- `media_job`、`outbox`、`avatar_job` 各加 `lease_token uuid NULL`。存量行为空；down = 删列。
- 唤醒触发器（0015）条件只看 `run_after`，不受影响。

## 2. media_job（`repos/media-jobs.ts`、`worker/media-job-runner.ts`）

- `claimMediaJob`：同时写 `lease_token = gen_random_uuid()`，随行返回。
- `extendMediaJobLease` / `settleMediaJob` / `retryMediaJobLater` / `releaseMediaJob`：一律 `WHERE state='running' AND lease_token = 本次 token`；结束类写入同时清空 token；返回是否命中。
- `upsertMediaJob`（复活）、`linkMediaRef`：同时清空 token（旧 owner 之后的写入必然落空）。
- runner：
  - 续租（仍是 60 秒一次）返回未命中 → 通过新的 AbortController 中止 `runJob`（与关停信号合并），不再下载/转码/写对象。
  - settle/retry/release 未命中 → 记 `{"event":"lease_lost","queue":"media_job",…}`，不触发 `refreshShares`，不记成功日志，不抛错。
- 已写入的对象：同 (owner, sha256) 并发入库时只有一行生效，输家删除自己前缀下的对象（`store-media.ts:99`，已核对，前缀随机不会误删）；输家在新 owner 失败后才入库的极端情况，留下的私有媒体行无引用，7 天后由维护任务删除（`listDeletableMedia`，已核对）。

## 3. outbox（`repos/outbox.ts`、`worker/outbox-delivery.ts`）— 采用交接方案 a

- 逐条领取：每次领 1 条，最多 20 条/轮（`BATCH` 不变），租期 120 秒不变；单条最长 15 秒，远小于租期，批尾不会过期。
- 领取顺序：到期条目中按 `created_at` 最早优先——与现在“整批按 created_at 发送”的顺序一致（若按 run_after 会让重试的旧事件排到同帖新事件之后）。
- `settleOutbox`：`WHERE id AND lease_token`，清空 token；未命中 → `lease_lost` 日志。
- 重复发送：users 注册幂等；post-events 回读当前状态；`media_failed` 重复最多让后台多推一次（交接已确认可接受）。

## 4. avatar_job（`repos/avatar-jobs.ts`、`worker/avatar-job-runner.ts`）

- claim 写 token；`settleAvatarJob` 加 `lease_token` 条件（保留原有 source/state 条件），清空 token；`queueAvatarJob` 替换时清空 token。
- 头像写入 profile 也 fencing：`setAvatar` 只在本次 token 仍持有时生效（`EXISTS … FOR SHARE` 锁住任务行，期间别人领不走）。否则走现有 stale 分支：删掉刚写的 key，不删旧头像——避免两个 worker 各写一个 key、其中一个永久遗留在公开桶。

## 5. account_event（web 进程，顺带核对）

- `claimAccountEvent` 返回本次 `claimed_until`（截到毫秒，同 refresh token 做法）；`releaseAccountEvent` 加 `claimed_until = 本次` 条件，不再清掉别人的租约。`completeAccountEvent` 不变（各步骤幂等，完成即属实）。

## 6. 不改

媒体刷新（`refresh_due_at`）、cdn_purge（`run_after`）、可见性（`until`）：已有 token，只补测试。不引入 advisory lock / 分布式锁。

## 7. 测试

新文件 `tests/integration/worker/lease-fencing.test.ts`（真实 PG）：
- R-N06 反转：旧领取的 extend/settle 影响 0 行，任务保持新领取者状态。
- media_job、outbox、avatar_job：领取 → 租约过期 → 别人领取 → 旧 owner 的续租/settle/retry/release 全部无效 → 新 owner 正常完成。
- media 续租失败（fake timers 只伪造 setInterval，fake backend 挂起下载）：`runJob` 中止，私有桶无新对象，无刷新，任务保持新 owner 状态，有 `lease_lost`。
- avatar：旧 owner 头像写入被拦，key 被清理，公开桶无遗留。
- outbox：每条发送模拟耗时 15 秒（把库内时间整体前移），20 条处理完，正在发送的条目始终未到期、无法被第二个 worker 领走；顺序按 created_at。
- 刷新 / cdn_purge / account_event：旧 token 的 finish/defer/delete/retry/release 无效。

新文件 `tests/integration/worker/lease-stress.test.ts`：两个独立 Node 子进程（`tsx`）连同一 PG，各跑 media_job / outbox / avatar_job 循环，各 100+ 任务；父进程随机让一部分在途租约过期（每个任务最多一次，避免把媒体任务真的耗到 3 次上限）。断言：全部终态正确、无 running / 残留 token；用测试库触发器统计“进入终态”恰好一次；私有桶对象 = 媒体行对象，公开桶头像无遗留；记录 `lease_lost` 次数。

`pnpm check` 全绿（原有测试全过即单 worker 行为未变）；复现脚本 R-N06 由“复现”转为不再复现。

## 8. 上线

提交推送 → staging（迁移只加列，旧代码可忽略）→ 健康 + 日志无 `lease_lost` → 回报 nicematrix-system → 生产单独确认。生产保持单 worker 运行一段时间、确认 `lease_lost` 为 0 后才允许扩实例（写进上线清单）。
