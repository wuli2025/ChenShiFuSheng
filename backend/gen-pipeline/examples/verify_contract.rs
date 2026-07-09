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

    // CI 门禁必须**断言**，不能只打印 —— 否则它永远返回 0，等于没跑。
    let mut violations: Vec<String> = Vec::new();

    for c in builtin() {
        println!("━━ 模板 {} ({})", c.name, c.id);
        for (label, art) in &scenarios {
            let r = checks::run(&script, &c, art);
            let f = r.failures();
            let verdict = if r.passed() { "✓ 通过".to_string() } else { format!("✗ 拒绝 ({} 项)", f.len()) };
            println!("   {label:<18} {verdict}");
            for x in &f {
                println!("       · {}: {}", x.name, x.detail);
            }

            // ① 全局硬底线：任何模板下，SVG / 无图都必须被拒。
            if label.contains("SVG") || label.contains("无图") {
                let rejected_for_art = f.iter().any(|x| x.name == "no_placeholder_art");
                if !rejected_for_art {
                    violations.push(format!("{} × {label}：SVG/无图竟然没被 no_placeholder_art 拒绝", c.id));
                }
            }

            // ② 这份 fixture 是照着「经典款」写的，它必须过；
            //    梯队二降级(api_fallback)同样算真生图，也必须过。
            if c.id == "life-seven-classic" && (label.contains("codex 真生图") || label.contains("梯队二降级")) && !r.passed() {
                violations.push(format!("{} × {label}：合格剧本被误拒 —— {:?}", c.id,
                    f.iter().map(|x| x.name.as_str()).collect::<Vec<_>>()));
            }
        }
        println!();
    }

    // ③ 「不要生成的都是一个样子」：至少要有两个模板对同一剧本给出不同判决。
    let verdicts: Vec<bool> = builtin()
        .iter()
        .map(|c| checks::run(&script, c, &scenarios[0].1).passed())
        .collect();
    if verdicts.iter().all(|v| *v == verdicts[0]) {
        violations.push("所有模板判决一致 —— 规则没有随模板变，模板化失效".into());
    }

    if !violations.is_empty() {
        eprintln!("✗ 契约门禁未通过：");
        for v in &violations {
            eprintln!("   · {v}");
        }
        std::process::exit(1);
    }
    println!("✓ 契约门禁通过：SVG/无图一律被拒；合格剧本在其目标模板下通过；模板判决存在差异");
    Ok(())
}
