// 创作工坊托管 —— AI人生画布引擎工作台(本地 Node 服务,端口 1480)。
// 桌面端把工作台以「原生子 WebView」嵌进主窗口(studio_embed*,需 tauri unstable
// multiwebview),完整浏览器能力、不弹外部浏览器;浏览器/Docker 模式前端退回 iframe。
// 进屏前 studio_status 探活,不在线 studio_start 拉起(零依赖,只要机器装了 Node)。
use serde::Serialize;
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl, Window};

const PORT: u16 = 1480;
const EMBED_LABEL: &str = "studio-embed";

#[derive(Serialize, Clone)]
pub struct StudioStatus {
    pub running: bool,
    pub url: String,
    pub dir: Option<String>,
}

fn probe() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], PORT));
    TcpStream::connect_timeout(&addr, Duration::from_millis(600)).is_ok()
}

/// 画布引擎目录:环境变量 POLARIS_STUDIO_DIR 优先,其次常见落点。
fn studio_dir() -> Option<PathBuf> {
    let mut cands: Vec<PathBuf> = Vec::new();
    if let Ok(d) = std::env::var("POLARIS_STUDIO_DIR") {
        cands.push(PathBuf::from(d));
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok();
    if let Some(h) = home {
        let h = PathBuf::from(h);
        cands.push(h.join("Desktop").join("AI人生画布引擎"));
        cands.push(h.join("OneDrive").join("Desktop").join("AI人生画布引擎"));
    }
    cands.push(PathBuf::from("D:\\polaris\\AI人生画布引擎"));
    cands
        .into_iter()
        .find(|p| p.join("server").join("server.js").exists())
}

fn status_now() -> StudioStatus {
    StudioStatus {
        running: probe(),
        url: format!("http://127.0.0.1:{PORT}/"),
        dir: studio_dir().map(|p| p.to_string_lossy().into_owned()),
    }
}

#[tauri::command]
pub fn studio_status() -> StudioStatus {
    status_now()
}

/// 服务不在线就拉起并等待就绪(供 studio_start / studio_embed 共用)。
fn ensure_server() -> Result<(), String> {
    if probe() {
        return Ok(());
    }
    let dir = studio_dir().ok_or_else(|| {
        "未找到「AI人生画布引擎」目录:请把它放在桌面,或设置环境变量 POLARIS_STUDIO_DIR 指向该文件夹".to_string()
    })?;
    let mut cmd = std::process::Command::new("node");
    cmd.arg("server/server.js")
        .current_dir(&dir)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .stdin(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.spawn()
        .map_err(|e| format!("拉起工作台失败(需要安装 Node.js): {e}"))?;
    for _ in 0..40 {
        if probe() {
            break;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Ok(())
}

#[tauri::command]
pub fn studio_start() -> Result<StudioStatus, String> {
    ensure_server()?;
    Ok(status_now())
}

/* ---- 原生子 WebView 嵌入(真·浏览器嵌进主窗口,坐标为逻辑像素) ---- */

fn embed_url() -> tauri::Url {
    format!("http://127.0.0.1:{PORT}/").parse().expect("studio url")
}

#[tauri::command]
pub fn studio_embed(window: Window, x: f64, y: f64, w: f64, h: f64) -> Result<StudioStatus, String> {
    ensure_server()?;
    let app = window.app_handle();
    if let Some(wv) = app.webviews().get(EMBED_LABEL) {
        wv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        wv.set_size(LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
        return Ok(status_now());
    }
    let builder = WebviewBuilder::new(EMBED_LABEL, WebviewUrl::External(embed_url()));
    window
        .add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(w, h))
        .map_err(|e| format!("嵌入 WebView 失败: {e}"))?;
    Ok(status_now())
}

#[tauri::command]
pub fn studio_embed_bounds(app: tauri::AppHandle, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    if let Some(wv) = app.webviews().get(EMBED_LABEL) {
        wv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        wv.set_size(LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn studio_embed_close(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(wv) = app.webviews().get(EMBED_LABEL) {
        wv.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn studio_embed_reload(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(wv) = app.webviews().get(EMBED_LABEL) {
        wv.clone().navigate(embed_url()).map_err(|e| e.to_string())?;
    }
    Ok(())
}
