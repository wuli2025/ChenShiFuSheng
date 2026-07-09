//! 进程编排：spawn / 流式读取 / 空闲看门狗 / 进程树回收。

use crate::{CliError, CliJob, CliResult, CliSink, Engine, Sandbox};
use crate::parse::{ClaudeParser, CliEvent, CodexParser, StreamParser};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

/// 解析 claude 的真·可执行文件。
///
/// npm 全局装只在 PATH 放 `claude.cmd`，而 Windows CreateProcessW 解析裸名只补 `.exe`、
/// 不查 PATHEXT → 裸名找不到 npm 装的 claude。解析不到再回退裸名靠 PATH。
pub fn resolve_claude_exe() -> Option<PathBuf> {
    which_in_path("claude")
}

pub fn resolve_codex_exe() -> Option<PathBuf> {
    which_in_path("codex")
}

fn which_in_path(bin: &str) -> Option<PathBuf> {
    let exts: &[&str] = if cfg!(windows) {
        &["", ".exe", ".cmd", ".bat"]
    } else {
        &[""]
    };
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        for ext in exts {
            let cand = dir.join(format!("{bin}{ext}"));
            if cand.is_file() {
                return Some(cand);
            }
        }
    }
    None
}

/// 子进程环境净化：
/// - loopback 强制 NO_PROXY —— 切第三方供应商时 CLI 走 127.0.0.1 本地代理，
///   系统代理会劫持回环导致连不上。
/// - 清 DEBUG / LD_PRELOAD，避免宿主机调试变量污染子进程。
fn harden_child_env(cmd: &mut Command) {
    cmd.env("NO_PROXY", "127.0.0.1,localhost,::1");
    cmd.env("no_proxy", "127.0.0.1,localhost,::1");
    cmd.env_remove("DEBUG");
    cmd.env_remove("LD_PRELOAD");
}

/// 隔离模式：CLAUDE_CONFIG_DIR / CODEX_HOME 指向本任务私有目录。
///
/// 两个作用：① 会话账本不进 ~/.claude/projects，外部监控看不见平台自动任务；
/// ② **并发生图时每条线必须有独立 CODEX_HOME**，否则会话互相踩踏（画布引擎 server.js 的 w1/w2 做法）。
fn scope_child_config(cmd: &mut Command, job: &CliJob) {
    let private = job.cwd.join(".cli-home");
    let _ = std::fs::create_dir_all(&private);
    match job.engine {
        Engine::Claude => {
            cmd.env("CLAUDE_CONFIG_DIR", &private);
        }
        Engine::Codex => {
            cmd.env("CODEX_HOME", &private);
        }
    }
}

#[cfg(windows)]
fn no_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
fn no_window(_cmd: &mut Command) {}

/// 一次带走整棵子孙树。CLI 会扇出 python/node/dev-server，只 kill 父进程会留孤儿占端口/CPU。
pub fn kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/T", "/F", "/PID", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(unix)]
    {
        // 负号 = 整个进程组。子进程 spawn 时已 process_group(0) 成为组长。
        unsafe {
            libc_kill(-(pid as i32), 15); // SIGTERM
        }
        std::thread::sleep(Duration::from_millis(300));
        unsafe {
            libc_kill(-(pid as i32), 9); // SIGKILL 兜底
        }
    }
}

#[cfg(unix)]
unsafe fn libc_kill(pid: i32, sig: i32) {
    extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    let _ = kill(pid, sig);
}

fn build_command(job: &CliJob) -> Result<Command, CliError> {
    let mut cmd = match job.engine {
        Engine::Claude => {
            let bin = resolve_claude_exe().ok_or(CliError::NotFound("claude"))?;
            let mut c = Command::new(bin);
            c.args([
                "--print",
                "--output-format",
                "stream-json",
                "--verbose",
            ]);
            for d in &job.add_dirs {
                c.arg("--add-dir").arg(d);
            }
            let perm = match job.sandbox {
                Sandbox::ReadOnly => "plan",
                Sandbox::Full => "acceptEdits",
            };
            c.arg(format!("--permission-mode={perm}"));
            c
        }
        Engine::Codex => {
            let bin = resolve_codex_exe().ok_or(CliError::NotFound("codex"))?;
            let mut c = Command::new(bin);
            c.args(["exec", "--json", "--skip-git-repo-check"]);
            match job.sandbox {
                Sandbox::ReadOnly => {
                    c.args(["--sandbox", "read-only"]);
                    for d in &job.add_dirs {
                        c.arg("--add-dir").arg(d);
                    }
                }
                // headless 全自动：无人能逐个点「同意」，放行执行让产物（图/脚本）真正落地。
                // 只允许在一次性容器里出现。
                Sandbox::Full => {
                    c.arg("--dangerously-bypass-approvals-and-sandbox");
                }
            }
            // prompt 走 stdin：末尾短横线。
            c.arg("-");
            c
        }
    };

    cmd.current_dir(&job.cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    harden_child_env(&mut cmd);
    scope_child_config(&mut cmd, job);
    for (k, v) in &job.env_patch.0 {
        cmd.env(k, v);
    }
    no_window(&mut cmd);

    #[cfg(unix)]
    {
        cmd.process_group(0);
    }
    Ok(cmd)
}

pub struct JobHandle {
    pid: Option<u32>,
    cancelled: Arc<AtomicBool>,
}

impl JobHandle {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        if let Some(pid) = self.pid {
            kill_tree(pid);
        }
    }
    pub fn pid(&self) -> Option<u32> {
        self.pid
    }
}

enum Msg {
    Out(String),
    Err(String),
    Eof,
}

/// 跑一个 CLI 任务，流式把事件推给 sink，返回最终结果。
///
/// 不做自动 retry —— 失败原样上报，重试策略由 gen-pipeline 按任务类型决定
/// （生图 ≤2 次，写剧本不自动重试交人工）。
pub async fn run(job: CliJob, mut sink: impl CliSink) -> Result<CliResult, CliError> {
    let mut cmd = build_command(&job)?;
    let engine_name = job.engine.as_str();

    let mut child = cmd.spawn().map_err(|e| CliError::Spawn {
        engine: engine_name,
        source: e,
    })?;
    let pid = child.id();
    let cancelled = Arc::new(AtomicBool::new(false));
    let handle = JobHandle {
        pid,
        cancelled: cancelled.clone(),
    };

    // prompt 走 stdin，写完立刻 drop 关闭，否则 CLI 会一直等输入。
    if let Some(mut stdin) = child.stdin.take() {
        let prompt = job.prompt.clone();
        tokio::spawn(async move {
            let _ = stdin.write_all(prompt.as_bytes()).await;
            let _ = stdin.flush().await;
            drop(stdin);
        });
    }

    let (tx, mut rx) = mpsc::channel::<Msg>(1024);

    if let Some(out) = child.stdout.take() {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(out).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                if tx.send(Msg::Out(l)).await.is_err() {
                    break;
                }
            }
            let _ = tx.send(Msg::Eof).await;
        });
    }
    if let Some(err) = child.stderr.take() {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(err).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                if tx.send(Msg::Err(l)).await.is_err() {
                    break;
                }
            }
        });
    }
    drop(tx);

    let mut parser: Box<dyn StreamParser> = match job.engine {
        Engine::Claude => Box::new(ClaudeParser),
        Engine::Codex => Box::new(CodexParser::default()),
    };

    let mut text = String::new();
    let mut bytes_out = 0usize;
    let mut turn_failed = false;
    let mut done_reason: Option<String> = None;
    let mut last_activity = Instant::now();
    // 看门狗 tick ≤5s，比 idle_timeout 细，保证判定及时。
    let tick = Duration::from_secs(5);
    let mut eof = false;

    loop {
        if cancelled.load(Ordering::SeqCst) {
            if let Some(p) = pid {
                kill_tree(p);
            }
            return Err(CliError::Cancelled);
        }

        let recv = tokio::time::timeout(tick, rx.recv()).await;
        match recv {
            Ok(Some(msg)) => {
                // 任何输出都刷新活动时间 —— 这是「空闲挂死检测」而非绝对超时。
                last_activity = Instant::now();
                match msg {
                    Msg::Out(line) => {
                        bytes_out += line.len();
                        if bytes_out > job.max_output_bytes {
                            if let Some(p) = pid {
                                kill_tree(p);
                            }
                            return Err(CliError::OutputLimit(job.max_output_bytes));
                        }
                        match parser.feed_line(&line) {
                            CliEvent::Delta(d) => {
                                text.push_str(&d);
                                sink.on_delta(&d);
                            }
                            CliEvent::Tool { name, arg } => sink.on_tool(&name, &arg),
                            CliEvent::Done {
                                text: t,
                                turn_failed: tf,
                            } => {
                                turn_failed = turn_failed || tf;
                                if tf && !t.is_empty() {
                                    done_reason = Some(t);
                                } else if !t.is_empty() && text.is_empty() {
                                    text = t;
                                }
                            }
                            CliEvent::Ignored => {}
                        }
                    }
                    Msg::Err(line) => {
                        // claude 的 stderr 每行都是错误；codex 的 stderr 是 tracing 日志。
                        let fatal = matches!(job.engine, Engine::Claude);
                        sink.on_stderr(&line, fatal);
                    }
                    Msg::Eof => eof = true,
                }
            }
            Ok(None) => break, // 所有 sender 关闭
            Err(_) => {
                // tick 到期无消息：检查空闲挂死
                if let Some(limit) = job.idle_timeout {
                    if !limit.is_zero() && last_activity.elapsed() > limit && !eof {
                        if let Some(p) = pid {
                            kill_tree(p);
                        }
                        return Err(CliError::IdleTimeout(limit));
                    }
                }
            }
        }
    }

    let status = child.wait().await?;
    let exit_code = status.code();
    // 成败双重判定：退出码 **和** turn.failed。codex 退出码 0 也可能 turn.failed。
    let ok = status.success() && !turn_failed;

    let result = CliResult {
        ok,
        exit_code,
        turn_failed,
        text,
        bytes_out,
        reason: done_reason.or_else(|| {
            (!ok).then(|| format!("{engine_name} 退出码 {exit_code:?}, turn_failed={turn_failed}"))
        }),
    };
    sink.on_done(&result);
    drop(handle);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn which_finds_sh_on_unix() {
        if cfg!(unix) {
            assert!(which_in_path("sh").is_some());
        }
    }

    #[test]
    fn missing_binary_is_not_found() {
        assert!(which_in_path("definitely-not-a-real-binary-xyz").is_none());
    }
}
