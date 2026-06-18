# 阶跃星辰(StepFun)故事素材库重构

把《尘世浮生》12 个剧本的 233 个场景,用阶跃星辰生图(`step-1x-medium`)做成沉浸式水墨配图,
并用 `stepaudio-2.5-tts` 逐场景配音。游戏侧已默认接入:有真实配图的场景显示生成图(图片为主),
没有的自动回退原 SVG;旁白配音可在设置/播放器里开关。

## 目录
- `config.mjs` —— API Key、端点、模型、音色、并发池(共享)。
- `gen-images.mjs <jobs.json>` —— 文生图,下载到 `public/story-art/<game>/<scene>.png`。幂等。统一追加水墨风格锚点。
- `gen-tts.mjs <jobs.json>` —— 配音,下载到 `public/story-voice/<game>/<scene>.mp3`。幂等。
- `build-manifest.mjs` —— 扫描以上两目录,生成 `src/game/art-manifest.ts`(游戏据此挂图/音)。
- `run-all.mjs` —— 一键:顺序跑 `jobs/` 下所有 art+tts(并发1,避开账号共享并发上限5),跑完自动重建 manifest。
- `jobs/<game>.art.json` / `<game>.tts.json` —— 各剧本的逐场景任务(已全部写好,key 与源场景 id 一一对应)。

## 进度(2026-06-18)
- 配图:**147 / 233** 已生成。yingzheng/sushi/chenshi 全齐;zhugeliang 24、wuzetian 19、simaqian 18、zhenghe 13、musk 9、zhuyuanzhang 7、wangyangming 4、zhangqian 1、liqingzhao 0。
- 配音:**23 条**(simaqian 17、yingzheng 4、chenshi 2)。
- **未完成原因:StepFun 账号额度耗尽(HTTP 402 quota_exceeded)。** 非脚本/JSON 问题,jobs 全部就绪。

## 补齐(账号充值后,一条命令)
```powershell
cd "D:\polaris\人生七年\尘世浮生"
node scripts/stepfun/run-all.mjs
```
脚本幂等:已生成的图/音自动跳过,只补缺口,跑完自动重建 manifest。完成后 `npm run build` 验证即可。

> 换 Key:改 `config.mjs` 里的 `STEP_KEY`,或设环境变量 `STEPFUN_KEY` 后再跑 run-all。
