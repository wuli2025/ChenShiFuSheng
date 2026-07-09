//! 内置供应商预设表。**原样搬自 `_legacy/src-tauri/src/provider.rs`，55 条一个不少。**
//!
//! 只有本文件知道厂商名字。其余模块通过 `Dock::env_patch_for` 拿不透明补丁。

/// 大多数 Anthropic 兼容端点用 AUTH_TOKEN；少数（Gemini/LemonData 等）用 API_KEY。
const DEFAULT_TOKEN_FIELD: &str = "ANTHROPIC_AUTH_TOKEN";
const API_KEY_FIELD: &str = "ANTHROPIC_API_KEY";

#[derive(Debug, Clone, Copy, serde::Serialize)]
pub struct Preset {
    pub id: &'static str,
    pub name: &'static str,
    pub base_url: &'static str,
    pub token_field: &'static str,
    /// official | cn_official | aggregator | third_party | cloud_provider
    pub category: &'static str,
    /// official | key | codex | copilot
    pub kind: &'static str,
}

pub fn find(id: &str) -> Option<&'static Preset> {
    PRESETS.iter().find(|p| p.id == id)
}

pub fn by_category(cat: &str) -> Vec<&'static Preset> {
    PRESETS.iter().filter(|p| p.category == cat).collect()
}

pub const PRESETS: &[Preset] = &[
    Preset { id: "claude-official", name: "Claude 官方", base_url: "", token_field: DEFAULT_TOKEN_FIELD, category: "official", kind: "official" },
    Preset { id: "shengsuanyun", name: "胜算云", base_url: "https://router.shengsuanyun.com/api", token_field: DEFAULT_TOKEN_FIELD, category: "aggregator", kind: "key" },
    Preset { id: "patewayai", name: "PatewayAI", base_url: "https://api.pateway.ai", token_field: API_KEY_FIELD, category: "third_party", kind: "key" },
    Preset { id: "agentplan", name: "火山方舟 Agentplan", base_url: "https://ark.cn-beijing.volces.com/api/coding", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "byteplus", name: "BytePlus", base_url: "https://ark.ap-southeast.bytepluses.com/api/coding", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "doubaoseed", name: "豆包 Seed", base_url: "https://ark.cn-beijing.volces.com/api/compatible", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "gemini-native", name: "Gemini Native", base_url: "https://generativelanguage.googleapis.com", token_field: API_KEY_FIELD, category: "third_party", kind: "key" },
    Preset { id: "deepseek", name: "DeepSeek 深度求索", base_url: "https://api.deepseek.com/anthropic", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "zhipu-glm", name: "智谱 GLM", base_url: "https://open.bigmodel.cn/api/anthropic", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "zhipu-glm-en", name: "智谱 GLM 国际", base_url: "https://api.z.ai/api/anthropic", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "baidu-qianfan-coding-plan", name: "百度千帆 Coding", base_url: "https://qianfan.baidubce.com/anthropic/coding", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "bailian", name: "阿里百炼", base_url: "https://dashscope.aliyuncs.com/apps/anthropic", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "bailian-for-coding", name: "阿里百炼 Coding", base_url: "https://coding.dashscope.aliyuncs.com/apps/anthropic", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "kimi", name: "Kimi 月之暗面", base_url: "https://api.moonshot.cn/anthropic", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "kimi-for-coding", name: "Kimi For Coding", base_url: "https://api.kimi.com/coding/", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "stepfun", name: "StepFun 阶跃", base_url: "https://api.stepfun.com/step_plan", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "stepfun-en", name: "StepFun en", base_url: "https://api.stepfun.ai/step_plan", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "modelscope", name: "ModelScope 魔搭", base_url: "https://api-inference.modelscope.cn", token_field: DEFAULT_TOKEN_FIELD, category: "aggregator", kind: "key" },
    Preset { id: "kat-coder", name: "KAT-Coder", base_url: "https://vanchin.streamlake.ai/api/gateway/v1/endpoints/${ENDPOINT_ID}/claude-code-proxy", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "longcat", name: "LongCat", base_url: "https://api.longcat.chat/anthropic", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "minimax", name: "MiniMax", base_url: "https://api.minimaxi.com/anthropic", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "minimax-en", name: "MiniMax en", base_url: "https://api.minimax.io/anthropic", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "bailing", name: "百灵 BaiLing", base_url: "https://api.tbox.cn/api/anthropic", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "aihubmix", name: "AiHubMix", base_url: "https://aihubmix.com", token_field: API_KEY_FIELD, category: "aggregator", kind: "key" },
    Preset { id: "siliconflow", name: "SiliconFlow 硅基流动", base_url: "https://api.siliconflow.cn", token_field: DEFAULT_TOKEN_FIELD, category: "aggregator", kind: "key" },
    Preset { id: "siliconflow-en", name: "SiliconFlow en", base_url: "https://api.siliconflow.com", token_field: DEFAULT_TOKEN_FIELD, category: "aggregator", kind: "key" },
    Preset { id: "dmxapi", name: "DMXAPI", base_url: "https://www.dmxapi.cn", token_field: DEFAULT_TOKEN_FIELD, category: "aggregator", kind: "key" },
    Preset { id: "packycode", name: "PackyCode", base_url: "https://www.packyapi.com", token_field: DEFAULT_TOKEN_FIELD, category: "third_party", kind: "key" },
    Preset { id: "claudeapi", name: "ClaudeAPI", base_url: "https://gw.claudeapi.com", token_field: DEFAULT_TOKEN_FIELD, category: "aggregator", kind: "key" },
    Preset { id: "claudecn", name: "ClaudeCN", base_url: "https://claudecn.top", token_field: DEFAULT_TOKEN_FIELD, category: "third_party", kind: "key" },
    Preset { id: "runapi", name: "RunAPI", base_url: "https://runapi.co", token_field: DEFAULT_TOKEN_FIELD, category: "aggregator", kind: "key" },
    Preset { id: "relaxycode", name: "RelaxyCode", base_url: "https://www.relaxycode.com", token_field: DEFAULT_TOKEN_FIELD, category: "third_party", kind: "key" },
    Preset { id: "cubence", name: "Cubence", base_url: "https://api.cubence.com", token_field: DEFAULT_TOKEN_FIELD, category: "third_party", kind: "key" },
    Preset { id: "aigocode", name: "AIGoCode", base_url: "https://api.aigocode.com", token_field: DEFAULT_TOKEN_FIELD, category: "third_party", kind: "key" },
    Preset { id: "rightcode", name: "RightCode", base_url: "https://www.right.codes/claude", token_field: DEFAULT_TOKEN_FIELD, category: "third_party", kind: "key" },
    Preset { id: "aicodemirror", name: "AICodeMirror", base_url: "https://api.aicodemirror.com/api/claudecode", token_field: DEFAULT_TOKEN_FIELD, category: "third_party", kind: "key" },
    Preset { id: "crazyrouter", name: "CrazyRouter", base_url: "https://cn.crazyrouter.com", token_field: DEFAULT_TOKEN_FIELD, category: "third_party", kind: "key" },
    Preset { id: "sssaicode", name: "SSSAiCode", base_url: "https://node-hk.sssaicode.com/api", token_field: DEFAULT_TOKEN_FIELD, category: "third_party", kind: "key" },
    Preset { id: "compshare", name: "优云智算", base_url: "https://api.modelverse.cn", token_field: DEFAULT_TOKEN_FIELD, category: "aggregator", kind: "key" },
    Preset { id: "compshare-coding-plan", name: "优云智算 Coding", base_url: "https://cp.compshare.cn", token_field: DEFAULT_TOKEN_FIELD, category: "aggregator", kind: "key" },
    Preset { id: "micu", name: "Micu", base_url: "https://www.micuapi.ai", token_field: DEFAULT_TOKEN_FIELD, category: "third_party", kind: "key" },
    Preset { id: "ctok-ai", name: "CTok.ai", base_url: "https://api.ctok.ai", token_field: DEFAULT_TOKEN_FIELD, category: "third_party", kind: "key" },
    Preset { id: "e-flowcode", name: "E-FlowCode", base_url: "https://e-flowcode.cc", token_field: DEFAULT_TOKEN_FIELD, category: "third_party", kind: "key" },
    Preset { id: "openrouter", name: "OpenRouter", base_url: "https://openrouter.ai/api", token_field: DEFAULT_TOKEN_FIELD, category: "aggregator", kind: "key" },
    Preset { id: "therouter", name: "TheRouter", base_url: "https://api.therouter.ai", token_field: DEFAULT_TOKEN_FIELD, category: "aggregator", kind: "key" },
    Preset { id: "novita-ai", name: "Novita AI", base_url: "https://api.novita.ai/anthropic", token_field: DEFAULT_TOKEN_FIELD, category: "aggregator", kind: "key" },
    Preset { id: "github-copilot", name: "GitHub Copilot", base_url: "https://api.githubcopilot.com", token_field: DEFAULT_TOKEN_FIELD, category: "third_party", kind: "copilot" },
    Preset { id: "codex", name: "Codex (ChatGPT)", base_url: "https://chatgpt.com/backend-api/codex", token_field: DEFAULT_TOKEN_FIELD, category: "third_party", kind: "codex" },
    Preset { id: "lemondata", name: "LemonData", base_url: "https://api.lemondata.cc", token_field: API_KEY_FIELD, category: "third_party", kind: "key" },
    Preset { id: "nvidia", name: "Nvidia", base_url: "https://integrate.api.nvidia.com", token_field: DEFAULT_TOKEN_FIELD, category: "aggregator", kind: "key" },
    Preset { id: "pipellm", name: "PIPELLM", base_url: "https://cc-api.pipellm.ai", token_field: DEFAULT_TOKEN_FIELD, category: "aggregator", kind: "key" },
    Preset { id: "xiaomi-mimo", name: "小米 MiMo", base_url: "https://api.xiaomimimo.com/anthropic", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "xiaomi-mimo-token-plan-china", name: "小米 MiMo Token Plan", base_url: "https://token-plan-cn.xiaomimimo.com/anthropic", token_field: DEFAULT_TOKEN_FIELD, category: "cn_official", kind: "key" },
    Preset { id: "aws-bedrock-aksk", name: "AWS Bedrock (AKSK)", base_url: "https://bedrock-runtime.${AWS_REGION}.amazonaws.com", token_field: DEFAULT_TOKEN_FIELD, category: "cloud_provider", kind: "key" },
    Preset { id: "aws-bedrock-api-key", name: "AWS Bedrock (API Key)", base_url: "https://bedrock-runtime.${AWS_REGION}.amazonaws.com", token_field: DEFAULT_TOKEN_FIELD, category: "cloud_provider", kind: "key" },
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_55_presets_survived_the_extraction() {
        assert_eq!(PRESETS.len(), 55, "预设丢失了，回 _legacy/src-tauri/src/provider.rs 对照");
    }

    #[test]
    fn ids_are_unique() {
        let mut ids: Vec<_> = PRESETS.iter().map(|p| p.id).collect();
        ids.sort_unstable();
        let n = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), n, "预设 id 重复");
    }

    #[test]
    fn official_preset_has_no_base_url() {
        assert_eq!(find("claude-official").unwrap().base_url, "");
    }

    #[test]
    fn known_providers_present() {
        for id in ["zhipu-glm", "kimi", "deepseek", "minimax", "codex", "github-copilot"] {
            assert!(find(id).is_some(), "缺预设: {id}");
        }
    }
}
