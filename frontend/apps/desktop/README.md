# 桌面端（Tauri 薄壳）· P8

**设计约束：桌面端不写任何独有页面。** webview 加载的就是 `apps/web` 的同一份构建产物；
后端是同一个 `chenshi-api` 二进制，只是加 `--embedded`。

## 壳只做四件事

1. **sidecar 守护** —— 拉起 `chenshi-api --embedded`，随机端口 + token 握手，退出时 kill_tree。
2. **系统集成** —— 托盘、任务完成通知、开机自启（可选）。
3. **本地目录能力** —— 目录选择对话框、「在资源管理器中打开」。**网页端没有这两个入口。**
4. **自动更新** —— Tauri updater，stable / beta 双通道。

## 端差在前端只有一处

`platform.ts` 的 capability flags 是全代码库唯一允许 `if (桌面)` 的地方：

```ts
export const platform = {
  get isDesktop() { return !!window.__TAURI__ },
  get hasLocalFs() { return this.isDesktop },   // 目标文件夹选择
  get hasDoctor()  { return this.isDesktop },   // 环境医生
  apiBase: '/v1',
}
```

web 构建产物里 grep 不到 doctor 相关代码（tree-shaking 断言，写进 CI）。

## 双模启动的落地方式

后端三个 trait 各有两个实现，业务逻辑一行不分叉：

| trait | 云端 | 桌面（`--embedded`） |
|---|---|---|
| `Store` | PgStore | `EmbeddedStore`（JSON + 原子写）✅ 已实装 |
| 队列 | Redis Stream | 进程内 channel |
| 产物仓 | S3 兼容 | 本地目录 `CHENSHI_DATA_DIR/builds` ✅ |
| `ProfileStore` | PG 加密列 | `FileStore` ✅ 已实装 |

`Dock::desktop()` 才开放「联动写 `~/.claude/settings.json`」；云端一律隔离模式。

## 待办

- [ ] `src-tauri/` 薄壳（**不要复用 `_legacy/src-tauri`**，那是旧 IDE 壳，只作为 cli-core 的代码矿场）
- [ ] sidecar 端口握手 + 崩溃重启
- [ ] doctor 页（仅桌面路由注册）
- [ ] 断网全链路冒烟：立项 → 写剧本 → 生图（此步需网络或本地 CLI，断网时应明确报错而非挂死）→ 编译 → 导出
