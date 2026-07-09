//! 尘世浮生 · 桌面壳。
//!
//! **壳里不写任何业务**。UI 是 `apps/web` 那一份构建产物，后端是同一个
//! `chenshi-api --embedded` 二进制。壳只做四件事（PRD §02）：
//!   ① 启动/守护 sidecar   ② 系统集成（托盘/通知）
//!   ③ 本地目录对话框      ④ 自动更新
//!
//! 守护逻辑在 `backend/sidecar` crate 里，那里能在无头环境跑测试；
//! 本文件是不可测的 GUI 胶水，越薄越好。
//!
//! 构建需要 GUI 依赖（Linux: webkit2gtk-4.1 / libayatana-appindicator3），
//! 在无头 CI 里不构建 —— 见 .github/workflows/ci.yml 的说明。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sidecar::{Sidecar, SidecarConfig};
use std::sync::Mutex;
use tauri::{Manager, State};

struct Backend(Mutex<Option<Sidecar>>);

/// 前端启动时问壳要 apiBase。web 端这里恒为 "/v1"，桌面端是 sidecar 的随机端口。
#[tauri::command]
fn api_base(backend: State<Backend>) -> Result<String, String> {
    backend
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .map(|s| s.base_url())
        .ok_or_else(|| "后端未启动".to_string())
}

/// 桌面独有：目录选择对话框。网页端没有这个入口。
#[tauri::command]
async fn pick_directory(app: tauri::AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(|p| p.to_string())
}

/// 桌面独有：在资源管理器里打开产物目录。
#[tauri::command]
fn reveal(path: String) -> Result<(), String> {
    let cmd = if cfg!(windows) { "explorer" } else if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    std::process::Command::new(cmd)
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn data_dir() -> std::path::PathBuf {
    std::env::var("CHENSHI_DATA_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            if cfg!(windows) {
                std::path::PathBuf::from(r"D:\chenshi-data")
            } else {
                dirs_next()
                    .map(|h| h.join("chenshi-data"))
                    .unwrap_or_else(|| std::path::PathBuf::from("/tmp/chenshi-data"))
            }
        })
}

fn dirs_next() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(Into::into)
}

fn main() {
    tracing_subscriber::fmt().init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .manage(Backend(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![api_base, pick_directory, reveal])
        .setup(|app| {
            // sidecar 二进制随安装包分发，位于资源目录。
            let exe = app
                .path()
                .resource_dir()?
                .join(if cfg!(windows) { "chenshi-api.exe" } else { "chenshi-api" });

            let cfg = SidecarConfig::new(exe, data_dir());
            let sc = Sidecar::start(&cfg).map_err(|e| {
                // 启动失败要让用户看见原因，而不是白屏。
                tauri::Error::Anyhow(anyhow::anyhow!("后端启动失败: {e}"))
            })?;
            tracing::info!(port = sc.port, "sidecar 就绪");
            *app.state::<Backend>().0.lock().unwrap() = Some(sc);
            Ok(())
        })
        .on_window_event(|window, event| {
            // 关窗口 = 回收 api 进程树。否则用户以为退出了，后台还在烧 token。
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(sc) = window.state::<Backend>().0.lock().unwrap().take() {
                    sc.stop();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("启动 Tauri 失败");
}
