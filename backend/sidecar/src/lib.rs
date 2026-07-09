//! sidecar —— 桌面壳用来启动与守护 `chenshi-api --embedded` 的逻辑。
//!
//! **刻意不依赖 tauri crate**：Tauri 需要 webkit2gtk 等 GUI 依赖，在无头环境里
//! 编译不了。把守护逻辑抽出来，就能在 CI 与 WSL 里真跑测试；
//! Tauri 壳只剩几十行胶水（`apps/desktop/src-tauri/src/main.rs`）。
//!
//! 职责（PRD §02「Tauri 壳极薄」的第 ① 条）：
//! - 用 `PORT=0` 拉起 api，从它的 stdout 拿到内核分配的真实端口；
//! - 随机 token 握手，防止本机其它进程随便打这个口；
//! - 崩溃自动重启（带退避）；
//! - 壳退出时**回收整棵进程树**（复用 cli-core::kill_tree）。

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// api 打在 stdout 上的端口就绪信号。格式与 `api/src/main.rs` 约定，别单方面改。
pub const READY_PREFIX: &str = "CHENSHI_LISTENING ";

/// 生成一个随机 token。不用 rand crate —— 少一个依赖，熵取自系统时间与进程地址。
pub fn random_token() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    std::time::SystemTime::now().hash(&mut h);
    std::process::id().hash(&mut h);
    (&h as *const _ as usize).hash(&mut h);
    let a = h.finish();
    std::thread::current().id().hash(&mut h);
    let b = h.finish();
    format!("{a:016x}{b:016x}")
}

#[derive(Debug, Clone)]
pub struct SidecarConfig {
    /// chenshi-api 可执行文件路径。
    pub exe: PathBuf,
    /// 数据目录（传给 CHENSHI_DATA_DIR）。
    pub data_dir: PathBuf,
    /// 前端静态目录。
    pub web_dir: Option<PathBuf>,
    /// 等待端口就绪的上限。
    pub startup_timeout: Duration,
}

impl SidecarConfig {
    pub fn new(exe: impl Into<PathBuf>, data_dir: impl Into<PathBuf>) -> Self {
        Self {
            exe: exe.into(),
            data_dir: data_dir.into(),
            web_dir: None,
            startup_timeout: Duration::from_secs(20),
        }
    }
}

pub struct Sidecar {
    child: Arc<Mutex<Option<Child>>>,
    pub port: u16,
    pub token: String,
    stopped: Arc<AtomicBool>,
}

impl Sidecar {
    /// 启动并等到端口就绪。失败会返回错误而不是让壳白屏。
    pub fn start(cfg: &SidecarConfig) -> anyhow::Result<Self> {
        if !cfg.exe.is_file() {
            anyhow::bail!("找不到 api 可执行文件: {}", cfg.exe.display());
        }
        std::fs::create_dir_all(&cfg.data_dir)?;

        let token = random_token();
        let mut cmd = Command::new(&cfg.exe);
        cmd.arg("--embedded")
            .env("PORT", "0") // 让内核挑端口，避免固定端口撞车
            .env("CHENSHI_TOKEN", &token)
            .env("CHENSHI_DATA_DIR", &cfg.data_dir)
            // 系统代理会劫持回环，壳与 api 之间的请求会打不通。
            .env("NO_PROXY", "127.0.0.1,localhost")
            .env("no_proxy", "127.0.0.1,localhost")
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        if let Some(w) = &cfg.web_dir {
            cmd.env("CHENSHI_WEB_DIR", w);
        }
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0); // 组长，便于 kill_tree 一次带走
        }

        let mut child = cmd.spawn()?;
        let stdout = child.stdout.take().expect("piped");

        // 从 stdout 读端口就绪信号。api 可能先打若干行日志，逐行找前缀。
        let deadline = Instant::now() + cfg.startup_timeout;
        let (tx, rx) = std::sync::mpsc::channel::<u16>();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Some(p) = line.strip_prefix(READY_PREFIX) {
                    if let Ok(port) = p.trim().parse::<u16>() {
                        let _ = tx.send(port);
                        return;
                    }
                }
            }
        });

        let port = loop {
            match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(p) => break p,
                Err(_) if Instant::now() < deadline => {
                    // 子进程死了就别再等
                    if let Ok(Some(status)) = child.try_wait() {
                        anyhow::bail!("api 启动即退出，退出码 {:?}", status.code());
                    }
                }
                Err(_) => {
                    let pid = child.id();
                    cli_core::kill_tree(pid);
                    anyhow::bail!("等待 api 端口就绪超时（{:?}）", cfg.startup_timeout);
                }
            }
        };

        tracing::info!(port, "sidecar 就绪");
        Ok(Self {
            child: Arc::new(Mutex::new(Some(child))),
            port,
            token,
            stopped: Arc::new(AtomicBool::new(false)),
        })
    }

    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    /// 子进程是否还活着。壳可以据此做「崩溃自动重启」。
    pub fn is_alive(&self) -> bool {
        let mut g = self.child.lock().unwrap();
        match g.as_mut() {
            Some(c) => matches!(c.try_wait(), Ok(None)),
            None => false,
        }
    }

    /// 停掉 api，**回收整棵进程树**（api 自己也可能扇出 worker）。
    pub fn stop(&self) {
        if self.stopped.swap(true, Ordering::SeqCst) {
            return;
        }
        let mut g = self.child.lock().unwrap();
        if let Some(mut c) = g.take() {
            let pid = c.id();
            cli_core::kill_tree(pid);
            let _ = c.wait();
            tracing::info!(pid, "sidecar 已停止");
        }
    }
}

/// 壳退出时（包括 panic）必须回收 —— 否则用户关窗口后 api 还在后台跑。
impl Drop for Sidecar {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_is_random_and_long_enough() {
        let a = random_token();
        let b = random_token();
        assert_eq!(a.len(), 32);
        assert_ne!(a, b, "两次 token 不该相同");
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn missing_exe_fails_loudly() {
        let cfg = SidecarConfig::new("/definitely/not/here", std::env::temp_dir());
        let e = Sidecar::start(&cfg).err().expect("应当失败");
        assert!(e.to_string().contains("找不到 api"), "got: {e}");
    }

    /// 启动即退出的假 api：必须报错，而不是卡到超时。
    #[test]
    #[cfg(unix)]
    fn api_that_exits_immediately_is_detected() {
        let dir = std::env::temp_dir().join("sidecar-test-exit");
        let _ = std::fs::create_dir_all(&dir);
        let fake = dir.join("fake-api");
        std::fs::write(&fake, "#!/bin/sh\nexit 3\n").unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();

        let mut cfg = SidecarConfig::new(&fake, &dir);
        cfg.startup_timeout = Duration::from_secs(3);
        let e = Sidecar::start(&cfg).err().expect("应当失败");
        let msg = e.to_string();
        assert!(msg.contains("启动即退出") || msg.contains("超时"), "got: {msg}");
    }

    /// 端口就绪信号解析：api 会先打日志，端口行可能在中间。
    #[test]
    #[cfg(unix)]
    fn parses_ready_line_among_logs() {
        let dir = std::env::temp_dir().join("sidecar-test-ready");
        let _ = std::fs::create_dir_all(&dir);
        let fake = dir.join("fake-api-ready");
        std::fs::write(
            &fake,
            "#!/bin/sh\necho 'INFO starting'\necho 'CHENSHI_LISTENING 45678'\nsleep 30\n",
        )
        .unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();

        let cfg = SidecarConfig::new(&fake, &dir);
        let sc = match Sidecar::start(&cfg) { Ok(s) => s, Err(e) => panic!("应能解析端口: {e}") };
        assert_eq!(sc.port, 45678);
        assert_eq!(sc.base_url(), "http://127.0.0.1:45678");
        assert!(sc.is_alive());
        sc.stop();
        std::thread::sleep(Duration::from_millis(400));
        assert!(!sc.is_alive(), "stop 后进程应已回收");
    }
}
