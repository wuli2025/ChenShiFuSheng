//! cli-core —— 全系统唯一允许 spawn claude / codex CLI 的地方。
//!
//! 提炼自 `_legacy/src-tauri/src/chat.rs`（2782 行）与 `engine.rs`，剥掉聊天业务
//! （Skill 拼装 / KB 注入 / kb_search 召回），只留进程编排。以下细节是实战踩出来的，
//! 修改前请读注释：
//!
//! - prompt 永远走 stdin，绝不进 argv。Windows CreateProcessW 的 lpCommandLine 上限
//!   32767 字符，实测 33k 就 100% 抛 206 ERROR_FILENAME_TOO_LONG 拒 spawn。
//! - claude 的 stderr 每行都是错误；codex 的 stderr 是 tracing 日志，不可当致命错误。
//! - codex 的 JSONL 按 item.id 增量去重，否则同一条消息会重复发 delta。
//! - 成败判定要看退出码 **和** turn.failed 两处。
//! - Unix 下让子进程成为进程组组长，kill_tree 才能一次带走整棵子孙树。

pub mod parse;
pub mod proc;

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

pub use parse::{CliEvent, ClaudeParser, CodexParser, StreamParser};
pub use proc::kill_tree;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    Claude,
    Codex,
}

impl Engine {
    pub fn as_str(&self) -> &'static str {
        match self {
            Engine::Claude => "claude",
            Engine::Codex => "codex",
        }
    }
}

/// 沙箱档位。codex 侧映射为 `--sandbox read-only` / `--dangerously-bypass-approvals-and-sandbox`；
/// claude 侧映射为 `--permission-mode`。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sandbox {
    /// 只读：不放行任何写/执行。
    ReadOnly,
    /// 全放行：headless 无人审批。**只允许出现在一次性 worker 容器里，宿主机永不。**
    Full,
}

/// 由 provider-dock 产出的不透明环境补丁。cli-core 盲注入，不认识任何厂商。
#[derive(Debug, Clone, Default)]
pub struct EnvPatch(pub HashMap<String, String>);

impl EnvPatch {
    pub fn get(&self, k: &str) -> Option<&str> {
        self.0.get(k).map(|s| s.as_str())
    }
}

#[derive(Debug, Clone)]
pub struct CliJob {
    pub engine: Engine,
    /// 永远走 stdin。见模块级注释。
    pub prompt: String,
    pub cwd: PathBuf,
    pub sandbox: Sandbox,
    pub env_patch: EnvPatch,
    /// 额外放行目录（--add-dir）。
    pub add_dirs: Vec<PathBuf>,
    /// 空闲挂死检测，**不是绝对超时**：有任何输出即刷新活动时间。
    /// `None` 或 0 表示不检测（桌面端默认关，容器默认 180s）。
    pub idle_timeout: Option<Duration>,
    /// 单 job 输出字节上限，防 prompt 注入导致无限输出刷爆磁盘。
    pub max_output_bytes: usize,
    /// 任务租约标识：worker 崩溃后由平台层扫描孤儿租约回收。
    pub lease: Option<String>,
}

impl CliJob {
    pub fn new(engine: Engine, prompt: impl Into<String>, cwd: impl Into<PathBuf>) -> Self {
        Self {
            engine,
            prompt: prompt.into(),
            cwd: cwd.into(),
            sandbox: Sandbox::Full,
            env_patch: EnvPatch::default(),
            add_dirs: Vec::new(),
            idle_timeout: Some(Duration::from_secs(180)),
            max_output_bytes: 64 * 1024 * 1024,
            lease: None,
        }
    }

    pub fn sandbox(mut self, s: Sandbox) -> Self {
        self.sandbox = s;
        self
    }
    pub fn env_patch(mut self, p: EnvPatch) -> Self {
        self.env_patch = p;
        self
    }
    pub fn idle_timeout(mut self, d: Option<Duration>) -> Self {
        self.idle_timeout = d;
        self
    }
    pub fn add_dir(mut self, p: impl Into<PathBuf>) -> Self {
        self.add_dirs.push(p.into());
        self
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CliResult {
    pub ok: bool,
    pub exit_code: Option<i32>,
    /// codex 的 turn.failed —— 退出码为 0 也可能是失败。
    pub turn_failed: bool,
    pub text: String,
    pub bytes_out: usize,
    pub reason: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum CliError {
    #[error("找不到 {0} 可执行文件；请确认已安装并在 PATH 中")]
    NotFound(&'static str),
    #[error("拉起 {engine} CLI 失败: {source}")]
    Spawn {
        engine: &'static str,
        #[source]
        source: std::io::Error,
    },
    #[error("任务空闲超时（{0:?} 无输出），已终止进程树")]
    IdleTimeout(Duration),
    #[error("输出超过上限 {0} 字节，已终止")]
    OutputLimit(usize),
    #[error("任务被取消")]
    Cancelled,
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

/// 流式事件出口。调用方（gen-pipeline）实现它把事件写进 timeline_events。
pub trait CliSink: Send + 'static {
    fn on_delta(&mut self, text: &str);
    fn on_tool(&mut self, name: &str, arg: &serde_json::Value) {
        let _ = (name, arg);
    }
    /// claude: 视为错误。codex: 视为 tracing 日志，不致命。
    fn on_stderr(&mut self, line: &str, fatal: bool) {
        let _ = (line, fatal);
    }
    fn on_done(&mut self, result: &CliResult) {
        let _ = result;
    }
}

/// 收集式 sink，测试与简单场景用。
#[derive(Default)]
pub struct CollectSink {
    pub text: String,
    pub stderr: Vec<String>,
    pub result: Option<CliResult>,
}

impl CliSink for CollectSink {
    fn on_delta(&mut self, text: &str) {
        self.text.push_str(text);
    }
    fn on_stderr(&mut self, line: &str, _fatal: bool) {
        self.stderr.push(line.to_string());
    }
    fn on_done(&mut self, result: &CliResult) {
        self.result = Some(result.clone());
    }
}

pub use proc::{run, JobHandle};

/// 自检：两个引擎是否可用。部署时 healthcheck 调它，替代网页端的「环境医生」。
pub fn selftest() -> Vec<(Engine, bool, String)> {
    vec![
        match proc::resolve_claude_exe() {
            Some(p) => (Engine::Claude, true, p.display().to_string()),
            None => (Engine::Claude, false, "未找到 claude".into()),
        },
        match proc::resolve_codex_exe() {
            Some(p) => (Engine::Codex, true, p.display().to_string()),
            None => (Engine::Codex, false, "未找到 codex".into()),
        },
    ]
}
