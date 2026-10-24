# 乐趣记事本分享（由后台写入）— NiceIdeas 实现方案（2026-10-23）

状态：待 Xianglin 确认（2026-10-23 22:06 已定：网页“删除”、1 亿像素上限，见第 12 节、第 5 节）。接口以 nicematrix-backend `docs/integration/niceideas-share.md` v1（下称“契约”）为准；本文只写 NiceIdeas 怎么实现。

## 0. 现状核对（已查）
- 分享密钥：本机 `/root/keys/niceideas-share-staging.env`、`niceideas-share-prod.env`（变量 `NICEIDEAS_SHARE_HMAC_KEY`）。
- 注销通知密钥：NiceIdeas staging 和生产的 `ACCOUNT_EVENTS_SECRET` **早已配置**，与 `/root/keys/niceideas-account-events.env` 里对应的值一致。后台消息说“双方都还没配置”，其实 NiceIdeas 这边已配好，只差后台启用订阅。
- 时钟：本机和 prod2 都已 NTP 同步（签名要求 ±300 秒）。
- 工具：staging 主机有 ffmpeg 7.1.5 和带 HEIC 支持的 ImageMagick；prod2 **没有** ffmpeg 和 HEIC 解码工具，需要安装。
- prod2：2 vCPU，可用内存约 1 GB，磁盘剩 16 GB；网站服务内存上限 900M。
- 网页上目前**没有**作者删除帖子的入口（将新增，见第 12 节）。

## 1. 结构
- 来源接口：`src/app/api/internal/v1/nicenote/**` → `src/server/nicenote/`（请求校验、建帖、推送、设置、撤回、查询、post 对象）。复用现有帖子、修订、自动推导、媒体公开 / 撤下逻辑，不另起一套。
- 服务签名：`src/server/service-auth/`（签名、校验、nonce 表），算法逐字对齐后台 `shared/service-auth.js`。
  - 入站调用方白名单：生产 `nicematrix-intl`，staging `nicematrix-staging`；出站 `X-NM-Service: niceideas`。
  - 密钥未配置一律 503；密钥只在服务器环境变量里，不进仓库、不打日志。
- **新增后台任务进程 `niceideas-worker`**（systemd，独立于网站进程）：
  - 媒体队列：一次处理一个，低优先级（nice 10、空闲 IO、单独的 CPU / 内存上限，建议 CPU 80%、内存 600M）。
  - 出站通知队列：用户登记、帖子事件，按 1 分钟、5 分钟、30 分钟、之后每小时重试，满 24 小时后记录最终失败。
  - 头像下载。
  - 队列都存在数据库里：重启不丢，多进程不会重复处理。
  - 为什么单独一个进程：2 GiB 音频转码、大图解码很吃 CPU 和内存。放在网站进程里会拖慢网页，还可能顶到 900M 上限被系统杀掉。

## 2. 数据库（一次迁移 0013）
- post：状态增加 `preparing`；来源增加 `nicenote`；新列 share_id（唯一）、source_revision、region、media_state。
- media：新列 source_ref（同一用户唯一，按 ref 去重）。
- 新表：media_job（拉取和处理队列）、outbox（出站通知）、service_nonce（签名 nonce，保存 ≥ 600 秒）。
- profile：新列“昵称改过”“头像改过”。
- account_event：事件类型增加 profile_updated。
- staging 上已有的 4 条 nicenote_intl 测试帖保持不变，旧格式照常显示。

## 3. 来源接口（契约 §3）
- **POST /posts**：按 shareId 幂等（新建 201 / 已有 200）。只写数据库、立即返回，不做任何外部请求。新帖状态 preparing。带 profile 时按第 6 节规则处理；第一次建资料时把“登记用户”放进出站队列。
- **PUT /posts/{id}/content**：
  - sourceRevision 小于已保存的 → 409 `post.stale_update`。
  - 内容哈希相同 → `changed:false`。但如果请求里给了新的取件地址，还没成功的媒体会用新地址重新排队（见第 11 节问题 2）。
  - 第一次推送后 preparing → active；已下架 → 409 `post.removed`；已撤回 → 409 `post.unpublished`。
  - 推送后页面立即是新内容（见第 4 节缓存）。
- **PATCH / DELETE / GET**：按契约；post 对象含 shareId、mediaState、sourceRevision。
- 请求体上限 8 MB（只放宽这组接口）。错误格式不变。

## 4. 文档与页面
- 新的来源文档结构：text、rich（行 + 行内样式）、todo（items[].runs）、image / audio（ready 带 ref / mime / bytes；pending 显示占位）。不限块数、图片数、音频数、字数；blocks 可以为空。
- 新渲染模块（不走 markdown）：连续 bullet / ordered 合成一个列表（按 indent 嵌套），连续 quote 合成一个引用，heading 整体降一级，空 paragraph = 空行，text 一律转义，href 再校验只允许 http / https / mailto，外链 rel 与现有一致。
- 页面状态：
  - preparing：“内容准备中”，noindex，不进时间线、发现、搜索，没有点赞和评论。
  - 空文档：“没有内容”。
  - 媒体处理中：占位“媒体处理中”；失败：“媒体暂不可用”；pending：同处理中占位。
- 摘要、类型、封面照旧自动推导（从 runs 取纯文本）；封面没处理完时，分享卡片用现有的生成卡片。
- 来源标识统一显示“乐趣记事本”；管理后台统计按 region 分国内 / 国际（只在后台可见）。
- 4 条新文案 × 40 种语言，全部真实翻译。
- 页面缓存：帖子页的缓存键加入帖子版本（修订、状态、媒体状态）。推送后下一次访问就是新内容，多进程下也成立。

## 5. 媒体
- 拉取：只允许访问配置好的后台地址下的 `/v1/internal/niceideas/media/` 路径，防止被用来访问内网或任意地址。带签名 GET，流式写临时文件；同一地址最多 8 次、最多 2 个连接；过期按 `media_failed`（fetch_expired）处理。
- 去重：同一用户、同一 ref 已有媒体就不再拉取。
- 图片：
  - 支持 HEIC/HEIF（用 libheif 解码后进入现有流程）和 BMP。
  - GIF、动图 WebP 保留动画；第一帧用作封面和兜底图。
  - 超长图：缩放后高度超过 16383 px 时不用 WebP，改用 JPEG；超过 65535 px 时切片。
  - 继续去掉全部元数据，不保留原图。
- 音频：AAC 只重新封装成索引前置的 M4A（不重编码）；MP3 原样保留；其他格式（WAV、FLAC、APE、WMA、AMR、OGG、AIFF、CAF 等）转成约 128 kbps 的 AAC/M4A；去掉时长上限。
- 某个媒体失败只影响这一块，发 `media_failed`（reason：fetch_failed、fetch_expired、too_large、unsupported_format、decode_failed、transcode_failed）；全部处理完发 `media_ready`。
- 单个文件 ≤ 2 GiB。
- 图片解码上限：保留单张 1 亿像素（Xianglin 已同意）；超出发 media_failed（too_large），页面这一块显示“暂不可用”。
- 额度：所有来源去掉 5 GB 检查和 `media.quota_exceeded`，只保留用量统计。网页和第三方直接上传仍保持现有单文件上限（图片 30 MB、音频 150 MB）。

## 6. 资料同步（契约 §5）
- 一个模块统一处理三个入口：网页登录、建帖里的 profile、profile_updated。
- 用户名始终跟随 NiceMatrix；NiceMatrix 没有用户名 → 用用户 ID（v1.0.62 规则）；用户名不能用或已被占用 → 保留当前的（现有规则）。
- 昵称、头像：没在 NiceIdeas 改过就跟随，改过就不再跟随；NiceIdeas 的修改不回写。设置页保存昵称即标记为“改过”；把昵称清空保存 = 恢复跟随。NiceIdeas 目前不能改头像，所以头像总是跟随。
- 头像：由后台任务进程下载（只允许 https、公网地址、≤ 10 MB、必须是图片），生成两个尺寸存到公开存储桶，资料改用自己的地址；下载失败保留旧头像。网页登录带来的头像也走同一流程。
- account-events 新增 profile_updated：收到直接应用；**不参与先后判断**（否则之后到达的注销事件会被误判为过期）；用户不存在时返回 200 `{"result":"unknown_user"}`。

## 7. 通知后台（契约 §4）
- 第一次建资料 → `POST /v1/internal/niceideas/users`。上线前用一次性运维命令给已有用户补登记（staging 3 个，生产 1 个）。
- 帖子事件：平台下架 removed、撤销下架 restored、media_failed、media_ready。作者在网页删除帖子 → unpublished（第 12 节）。eventId 保证幂等。

## 8. 停用旧接口
- 乐趣记事本令牌调用 /media、/posts、/posts/*、/me 一律 401 `auth.audience_not_accepted`；删除 /me/sources；去掉 FIRST_PARTY_* 配置。第三方接口不变。
- 内部测试发布工具不再写 nicenote_intl：改为通过签名请求走新的来源接口，用作 staging 冒烟测试。
- 文档：`docs/api/nicenote.md` 重写为来源接口说明（注明以契约为准）；`account-events.md` 加 profile_updated；`third-party.md` 去掉额度；平台方案 §8 更新。

## 9. 分期（都先上 staging）
| 期 | 内容 | 版本 |
|---|---|---|
| S1 | 签名、迁移、来源接口、新文档渲染、preparing 页面、文案、资料同步和 profile_updated、停用旧接口、去掉额度；网页删除帖子（所有来源）、用词“撤回”改“删除” | v1.0.63 |
| S2 | 后台任务进程：媒体拉取和处理（HEIC / BMP / 动图 / 长图 / 音频转码）、出站通知（含网页删除的 unpublished）、头像下载、用户补登记 | v1.0.64 |
| E | 网页编辑帖子（设计稿确认后实现） | v1.0.65 |
- 每期：`pnpm check`、自动测试（签名用固定样例与后台算法逐字对齐、幂等、旧不覆盖新、各类媒体样本、事件重试）；部署 staging 后先用签名脚本自测一遍，再交给后台联调。
- S1 上线后，后台就能联调建帖和纯文字推送；S2 上线后联调媒体。

## 10. 系统变更（每项单独确认）
- staging 主机：新增 systemd 服务 `niceideas-staging-worker`；`/etc/niceideas/env.staging` 增加分享密钥、后台地址、调用方白名单。
- prod2（生产上线时）：apt 安装 ffmpeg 和 libheif 工具；新增 `niceideas-worker`；`env.production` 增加同样的配置。
- nginx 不用改（8 MB 小于现有的 160 MB 上限）。

## 11. 需要确认的问题
1. **sourceRevision 相同但内容不同**：媒体从 pending 变 ready 时版本号可能不变，所以按“接受并更新”处理。请后台确认。
2. **失败媒体什么时候重试**：后台“内容没变不推送”，那失败的媒体就拿不到新的取件地址。建议后台收到 media_failed 后主动推送一次（同版本、同内容、带新地址）；NiceIdeas 只会重新排队失败的媒体。
3. ~~**图片解码上限**~~ 已定（保留 1 亿像素）：2 vCPU / 1 GB 内存解不了任意大的图（比如 2 亿像素的 PNG 解码要约 800 MB 内存）。建议保留现在的 1 亿像素上限，超出发 media_failed（too_large）。普通长截图（1080×30000 约 3200 万像素）不受影响。需要 Xianglin 决定。
4. **profile_updated 用户不存在**：返回 200 `unknown_user`，请后台确认会当作成功。
5. **注销通知密钥**：NiceIdeas 两个环境都已配置，后台可以直接启用订阅并验证投递。
6. ~~**网页撤回入口**~~ 已定：所有帖子都能在网页删除，见第 12 节。
7. **应用发来的帖子能不能在网页改内容**（乐趣记事本、第三方应用）：建议不改内容，“编辑”里提示“请在乐趣记事本中修改，帖子会自动更新”，只能改评论设置；如果允许改，改完这条帖子就不再跟随记事更新，需要和后台在契约里加一个事件。待 Xianglin 决定。

## 12. 网页编辑与删除（Xianglin 2026-10-23 22:06）
- 用词：面向用户一律叫“删除”，不再用“撤回”。范围：帖子状态页、提示、管理后台状态、关于和帮助页、条款和隐私政策，40 种语言。内部状态仍是 `unpublished`，接口和事件名不变。
- 删除：所有帖子（网页、乐趣记事本、第三方应用）作者都能在网页删除。
  - 入口：帖子页“⋯”菜单（作者看到“编辑”“删除”，其他人看到“举报”）；自己主页上的帖子卡片同样有。
  - 二次确认；不开 JS 也能用。
  - 删除后：链接立即失效（410，“作者已删除这条内容”），媒体立即撤下；30 天后彻底清除（沿用现有清理任务）。
  - 乐趣记事本帖子：通知后台 `unpublished`，分享记录标为已删除，再分享生成新链接。第三方应用帖子：应用查询时看到 `unpublished`。
- 编辑：
  - 网页发的帖子：打开现有编辑器并带出当前内容，保存后生成新版本，链接不变。
  - 应用发来的帖子：见第 11 节问题 7。
  - 编辑界面先出设计稿，确认后再实现（平台方案 §16.5）。
- 分期：删除和改用词放进 S1；编辑单独一期 E。
