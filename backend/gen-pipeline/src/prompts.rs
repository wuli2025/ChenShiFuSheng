//! Prompt 组件。**数值一律用占位符，由 contract 注入** —— 禁止手写死数字，
//! 否则契约、校验器、prompt 三处会漂移。

use crate::template::Contract;

pub const WRITE_SCRIPT: &str = r#"你是互动人生模拟游戏的剧本作者。请为题材「{{topic}}」创作完整剧本。

硬性规格（来自模板契约，不可打折）：
- 节点数不少于 {{nodes_min}} 个。
- 结局不少于 {{endings_min}} 个，且每个结局都必须从起点真实可达。
- 单周目最短路径的阅读时长不低于 {{playtime_min}} 分钟。
- 属性维度：{{attrs}}。{{soft_cap}}
- 门槛（GATE）风格：{{gate_style}}。{{gate_consistency}}
- 结局风格：{{ending_style}}——每个结局给出目标画像成绩单。
- 必须是真分叉：不同选择导向不同节点，禁止所有选项跳同一处的换皮分叉。

输出格式：严格的 JSON，符合 Script schema（title / template_id / nodes[]）。
每个 node 含 id、text、choices[]、effects{}、可选 gate / ending / fx[] / hidden。
长任务铁律：若一次写不完，先写完整结构骨架再逐段补 text，不要中途改 schema。
"#;

pub const REVISE_NODE: &str = r#"以下是剧本中的一个节点，请按用户要求修改，只输出修改后的该节点 JSON。
不要改动 id，不要影响其他节点的引用完整性。

节点：{{node_json}}
用户要求：{{instruction}}
"#;

pub const WRITE_FX: &str = r#"为以下节点挂载演出效果。可用预设仅限：{{fx_presets}}。
禁止自由关键帧，每个节点的演出条目不超过 6 条。
输出「演出:」开头的行，每行一条，例如：
演出: cam.zoom(1.15, 800ms)
演出: weather.rain(medium)

节点：{{node_json}}
"#;

pub const SCENE_ART: &str = r#"为节点「{{node_id}}」生成插画。
风格：{{style_prompt}}
画面：{{scene_text}}
"#;

/// 注入契约 + 运行时变量。契约的占位符由 `Contract::inject` 处理，
/// 这里只补运行时变量（topic / node_json / instruction …）。
pub fn render(tpl: &str, contract: &Contract, vars: &[(&str, &str)]) -> String {
    let mut out = contract.inject(tpl);
    for (k, v) in vars {
        out = out.replace(&format!("{{{{{k}}}}}"), v);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::template::builtin;

    #[test]
    fn write_script_prompt_has_no_leftover_placeholders() {
        let c = &builtin()[0];
        let out = render(WRITE_SCRIPT, c, &[("topic", "兽医人生")]);
        assert!(out.contains("兽医人生"));
        assert!(out.contains("160"));
        assert!(out.contains("29"));
        assert!(!out.contains("{{"), "残留占位符:\n{out}");
    }

    /// 契约驱动的证明：换模板 → prompt 里的数字自动变，代码一行没改。
    #[test]
    fn different_contracts_yield_different_prompts() {
        let a = render(WRITE_SCRIPT, &builtin()[0], &[("topic", "x")]);
        let b = render(WRITE_SCRIPT, &builtin()[1], &[("topic", "x")]);
        assert_ne!(a, b);
        assert!(a.contains("160") && b.contains("315"));
    }

    #[test]
    fn fx_prompt_lists_only_contract_presets() {
        let out = render(WRITE_FX, &builtin()[0], &[("node_json", "{}")]);
        assert!(out.contains("cam"));
        assert!(out.contains("weather"));
    }
}
