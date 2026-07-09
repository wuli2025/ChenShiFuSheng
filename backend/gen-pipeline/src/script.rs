//! script.md 的结构化模型 —— 唯一真源。
//!
//! 编辑器手点动效、AI 写「演出:」行，改的都是这一份数据。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Script {
    pub title: String,
    pub template_id: String,
    pub nodes: Vec<Node>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    #[serde(default)]
    pub text: String,
    /// 结局节点没有 choices。
    #[serde(default)]
    pub choices: Vec<Choice>,
    /// 进入本节点时的属性增减。
    #[serde(default)]
    pub effects: HashMap<String, i64>,
    /// GATE 节点：需要属性达标才能进入。
    #[serde(default)]
    pub gate: Option<Gate>,
    #[serde(default)]
    pub ending: Option<Ending>,
    /// 「演出:」行 —— 动效挂载。AI 与编辑器同权写这里。
    #[serde(default)]
    pub fx: Vec<String>,
    /// 本节点绑定的插画资产哈希。
    #[serde(default)]
    pub art: Option<String>,
    /// 估计阅读/停留时长（秒），用于 playtime 推演。
    #[serde(default)]
    pub dwell_sec: Option<u32>,
    #[serde(default)]
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Choice {
    pub label: String,
    pub to: String,
    #[serde(default)]
    pub effects: HashMap<String, i64>,
    /// 选项级门槛。
    #[serde(default)]
    pub require: HashMap<String, i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Gate {
    pub route: String,
    /// 属性 → 最低值
    pub require: HashMap<String, i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ending {
    pub name: String,
    /// 目标画像成绩单（persona_report 风格）。
    #[serde(default)]
    pub persona: HashMap<String, i64>,
}

impl Node {
    pub fn is_ending(&self) -> bool {
        self.ending.is_some()
    }
    /// 默认停留：正文每 60 字约 12 秒（中文阅读速度 ~300 字/分），最低 4 秒。
    pub fn dwell(&self) -> u32 {
        self.dwell_sec.unwrap_or_else(|| {
            let chars = self.text.chars().count() as u32;
            (chars / 5).max(4)
        })
    }
}

impl Script {
    pub fn from_json(s: &str) -> anyhow::Result<Self> {
        Ok(serde_json::from_str(s)?)
    }

    pub fn node(&self, id: &str) -> Option<&Node> {
        self.nodes.iter().find(|n| n.id == id)
    }

    pub fn start(&self) -> Option<&Node> {
        self.nodes.first()
    }

    pub fn endings(&self) -> Vec<&Node> {
        self.nodes.iter().filter(|n| n.is_ending()).collect()
    }

    /// 从起点可达的节点集合（忽略属性门槛，只看结构连通性）。
    pub fn reachable(&self) -> std::collections::HashSet<String> {
        let mut seen = std::collections::HashSet::new();
        let Some(start) = self.start() else {
            return seen;
        };
        let mut stack = vec![start.id.clone()];
        while let Some(id) = stack.pop() {
            if !seen.insert(id.clone()) {
                continue;
            }
            if let Some(n) = self.node(&id) {
                for c in &n.choices {
                    if !seen.contains(&c.to) {
                        stack.push(c.to.clone());
                    }
                }
            }
        }
        seen
    }

    /// 最长路径的时长（秒）—— 用作单周目时长的乐观估计；
    /// 同时算最短路径，取**最短路**作为保守判定（玩家可能一路冲结局）。
    pub fn playtime_bounds(&self) -> (u32, u32) {
        let mut memo_min: HashMap<String, u32> = HashMap::new();
        let mut memo_max: HashMap<String, u32> = HashMap::new();
        let mut visiting = std::collections::HashSet::new();
        let Some(start) = self.start() else {
            return (0, 0);
        };
        let mn = self.walk(&start.id, &mut memo_min, &mut visiting, false);
        visiting.clear();
        let mx = self.walk(&start.id, &mut memo_max, &mut visiting, true);
        (mn, mx)
    }

    fn walk(
        &self,
        id: &str,
        memo: &mut HashMap<String, u32>,
        visiting: &mut std::collections::HashSet<String>,
        want_max: bool,
    ) -> u32 {
        if let Some(v) = memo.get(id) {
            return *v;
        }
        // 环保护：剧本里可能有回退边。这条路径上的值是被截断的，
        // **绝不能写进 memo** —— 否则 0 会污染所有经过该节点的路径。
        if !visiting.insert(id.to_string()) {
            return 0;
        }
        // 悬空引用（choices 指向不存在的节点）同样不进 memo：
        // 它由 dangling_refs 检查单独报错，这里不假装它是一条 0 秒的路。
        let Some(n) = self.node(id) else {
            visiting.remove(id);
            return 0;
        };
        let own = n.dwell();
        let best = if n.choices.is_empty() {
            0
        } else {
            // 只把指向真实存在节点的边算进来。悬空边不参与 min，
            // 否则一条断边会把「最短周目」压成 0，掩盖真实的剧情量。
            let vals: Vec<u32> = n
                .choices
                .iter()
                .filter(|c| self.node(&c.to).is_some())
                .map(|c| self.walk(&c.to, memo, visiting, want_max))
                .collect();
            if vals.is_empty() {
                0
            } else if want_max {
                vals.into_iter().max().unwrap_or(0)
            } else {
                vals.into_iter().min().unwrap_or(0)
            }
        };
        let had_cycle = visiting.remove(id) && best == 0 && !n.choices.is_empty();
        let total = own + best;
        // 被环截断的结果不缓存。
        if !had_cycle {
            memo.insert(id.to_string(), total);
        }
        total
    }

    /// 悬空引用：choices 指向不存在的节点。AI 写长剧本时的高频缺陷。
    /// 返回 (源节点 id, 悬空目标 id) 列表。
    pub fn dangling_refs(&self) -> Vec<(String, String)> {
        self.nodes
            .iter()
            .flat_map(|n| {
                n.choices
                    .iter()
                    .filter(|c| self.node(&c.to).is_none())
                    .map(move |c| (n.id.clone(), c.to.clone()))
            })
            .collect()
    }

    /// 真分叉检测：选择必须导向不同节点，不能是换皮（所有选项跳同一处）。
    /// 返回换皮节点的 id 列表。
    pub fn fake_branches(&self) -> Vec<String> {
        self.nodes
            .iter()
            .filter(|n| n.choices.len() > 1)
            .filter(|n| {
                let first = &n.choices[0].to;
                n.choices.iter().all(|c| &c.to == first)
            })
            .map(|n| n.id.clone())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn n(id: &str, text: &str, to: &[&str]) -> Node {
        Node {
            id: id.into(),
            text: text.into(),
            choices: to
                .iter()
                .map(|t| Choice {
                    label: format!("去{t}"),
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
            dwell_sec: Some(10),
            hidden: false,
        }
    }
    fn end(id: &str) -> Node {
        let mut x = n(id, "终", &[]);
        x.ending = Some(Ending {
            name: id.into(),
            persona: HashMap::new(),
        });
        x
    }

    fn sample() -> Script {
        Script {
            title: "t".into(),
            template_id: "life-seven-classic".into(),
            nodes: vec![n("a", "起", &["b", "c"]), n("b", "中", &["d"]), n("c", "中", &["d"]), end("d")],
        }
    }

    #[test]
    fn reachable_finds_all() {
        assert_eq!(sample().reachable().len(), 4);
    }

    #[test]
    fn unreachable_ending_detected() {
        let mut s = sample();
        s.nodes.push(end("orphan"));
        assert!(!s.reachable().contains("orphan"));
    }

    #[test]
    fn playtime_bounds_sane() {
        let (mn, mx) = sample().playtime_bounds();
        assert_eq!(mn, 30); // a10 + b10 + d10
        assert_eq!(mx, 30);
        assert!(mn <= mx);
    }

    #[test]
    fn cycles_do_not_hang() {
        let s = Script {
            title: "t".into(),
            template_id: "x".into(),
            nodes: vec![n("a", "", &["b"]), n("b", "", &["a", "c"]), end("c")],
        };
        let (_, mx) = s.playtime_bounds(); // 不能死循环
        assert!(mx > 0);
    }

    #[test]
    fn fake_branch_detected() {
        let mut s = sample();
        s.nodes[0].choices[1].to = "b".into(); // 两个选项都去 b = 换皮
        assert_eq!(s.fake_branches(), vec!["a"]);
    }

    #[test]
    fn dangling_ref_detected() {
        let mut s = sample();
        s.nodes[1].choices[0].to = "ghost".into();
        assert_eq!(s.dangling_refs(), vec![("b".to_string(), "ghost".to_string())]);
    }

    /// 回归：一条悬空边曾把「最短周目」压成单节点时长，掩盖真实剧情量。
    #[test]
    fn dangling_edge_does_not_zero_out_playtime() {
        let mut s = sample();
        // a 的第二个选项指向不存在的节点
        s.nodes[0].choices[1].to = "ghost".into();
        let (mn, _) = s.playtime_bounds();
        assert_eq!(mn, 30, "悬空边不该参与最短路计算");
    }

    /// 回归：环剪枝返回的 0 曾被 memo 缓存，污染所有经过该节点的路径。
    #[test]
    fn cycle_does_not_poison_memo() {
        let s = Script {
            title: "t".into(),
            template_id: "x".into(),
            // a→b, b→{a(回边), c}, c 是结局。正确最短 = a10+b10+c10 = 30
            nodes: vec![n("a", "", &["b"]), n("b", "", &["a", "c"]), end("c")],
        };
        let (mn, mx) = s.playtime_bounds();
        assert_eq!(mx, 30, "最长路不该被回边截断为 0");
        assert!(mn > 0, "最短路不该是 0");
    }

    #[test]
    fn dwell_defaults_from_text_length() {
        let mut node = n("x", &"字".repeat(100), &[]);
        node.dwell_sec = None;
        assert_eq!(node.dwell(), 20);
    }
}
