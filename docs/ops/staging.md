# Staging（t.niceideas.app）

| 项 | 值 |
|---|---|
| 服务 | systemd `niceideas-staging`（`deploy/niceideas-staging.service`），`127.0.0.1:3110` |
| 环境变量 | `/etc/niceideas/env.staging`（600，含数据库密码与 R2 密钥，不入库） |
| 数据库 | 容器 `niceideas-postgres-staging`（postgres:17-alpine，卷 `niceideas-pg-staging`，仅 `127.0.0.1:25434`） |
| 媒体 | R2 私有桶 `niceideas-staging-private`；公开桶 `niceideas-staging-public` → `https://media-staging.niceideas.app`；R2 令牌只授权这两个桶，副本 `/root/keys/niceideas-staging-r2.env` |
| nginx | `/usr/local/nginx/conf/sites-enabled/t.niceideas.app.conf`（源 `deploy/t.niceideas.app.conf`），Cloudflare 源站证书 `/etc/ssl/niceideas.app.*` |
| 部署 | 在开发目录执行 `deploy/deploy-staging.sh`：构建 → `releases/<版本>-<sha>` → 迁移 → 切换 `current` → 重启 → 核对 `/api/v1/meta` 版本；保留 3 个版本 |
| 回滚 | `ln -sfn /var/www/niceideas-staging/releases/<旧版本> /var/www/niceideas-staging/current && systemctl restart niceideas-staging`（仅限无新迁移的版本） |
| 测试发布 | `cd /var/www/niceideas-staging/current && set -a && . /etc/niceideas/env.staging && set +a && node dist/publish.mjs publish --user <id> --text …`（另有 `withdraw`） |
| 维护任务 | `niceideas-staging-maintain.timer`（每天 UTC 10:30）运行 `dist/maintain.mjs`：清理过期帖子与无引用媒体、重试公开桶下线、清过期幂等键和封禁；`journalctl -u niceideas-staging-maintain` 查看结果 |
| 审核 | `node dist/moderate.mjs reports`；隐藏 / 删除评论、封禁评论者、下架 / 恢复帖子、关闭评论、处理举报均需 `--actor <操作人> --reason <原因>`，全部写审计表 `moderation_action` |
| 旧目录 | Sharkey 时期的 `.git` 已移到 `/root/backups/niceideas/staging-sharkey-git-20261019` |

## 已知局限
- 撤回后公开桶对象立即删除，但 Cloudflare CDN 缓存最长保留 `MEDIA_CACHE_CONTROL`（5 分钟）；本机 Cloudflare 令牌没有清缓存权限，主动清缓存待生产前补上。
