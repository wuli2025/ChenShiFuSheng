//! 模板契约 —— v11 的核心设计。
//!
//! 「不要生成的都是一个样子」：节点数、结局数、门槛哲学、校验规则**全部是模板字段**，
//! 不是代码里的常量。加一个模板 = 插一行库，零发版。
//!
//! 全局硬底线只剩两条（见 `checks::GLOBAL_FLOOR`）：
//! ① 单周目 ≥10 分钟；② 插画必须真生图模型（双梯队），禁 SVG/占位。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contract {
    pub id: String,
    pub name: String,
    pub scale: Scale,
    pub numeric: Numeric,
    pub gates: Gates,
    pub endings: Endings,
    pub hints: Hints,
    pub art: Art,
    pub fx: Fx,
    /// 本模板的一票否决项。校验器逐条执行；名字对应 `checks::run` 里的函数。
    pub checks: Vec<String>,
    /// 自由扩展字段，新题材塞不进时用它，避免改 schema。
    #[serde(default)]
    pub ext: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Scale {
    pub nodes_min: usize,
    pub endings_min: usize,
    /// 单周目时长下限（秒）。全局硬底线要求 ≥600。
    pub playtime_min_sec: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Numeric {
    /// 软上限防爆表（v5 教训）。
    pub soft_cap: bool,
    pub attrs: Vec<String>,
    /// diminishing | linear
    pub growth_curve: String,
    #[serde(default = "default_cap")]
    pub cap: i64,
}
fn default_cap() -> i64 {
    100
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Gates {
    /// attr_threshold | event_flag | mixed
    pub style: String,
    /// 门槛叙事自洽：学术线不查存款、创业线要钱+技术（v9 修正）。
    pub narrative_consistency: bool,
    /// fullscreen_text | fade | none
    pub transition: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Endings {
    /// persona_report（从叙事反推目标画像成绩单，v5 设计）| simple
    pub style: String,
    /// 要求每个结局可达性证明（BFS）。
    pub reachability_proof: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hints {
    pub hidden_lines: bool,
    pub fate_fork: bool,
    pub ending_counter: bool,
    /// 重掷次数随已解锁结局增长（v9）。
    pub reroll_by_unlock: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Art {
    /// 横版场景图任务名。
    pub scene: String,
    /// 竖版透明立绘任务名。
    pub sprite: String,
    /// 两个梯队共用同一段 style_prompt，fallback 图混入时风格不跳戏。
    pub style_prompt: String,
    /// auto | off | api_only —— 生图梯队二的选路策略。
    #[serde(default = "default_fallback")]
    pub fallback: String,
    #[serde(default = "default_concurrency")]
    pub concurrency: usize,
}
fn default_fallback() -> String {
    "auto".into()
}
fn default_concurrency() -> usize {
    2
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fx {
    /// enter/exit · pose/emote · cam · filter · weather · audio
    pub presets: Vec<String>,
    pub typewriter: bool,
}

impl Contract {
    pub fn from_json(s: &str) -> anyhow::Result<Self> {
        Ok(serde_json::from_str(s)?)
    }

    /// 把契约注入 prompt —— **数值绝不手写死在 prompt 里**，
    /// 保证契约、校验器、prompt 三处永远一致。
    pub fn inject(&self, prompt_tpl: &str) -> String {
        prompt_tpl
            .replace("{{nodes_min}}", &self.scale.nodes_min.to_string())
            .replace("{{endings_min}}", &self.scale.endings_min.to_string())
            .replace(
                "{{playtime_min}}",
                &(self.scale.playtime_min_sec / 60).to_string(),
            )
            .replace("{{attrs}}", &self.numeric.attrs.join("、"))
            .replace(
                "{{soft_cap}}",
                if self.numeric.soft_cap {
                    &"启用软上限，属性接近上限时收益递减，禁止爆表"
                } else {
                    &"不设软上限"
                },
            )
            .replace("{{gate_style}}", &self.gates.style)
            .replace(
                "{{gate_consistency}}",
                if self.gates.narrative_consistency {
                    "门槛必须叙事自洽：学术路线不检查存款，创业路线要求资金与技术"
                } else {
                    ""
                },
            )
            .replace("{{ending_style}}", &self.endings.style)
            .replace("{{style_prompt}}", &self.art.style_prompt)
            .replace("{{fx_presets}}", &self.fx.presets.join("、"))
    }
}

/// 首发内置模板，从既有九部成品收编。存 DB 的 `templates` 表；这里是种子数据。
pub fn builtin() -> Vec<Contract> {
    let mk = |id: &str,
              name: &str,
              nodes: usize,
              endings: usize,
              secs: u32,
              attrs: &[&str],
              style: &str,
              checks: &[&str]| Contract {
        id: id.into(),
        name: name.into(),
        scale: Scale {
            nodes_min: nodes,
            endings_min: endings,
            playtime_min_sec: secs,
        },
        numeric: Numeric {
            soft_cap: true,
            attrs: attrs.iter().map(|s| s.to_string()).collect(),
            growth_curve: "diminishing".into(),
            cap: 100,
        },
        gates: Gates {
            style: "attr_threshold".into(),
            narrative_consistency: true,
            transition: "fullscreen_text".into(),
        },
        endings: Endings {
            style: "persona_report".into(),
            reachability_proof: true,
        },
        hints: Hints {
            hidden_lines: true,
            fate_fork: true,
            ending_counter: true,
            reroll_by_unlock: true,
        },
        art: Art {
            scene: "codex_shot_landscape".into(),
            sprite: "codex_sprite_transparent".into(),
            style_prompt: style.into(),
            fallback: "auto".into(),
            concurrency: 2,
        },
        fx: Fx {
            presets: vec![
                "enter".into(),
                "pose".into(),
                "cam".into(),
                "filter".into(),
                "weather".into(),
                "audio".into(),
            ],
            typewriter: true,
        },
        checks: checks.iter().map(|s| s.to_string()).collect(),
        ext: serde_json::Value::Null,
    };

    vec![
        mk(
            "life-seven-classic",
            "人生七年·经典款",
            160,
            29,
            600,
            &["体魄", "学识", "技术", "魅力", "存款"],
            "水彩纪实风，柔和光影，中国当代都市与乡镇场景",
            &[
                "playtime_min",
                "nodes_min",
                "endings_min",
                "endings_reachable_all",
                "true_branching",
                "numeric_within_softcap",
                "gate_narrative_consistency",
            ],
        ),
        mk(
            "epic-scroll",
            "史诗长卷款",
            315,
            43,
            900,
            &["体魄", "学识", "技术", "魅力", "存款", "声望"],
            "厚涂油画风，宏大叙事，跨越数十年的时代变迁",
            &[
                "playtime_min",
                "nodes_min",
                "endings_min",
                "endings_reachable_all",
                "true_branching",
                "numeric_within_softcap",
            ],
        ),
        mk(
            "industry-immersive",
            "行业沉浸款",
            83,
            35,
            900,
            &["专业", "人脉", "风控", "体魄", "资本"],
            "写实插画风，金融/法律/医疗等专业场景，器物细节考究",
            &[
                "playtime_min",
                "endings_min",
                "endings_reachable_all",
                "true_branching",
                "glossary_present",
            ],
        ),
        mk(
            "fast-career",
            "快节奏职业款",
            120,
            32,
            600,
            &["专业", "人脉", "口碑", "存款"],
            "清爽扁平插画，职场与城市生活",
            &[
                "playtime_min",
                "nodes_min",
                "endings_min",
                "endings_reachable_all",
                "true_branching",
            ],
        ),
        mk(
            "genius-narrative",
            "天才叙事款",
            110,
            32,
            600,
            &["天赋", "专注", "孤独"],
            "冷色调概念插画，抽象与理性之美",
            &[
                "playtime_min",
                "endings_min",
                "endings_reachable_all",
                "hidden_line_density",
            ],
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_templates_differ_in_rules() {
        let ts = builtin();
        assert_eq!(ts.len(), 5);
        let classic = &ts[0];
        let epic = &ts[1];
        // 这就是「不要生成的都是一个样子」的机器证明
        assert_ne!(classic.scale.nodes_min, epic.scale.nodes_min);
        assert_ne!(classic.scale.endings_min, epic.scale.endings_min);
        assert_ne!(classic.numeric.attrs, epic.numeric.attrs);
        assert_ne!(classic.checks, ts[4].checks);
    }

    #[test]
    fn every_builtin_meets_global_floor() {
        for t in builtin() {
            assert!(t.scale.playtime_min_sec >= 600, "{} 违反 10 分钟底线", t.id);
            assert!(t.art.scene.starts_with("codex_"), "{} 必须 codex 优先", t.id);
        }
    }

    #[test]
    fn inject_replaces_all_placeholders() {
        let c = &builtin()[0];
        let out = c.inject("写 {{nodes_min}} 节点 {{endings_min}} 结局，属性 {{attrs}}，{{soft_cap}}");
        assert!(out.contains("160"));
        assert!(out.contains("29"));
        assert!(out.contains("存款"));
        assert!(!out.contains("{{"), "有占位符没替换: {out}");
    }

    #[test]
    fn contract_roundtrips_json() {
        let c = &builtin()[2];
        let s = serde_json::to_string(c).unwrap();
        let back = Contract::from_json(&s).unwrap();
        assert_eq!(back.id, c.id);
        assert_eq!(back.checks, c.checks);
    }
}
