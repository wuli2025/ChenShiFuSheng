//! 引擎切换 —— Agent 执行底座:`codex`(ChatGPT Codex CLI, **默认**) 或 `claude`(Claude Code CLI)。
//!
//! 设计:与「API 供应商坞」(provider.rs) 正交。
//! - provider.rs 决定「claude CLI 用哪家 Anthropic 兼容端点」(切 MiniMax / Codex 代理等);
//! - engine.rs 决定「整条对话到底拉起哪个 CLI 进程」:
//!     * codex  → 直接 spawn 官方 `codex exec --json`(吃 ~/.codex 的 ChatGPT 订阅授权);
//!     * claude → 原 `claude --print` 路线(再受 provider 选择影响)。
//!
//! 默认 codex —— 用户要求「默认就是 codex CLI」。设置改存 `~/Polaris/data/engine.json`,
//! 重启后保留。chat.rs 每轮发消息时读 `current()` 决定分流。

#[cfg(not(feature = "desktop"))]
use crate::host::AppHandle;
use directories::UserDirs;
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
#[cfg(feature = "desktop")]
use tauri::AppHandle;

/// 合法引擎标识。未知值一律回落 codex(默认)。
const ENGINES: &[&str] = &["codex", "claude"];
const DEFAULT_ENGINE: &str = "codex";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EngineStore {
    engine: String,
}
impl Default for EngineStore {
    fn default() -> Self {
        EngineStore {
            engine: DEFAULT_ENGINE.to_string(),
        }
    }
}

static STORE: Lazy<RwLock<EngineStore>> = Lazy::new(|| RwLock::new(EngineStore::default()));
static STORE_PATH: Lazy<RwLock<PathBuf>> = Lazy::new(|| RwLock::new(PathBuf::new()));

fn normalize(v: &str) -> String {
    let v = v.trim().to_ascii_lowercase();
    if ENGINES.contains(&v.as_str()) {
        v
    } else {
        DEFAULT_ENGINE.to_string()
    }
}

pub fn init(_app: &AppHandle) -> Result<(), anyhow::Error> {
    let dir = UserDirs::new()
        .map(|u| u.home_dir().join("Polaris").join("data"))
        .ok_or_else(|| anyhow::anyhow!("no user dir"))?;
    fs::create_dir_all(&dir)?;
    let path = dir.join("engine.json");
    *STORE_PATH.write() = path.clone();
    if path.exists() {
        if let Ok(txt) = fs::read_to_string(&path) {
            if let Ok(mut s) = serde_json::from_str::<EngineStore>(&txt) {
                s.engine = normalize(&s.engine);
                *STORE.write() = s;
            }
        }
    }
    Ok(())
}

fn persist() {
    let path = STORE_PATH.read().clone();
    if path.as_os_str().is_empty() {
        return;
    }
    if let Ok(txt) = serde_json::to_string_pretty(&*STORE.read()) {
        let _ = fs::write(&path, txt);
    }
}

/// 当前生效的引擎标识(进程内读, chat.rs 每轮调用)。
pub fn current() -> String {
    STORE.read().engine.clone()
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub fn engine_get() -> String {
    current()
}

#[cfg_attr(feature = "desktop", tauri::command)]
pub fn engine_set(engine: String) -> Result<String, String> {
    let e = normalize(&engine);
    STORE.write().engine = e.clone();
    persist();
    Ok(e)
}
