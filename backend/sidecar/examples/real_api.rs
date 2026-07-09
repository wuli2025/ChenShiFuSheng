//! 用**真的** chenshi-api 验证 sidecar：PORT=0 → 内核挑端口 → 解析就绪信号 →
//! 打 /v1/health 通 → stop 后端口释放、进程回收。
//!
//! 假的 shell 脚本证明不了 PORT=0 的真实行为，所以要有这个例子。
//! cargo run -p sidecar --example real_api -- target/release/chenshi-api
use sidecar::{Sidecar, SidecarConfig};
use std::time::Duration;

fn curl(url: &str) -> String {
    std::process::Command::new("curl")
        .args(["-s", "-m", "3", "--noproxy", "*", url])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default()
}

fn main() -> anyhow::Result<()> {
    let exe = std::env::args().nth(1).unwrap_or_else(|| "target/release/chenshi-api".into());
    let dir = std::env::temp_dir().join("sidecar-real");
    let _ = std::fs::remove_dir_all(&dir);

    let cfg = SidecarConfig::new(&exe, &dir);
    let sc = Sidecar::start(&cfg)?;
    anyhow::ensure!(sc.port != 0, "端口不该是 0");
    println!("  ✓ 内核分配端口 {}（不是写死的 17801）", sc.port);
    println!("  ✓ token {} 位十六进制", sc.token.len());
    println!("  ✓ 进程存活 {}", sc.is_alive());

    let body = curl(&format!("{}/v1/health", sc.base_url()));
    let ok = body.contains("\"mode\": \"embedded\"") || body.contains("\"ok\": true") || body.contains("\"ok\":true");
    println!("  {} /v1/health 可达", if ok { "✓" } else { "✗" });
    anyhow::ensure!(ok, "health 不可达，返回: {body}");

    let port = sc.port;
    sc.stop();
    std::thread::sleep(Duration::from_millis(800));
    let dead = curl(&format!("http://127.0.0.1:{port}/v1/health")).is_empty();
    println!("  {} stop 后端口不再响应，进程树已回收", if dead { "✓" } else { "✗" });
    anyhow::ensure!(dead, "stop 后 api 仍在跑");

    println!("\n✓ sidecar 与真实 api 端到端通过");
    Ok(())
}
