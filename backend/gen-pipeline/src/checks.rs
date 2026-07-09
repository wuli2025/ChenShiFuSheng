//! 剧本校验器。**规则随模板走**：读 `contract.checks`，逐条执行同名校验函数。
//!
//! 全局层只有两条硬底线，任何模板都不能豁免（[`GLOBAL_FLOOR`]）：
//! ① 单周目 ≥10 分钟；② 插画来自真生图模型（双梯队），SVG/占位图禁止。

use crate::script::Script;
use crate::template::Contract;

/// 全局硬底线：不在 contract.checks 里也强制执行。
pub const GLOBAL_FLOOR: &[&str] = &["playtime_min", "no_placeholder_art"];

/// 全局最短周目（秒）。这是产品底线，不是模板字段。
pub const FLOOR_PLAYTIME_SEC: u32 = 600;

#[derive(Debug, Clone, serde::Serialize)]
pub struct CheckResult {
    pub name: String,
    pub passed: bool,
    pub detail: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Report {
    pub results: Vec<CheckResult>,
}

impl Report {
    pub fn passed(&self) -> bool {
        self.results.iter().all(|r| r.passed)
    }
    pub fn failures(&self) -> Vec<&CheckResult> {
        self.results.iter().filter(|r| !r.passed).collect()
    }
}

/// 校验上下文：除剧本外，还需要知道插画的来源（用于 no_placeholder_art）。
#[derive(Debug, Default, Clone)]
pub struct ArtAudit {
    /// 每张图的 source：codex | api_fallback | (任何其他值都视为不合格)
    pub sources: Vec<String>,
}

impl ArtAudit {
    pub fn all_real(&self) -> bool {
        self.sources
            .iter()
            .all(|s| s == "codex" || s == "api_fallback")
    }
    pub fn offenders(&self) -> Vec<&String> {
        self.sources
            .iter()
            .filter(|s| s.as_str() != "codex" && s.as_str() != "api_fallback")
            .collect()
    }
}

pub fn run(script: &Script, contract: &Contract, art: &ArtAudit) -> Report {
    // 契约的 checks ∪ 全局底线，去重后执行。
    let mut names: Vec<String> = contract.checks.clone();
    for g in GLOBAL_FLOOR {
        if !names.iter().any(|n| n == g) {
            names.push(g.to_string());
        }
    }

    let results = names
        .iter()
        .map(|name| run_one(name, script, contract, art))
        .collect();
    Report { results }
}

fn ok(name: &str, detail: impl Into<String>) -> CheckResult {
    CheckResult {
        name: name.into(),
        passed: true,
        detail: detail.into(),
    }
}
fn bad(name: &str, detail: impl Into<String>) -> CheckResult {
    CheckResult {
        name: name.into(),
        passed: false,
        detail: detail.into(),
    }
}

fn run_one(name: &str, s: &Script, c: &Contract, art: &ArtAudit) -> CheckResult {
    match name {
        // —— 全局硬底线 ①：单周目 ≥10 分钟。用**最短路径**判定（玩家可能一路冲结局）。
        "playtime_min" => {
            let (mn, mx) = s.playtime_bounds();
            let floor = FLOOR_PLAYTIME_SEC.max(c.scale.playtime_min_sec);
            if mn >= floor {
                ok(name, format!("最短周目 {mn}s / 最长 {mx}s ≥ 底线 {floor}s"))
            } else {
                bad(
                    name,
                    format!("最短周目仅 {mn}s，低于底线 {floor}s（最长 {mx}s）—— 剧情量不足，打回重写"),
                )
            }
        }

        // —— 全局硬底线 ②：禁 SVG / 占位图。两个梯队的真生图才算数。
        "no_placeholder_art" => {
            if art.sources.is_empty() {
                bad(name, "没有任何插画，禁止无图交付")
            } else if art.all_real() {
                let fb = art.sources.iter().filter(|s| *s == "api_fallback").count();
                ok(
                    name,
                    format!("{} 张真生图（其中 {fb} 张走梯队二 api_fallback）", art.sources.len()),
                )
            } else {
                bad(
                    name,
                    format!("发现非真生图来源: {:?}，禁止 SVG/占位图降级", art.offenders()),
                )
            }
        }

        // —— 以下是模板级规则 ——
        "nodes_min" => {
            let n = s.nodes.len();
            if n >= c.scale.nodes_min {
                ok(name, format!("{n} 节点 ≥ {}", c.scale.nodes_min))
            } else {
                bad(name, format!("仅 {n} 节点，模板要求 ≥ {}", c.scale.nodes_min))
            }
        }

        "endings_min" => {
            let n = s.endings().len();
            if n >= c.scale.endings_min {
                ok(name, format!("{n} 结局 ≥ {}", c.scale.endings_min))
            } else {
                bad(name, format!("仅 {n} 结局，模板要求 ≥ {}", c.scale.endings_min))
            }
        }

        "endings_reachable_all" => {
            let reach = s.reachable();
            let dead: Vec<_> = s
                .endings()
                .iter()
                .filter(|e| !reach.contains(&e.id))
                .map(|e| e.id.clone())
                .collect();
            if dead.is_empty() {
                ok(name, format!("{} 个结局全部可达", s.endings().len()))
            } else {
                bad(name, format!("不可达结局: {dead:?}"))
            }
        }

        "true_branching" => {
            let fake = s.fake_branches();
            if fake.is_empty() {
                ok(name, "无换皮分叉")
            } else {
                bad(name, format!("换皮分叉（所有选项跳同一节点）: {fake:?}"))
            }
        }

        "numeric_within_softcap" => {
            if !c.numeric.soft_cap {
                return ok(name, "模板未启用软上限，跳过");
            }
            // 沿最长路累加同一属性的正向增益，看是否可能爆表。
            let mut worst: Vec<(String, i64)> = Vec::new();
            for attr in &c.numeric.attrs {
                let sum: i64 = s
                    .nodes
                    .iter()
                    .map(|n| n.effects.get(attr).copied().unwrap_or(0).max(0))
                    .sum();
                if sum > c.numeric.cap * 3 {
                    worst.push((attr.clone(), sum));
                }
            }
            if worst.is_empty() {
                ok(name, format!("{} 项属性增益均在软上限可控范围", c.numeric.attrs.len()))
            } else {
                bad(name, format!("属性总增益远超上限（可能爆表）: {worst:?}"))
            }
        }

        "gate_narrative_consistency" => {
            if !c.gates.narrative_consistency {
                return ok(name, "模板未要求，跳过");
            }
            // 学术/研究路线不得检查金钱属性（v9 修正）。
            let money = ["存款", "资本", "金钱"];
            let academic = ["学术", "研究", "科研"];
            let mut bads = Vec::new();
            for node in &s.nodes {
                if let Some(g) = &node.gate {
                    let is_academic = academic.iter().any(|k| g.route.contains(k));
                    if is_academic {
                        for m in money {
                            if g.require.contains_key(m) {
                                bads.push(format!("{}({}) 检查了 {}", node.id, g.route, m));
                            }
                        }
                    }
                }
            }
            if bads.is_empty() {
                ok(name, "门槛叙事自洽")
            } else {
                bad(name, format!("门槛不自洽: {bads:?}"))
            }
        }

        "glossary_present" => {
            // 行业沉浸款必须配名词解释图谱。
            let has = s.nodes.iter().any(|n| n.text.contains("【名词】"))
                || !c.ext.is_null() && c.ext.get("glossary").is_some();
            if has {
                ok(name, "存在名词解释")
            } else {
                bad(name, "行业沉浸款要求名词解释图谱，未检出")
            }
        }

        "hidden_line_density" => {
            let hidden = s.nodes.iter().filter(|n| n.hidden).count();
            let ratio = if s.nodes.is_empty() {
                0.0
            } else {
                hidden as f64 / s.nodes.len() as f64
            };
            if ratio >= 0.08 {
                ok(name, format!("隐藏节点占比 {:.1}%", ratio * 100.0))
            } else {
                bad(name, format!("隐藏线密度不足（{:.1}% < 8%）", ratio * 100.0))
            }
        }

        unknown => bad(
            name,
            format!("未知校验规则 `{unknown}` —— 契约写错了，或需要在 checks.rs 里实现"),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::script::{Choice, Ending, Gate, Node};
    use crate::template::builtin;
    use std::collections::HashMap;

    fn node(id: &str, dwell: u32, to: &[&str]) -> Node {
        Node {
            id: id.into(),
            text: String::new(),
            choices: to
                .iter()
                .map(|t| Choice {
                    label: "x".into(),
                    to: t.to_string(),
                    effects: HashMap::new(),
                    require: HashMap::new(),
                })
                .collect(),
            effects: HashMap::new(),
            gate: None,
            ending: None,
            fx: vec![],
            art: None,
            dwell_sec: Some(dwell),
            hidden: false,
        }
    }

    /// 一条 70 节点 × 10 秒 = 700s 的链，末端两个结局。
    fn long_script() -> Script {
        let mut nodes = Vec::new();
        for i in 0..70 {
            nodes.push(node(&format!("n{i}"), 10, &[&format!("n{}", i + 1)]));
        }
        let mut e1 = node("n70", 10, &[]);
        e1.ending = Some(Ending {
            name: "结局甲".into(),
            persona: HashMap::new(),
        });
        nodes.push(e1);
        Script {
            title: "t".into(),
            template_id: "life-seven-classic".into(),
            nodes,
        }
    }

    fn art_ok() -> ArtAudit {
        ArtAudit {
            sources: vec!["codex".into(), "codex".into(), "api_fallback".into()],
        }
    }

    #[test]
    fn global_floor_runs_even_if_not_in_contract() {
        let mut c = builtin()[0].clone();
        c.checks = vec![]; // 模板一条 check 都不写
        let r = run(&long_script(), &c, &art_ok());
        let names: Vec<_> = r.results.iter().map(|x| x.name.as_str()).collect();
        assert!(names.contains(&"playtime_min"));
        assert!(names.contains(&"no_placeholder_art"));
    }

    #[test]
    fn svg_placeholder_is_rejected() {
        let c = builtin()[0].clone();
        let art = ArtAudit {
            sources: vec!["codex".into(), "svg".into()],
        };
        let r = run(&long_script(), &c, &art);
        let f = r.failures();
        assert!(f.iter().any(|x| x.name == "no_placeholder_art"), "SVG 必须被拒");
    }

    #[test]
    fn no_art_at_all_is_rejected() {
        let c = builtin()[0].clone();
        let r = run(&long_script(), &c, &ArtAudit::default());
        assert!(r.failures().iter().any(|x| x.name == "no_placeholder_art"));
    }

    #[test]
    fn api_fallback_counts_as_real_art() {
        let c = builtin()[0].clone();
        let art = ArtAudit {
            sources: vec!["api_fallback".into(); 5],
        };
        let r = run(&long_script(), &c, &art);
        let res = r.results.iter().find(|x| x.name == "no_placeholder_art").unwrap();
        assert!(res.passed, "梯队二也是真生图");
    }

    #[test]
    fn short_playtime_is_rejected() {
        let mut s = long_script();
        s.nodes.truncate(5); // 只剩 ~50 秒
        s.nodes.last_mut().unwrap().choices.clear();
        let c = builtin()[0].clone();
        let r = run(&s, &c, &art_ok());
        assert!(r.failures().iter().any(|x| x.name == "playtime_min"));
    }

    #[test]
    fn unknown_check_name_fails_loudly() {
        let mut c = builtin()[0].clone();
        c.checks = vec!["totally_made_up".into()];
        let r = run(&long_script(), &c, &art_ok());
        assert!(r.failures().iter().any(|x| x.name == "totally_made_up"));
    }

    #[test]
    fn gate_consistency_catches_academic_money_check() {
        let mut s = long_script();
        s.nodes[3].gate = Some(Gate {
            route: "学术路线".into(),
            require: HashMap::from([("存款".to_string(), 50)]),
        });
        let c = builtin()[0].clone();
        let r = run(&s, &c, &art_ok());
        assert!(
            r.failures().iter().any(|x| x.name == "gate_narrative_consistency"),
            "学术线查存款必须被拒"
        );
    }

    #[test]
    fn different_templates_give_different_verdicts() {
        // 同一部剧本，经典款（要求160节点）拒，天才叙事款（不查 nodes_min）在节点数上不拒
        let s = long_script();
        let classic = &builtin()[0];
        let genius = &builtin()[4];
        let r1 = run(&s, classic, &art_ok());
        let r2 = run(&s, genius, &art_ok());
        assert!(r1.failures().iter().any(|x| x.name == "nodes_min"));
        assert!(!r2.results.iter().any(|x| x.name == "nodes_min"));
    }
}
