# 阿里万相 视频生成(会动的水墨)

把《尘世浮生》场景的水墨静图,用阿里云 DashScope 通义万相**图生视频(i2v)**动画化成 5 秒循环短片
(雾动、水波、火星升腾、缓推镜头),做成沉浸式动态转场。游戏侧已接入:场景有视频就放视频(优先级
**video > 图 > SVG > 渐变**),`<video autoplay loop muted>` 自动循环。

## 目录
- `config.mjs` —— Key、端点、模型(t2v=`wanx2.1-t2v-turbo`,i2v=`wanx2.1-i2v-turbo`)。读环境变量 `DASHSCOPE_KEY`。
- `gen-video.mjs <jobs.json>` —— 异步建任务→轮询→下载到 `public/story-video/<key>.mp4`。
  - 默认 i2v:若 `public/story-art/<key>.png` 存在就动画化它;否则 t2v(用 prompt)。
  - 幂等(已存在跳过)、并发2(视频任务重)、失败重试。
  - `--t2v` 强制文生视频;`--force` 覆盖;`--concurrency N`。
- `jobs/_pilot.video.json` —— 6 个名场面试点(开场/赤壁/统一/宝船/登基/火攻)。
- `_sample_t2v_5s.mp4` —— 实测出片样片(5s 720p 文生视频),证明链路可用。

## 出图后装配
视频下载后,跑 `node scripts/stepfun/build-manifest.mjs` 扫描 `public/story-video` 写进
`src/game/art-manifest.ts` 的 `VIDEO` 表,游戏即生效。

## 状态(2026-06-18)
- 链路已验证:t2v、i2v 各成功出片 1 条(i2v 把 chenshi/age7 动画化,2.3MB)。
- **批量受阻:阿里账户欠费(HTTP 400 `Arrearage`,Access denied / account not in good standing)。**
  非脚本问题。到 model-studio 控制台充值/结清后,重跑 `gen-video.mjs` 即可。

## 充值后补齐
```powershell
cd "D:\polaris\人生七年\尘世浮生"
node scripts/dashscope/gen-video.mjs scripts/dashscope/jobs/_pilot.video.json --concurrency 2
node scripts/stepfun/build-manifest.mjs
```
> 换 Key:改 `config.mjs` 的 `DASH_KEY` 或设 `DASHSCOPE_KEY` 环境变量。
