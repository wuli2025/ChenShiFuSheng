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
        // 环保护：剧本里可能有回退边。
        if !visiting.insert(id.to_string()) {
            return 0;
        }
        let Some(n) = self.node(id) else {
            visiting.remove(id);
            return 0;
        };
        let own = n.dwell();
        let best = if n.choices.is_empty() {
            0
        } else {
            let vals: Vec<u32> = n
                .choices
                .iter()
                .map(|c| self.walk(&c.to, memo, visiting, want_max))
                .collect();
            if want_max {
                vals.into_iter().max().unwrap_or(0)
            } else {
                vals.into_iter().min().unwrap_or(0)
            }
        };
        visiting.remove(id);
        let total = own + best;
        memo.insert(id.to_string(), total);
        total
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
    fn dwell_defaults_from_text_length() {
        let mut node = n("x", &"字".repeat(100), &[]);
        node.dwell_sec = None;
        assert_eq!(node.dwell(), 20);
    }
}
