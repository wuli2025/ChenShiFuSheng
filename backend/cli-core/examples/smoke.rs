//! P1 冒烟：**真的**拉起 claude / codex CLI，走完整流式链路。
//!
//! 不 mock。这是唯一能证明 cli-core 可用的测试 —— 单元测试只覆盖解析器，
//! 覆盖不到「登录态是否被 CLAUDE_CONFIG_DIR 隔离掉」这类问题。
//!
//! 跑法：
//!   cargo run -p cli-core --example smoke              # 两个引擎都跑
//!   cargo run -p cli-core --example smoke -- claude    # 只跑 claude
//!   cargo run -p cli-core --example smoke -- cancel    # 验证 kill_tree 不留残留

use cli_core::{CliJob, CliResult, CliSink, Engine, Sandbox};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Default, Clone)]
struct Probe(Arc<Mutex<Inner>>);

#[derive(Default)]
struct Inner {
    text: String,
    deltas: usize,
    stderr_fatal: Vec<String>,
    done: Option<CliResult>,
}

impl CliSink for Probe {
    fn on_delta(&mut self, t: &str) {
        let mut g = self.0.lock().unwrap();
        g.text.push_str(t);
        g.deltas += 1;
    }
    fn on_stderr(&mut self, line: &str, fatal: bool) {
        if fatal {
            self.0.lock().unwrap().stderr_fatal.push(line.to_string());
        }
    }
    fn on_done(&mut self, r: &CliResult) {
        self.0.lock().unwrap().done = Some(r.clone());
    }
}

async fn run_one(engine: Engine) -> bool {
    let name = engine.as_str();
    print!("━━ {name}: ");
    use std::io::Write;
    let _ = std::io::stdout().flush();

    let dir = std::env::temp_dir().join(format!("cli-core-smoke-{name}"));
    let _ = std::fs::create_dir_all(&dir);

    // 故意用一段长 prompt（>33k 字符），验证走 stdin 而非 argv。
    // Windows CreateProcessW 的 lpCommandLine 上限是 32767，实测 33k 必抛 206。
    let filler = "这是一段用来把 prompt 撑过 32767 字符的填充文本，只为验证它走的是 stdin。".repeat(1200);
    let prompt = format!(
        "{filler}\n\n忽略上面所有填充文本。请只回复两个字：可用。不要任何其他内容。"
    );
    assert!(prompt.chars().count() > 33_000, "prompt 不够长，测不到 argv 上限");

    let probe = Probe::default();
    let job = CliJob::new(engine, prompt, &dir)
        // 只读沙箱：冒烟不需要落盘，也不该给它写权限。
        .sandbox(Sandbox::ReadOnly)
        .idle_timeout(Some(Duration::from_secs(120)));

    let t0 = Instant::now();
    let result = cli_core::run(job, probe.clone()).await;
    let dt = t0.elapsed();

    match result {
        Ok(r) => {
            let g = probe.0.lock().unwrap();
            let text = g.text.trim().to_string();
            if r.ok {
                println!("✓ {:.1}s  {} 个 delta  回复「{}」", dt.as_secs_f32(), g.deltas, truncate(&text, 24));
                if g.done.is_none() {
                    println!("   ⚠ sink.on_done 没被调用");
                }
                true
            } else {
                println!("✗ 失败: {}", r.reason.as_deref().unwrap_or("(无原因)"));
                for l in g.stderr_fatal.iter().take(3) {
                    println!("   stderr: {l}");
                }
                false
            }
        }
        Err(e) => {
            println!("✗ {e}");
            false
        }
    }
}

fn truncate(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

/// 验证 cancel → kill_tree 不留残留进程。
async fn run_cancel(engine: Engine) -> bool {
    print!("━━ {} cancel: ", engine.as_str());
    use std::io::Write;
    let _ = std::io::stdout().flush();

    let dir = std::env::temp_dir().join("cli-core-smoke-cancel");
    let _ = std::fs::create_dir_all(&dir);
    let before = count_procs(engine);

    let job = CliJob::new(engine, "数到一百万，一个一个数出来。", &dir)
        .sandbox(Sandbox::ReadOnly)
        .idle_timeout(Some(Duration::from_secs(60)));

    let handle = tokio::spawn(async move { cli_core::run(job, Probe::default()).await });
    tokio::time::sleep(Duration::from_secs(5)).await;

    // 先自证计数器有效：CLI 正在跑，计数必须涨。
    // 否则 after<=before 只是「数不到」，不是「没残留」—— 一个骗人的绿。
    let during = count_procs(engine);
    if during <= before {
        println!("✗ 计数器无效：CLI 运行中却数不到进程 (before={before}, during={during})");
        handle.abort();
        return false;
    }

    handle.abort(); // drop future → ProcGuard 应回收整棵进程树

    tokio::time::sleep(Duration::from_secs(2)).await;
    let after = count_procs(engine);
    if after <= before {
        println!("✓ 无残留 (before={before}, during={during}, after={after})");
        true
    } else {
        println!("✗ 残留 {} 个进程 (before={before}, during={during}, after={after})", after - before);
        false
    }
}

/// 数「命令行里出现了那个 CLI 可执行文件绝对路径」的进程。
///
/// 两个坑：
/// - 不能用 `pgrep -f claude`：会匹配到当前 Claude Code 会话、bash 快照路径、
///   cargo 命令行里的 "claude" 字样。实测基线就有 10 个，噪声比信号大。
/// - 不能只看 argv[0]：`claude` 是带 shebang 的 node 脚本，argv[0] 是 `node`，
///   脚本路径在 argv[1]。只比 argv[0] 会一个都数不到，得到一个骗人的绿。
fn count_procs(engine: Engine) -> usize {
    let Some(exe) = (match engine {
        Engine::Claude => cli_core::proc::resolve_claude_exe(),
        Engine::Codex => cli_core::proc::resolve_codex_exe(),
    }) else {
        return 0;
    };
    let exe = exe.to_string_lossy().to_string();
    let me = std::process::id();

    let Ok(rd) = std::fs::read_dir("/proc") else { return 0 };
    rd.flatten()
        .filter_map(|e| {
            let pid: u32 = e.file_name().to_string_lossy().parse().ok()?;
            if pid == me {
                return None; // 排除本进程（cargo run 的命令行里也有路径）
            }
            let raw = std::fs::read(e.path().join("cmdline")).ok()?;
            let hit = raw
                .split(|&c| c == 0)
                .filter_map(|a| std::str::from_utf8(a).ok())
                .any(|a| a == exe);
            hit.then_some(())
        })
        .count()
}

#[tokio::main]
async fn main() {
    let arg = std::env::args().nth(1).unwrap_or_default();

    println!("== cli-core selftest（CLI 可用性）");
    for (e, ok, detail) in cli_core::selftest() {
        println!("   {} {} {}", if ok { "✓" } else { "✗" }, e.as_str(), detail);
    }
    println!();

    let mut all = true;
    if arg == "cancel" {
        all &= run_cancel(Engine::Claude).await;
    } else {
        if arg.is_empty() || arg == "claude" {
            all &= run_one(Engine::Claude).await;
        }
        if arg.is_empty() || arg == "codex" {
            all &= run_one(Engine::Codex).await;
        }
    }

    println!();
    if all {
        println!("✓ 全部通过 —— 后端可以真实调用 CLI");
    } else {
        println!("✗ 有失败项");
        std::process::exit(1);
    }
}
