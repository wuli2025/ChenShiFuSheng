//! P4 冒烟：证明「规则随模板走」与「两条全局硬底线不可豁免」。
//!
//! 跑法：cargo run -p gen-pipeline --example verify_contract -- <script.json>

use gen_pipeline::checks::{self, ArtAudit};
use gen_pipeline::script::Script;
use gen_pipeline::template::builtin;

fn main() -> anyhow::Result<()> {
    let path = std::env::args().nth(1).expect("用法: verify_contract <script.json>");
    let raw = std::fs::read_to_string(&path)?;
    let json_start = raw.find('{').expect("找不到 JSON");
    let script = Script::from_json(&raw[json_start..])?;

    println!("剧本: {} —— {} 节点, {} 结局", script.title, script.nodes.len(), script.endings().len());
    let (mn, mx) = script.playtime_bounds();
    println!("单周目时长: 最短 {mn}s / 最长 {mx}s\n");

    let scenarios: Vec<(&str, ArtAudit)> = vec![
        ("全部 codex 真生图", ArtAudit { sources: vec!["codex".into(); 6] }),
        ("含 2 张梯队二降级", ArtAudit { sources: vec!["codex".into(), "codex".into(), "codex".into(), "codex".into(), "api_fallback".into(), "api_fallback".into()] }),
        ("混入 SVG 占位图", ArtAudit { sources: vec!["codex".into(), "svg".into()] }),
        ("完全无图", ArtAudit::default()),
    ];

    for c in builtin() {
        println!("━━ 模板 {} ({})", c.name, c.id);
        for (label, art) in &scenarios {
            let r = checks::run(&script, &c, art);
            let f = r.failures();
            let verdict = if r.passed() { "✓ 通过".to_string() } else { format!("✗ 拒绝 ({} 项)", f.len()) };
            println!("   {label:<18} {verdict}");
            for x in f {
                println!("       · {}: {}", x.name, x.detail);
            }
        }
        println!();
    }
    Ok(())
}
