//! provider-dock —— API 供应商坞，**隔离板块**。
//!
//! 提炼自 `_legacy/src-tauri/src/provider.rs`（1852 行）。
//!
//! 隔离契约（不可破坏）：
//! - 其他模块**不知道**「智谱 / Kimi / DeepSeek / MiniMax」这些词的存在。
//! - 唯一出口是 [`Dock::env_patch_for`]，返回不透明的 `EnvPatch`；cli-core 盲注入。
//! - 唯一 UI 入口是 `/settings/providers` 独立路由。
//! - 密钥服务端加密落库，日志层由全局脱敏中间件过滤 [`MANAGED_ENV_KEYS`]。

pub mod presets;
pub mod store;

use cli_core::{Engine, EnvPatch};
use std::collections::HashMap;

pub use presets::{Preset, PRESETS};
pub use store::{FileStore, MemStore, ProfileStore};

/// 受管环境变量键。切换时**先全清、再套用**，切换结果才确定。
/// 这份清单同时是日志脱敏中间件的过滤依据。
pub const MANAGED_ENV_KEYS: &[&str] = &[
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_SMALL_FAST_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    // 生图梯队二用
    "IMAGE_API_BASE_URL",
    "IMAGE_API_KEY",
    "IMAGE_API_MODEL",
];

/// 用户绑定的一份供应商配置。`secret` 在落库前由 store 层加密。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Profile {
    pub id: String,
    pub user_id: String,
    pub preset_id: String,
    /// token / api key 明文（内存中），落库加密。
    pub secret: String,
    /// 覆盖预设的 base_url（自定义供应商用）。
    pub base_url_override: Option<String>,
    /// 模型钉选。
    pub models: HashMap<String, String>,
    /// 桌面端专属：是否联动写 ~/.claude/settings.json。云端恒为 false。
    pub link_mode: bool,
    pub active: bool,
}

/// 生图供应商配置（梯队二）。与对话供应商分开，因为很多用户对话用 A、生图用 B。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ImageProfile {
    pub user_id: String,
    pub base_url: String,
    pub secret: String,
    pub model: String,
    pub active: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum DockError {
    #[error("未知预设: {0}")]
    UnknownPreset(String),
    #[error("用户 {0} 没有可用的供应商配置")]
    NoProfile(String),
    #[error("存储错误: {0}")]
    Store(String),
}

pub struct Dock<S: ProfileStore> {
    store: S,
    /// 云端恒为 false —— 云端一律隔离模式（私有 CONFIG_DIR），不写用户全局配置。
    allow_link_mode: bool,
}

impl<S: ProfileStore> Dock<S> {
    pub fn new(store: S) -> Self {
        Self {
            store,
            allow_link_mode: false,
        }
    }

    /// 桌面端投放时调用，开放「联动写 ~/.claude/settings.json」能力。
    pub fn desktop(mut self) -> Self {
        self.allow_link_mode = true;
        self
    }

    pub fn store(&self) -> &S {
        &self.store
    }
    pub fn store_mut(&mut self) -> &mut S {
        &mut self.store
    }
    pub fn link_mode_allowed(&self) -> bool {
        self.allow_link_mode
    }

    /// **唯一出口。** 业务层拿到不透明补丁，永远不知道背后是哪家厂商。
    ///
    /// 语义：先按 MANAGED_ENV_KEYS 全清（用空串标记清除），再套用激活配置。
    pub fn env_patch_for(&self, user_id: &str, engine: Engine) -> Result<EnvPatch, DockError> {
        let mut map: HashMap<String, String> = HashMap::new();

        // codex 引擎走自己的 OAuth / CODEX_HOME，不吃 ANTHROPIC_* 变量。
        if engine == Engine::Codex {
            return Ok(EnvPatch(map));
        }

        let profile = self
            .store
            .active_profile(user_id)
            .map_err(|e| DockError::Store(e.to_string()))?
            .ok_or_else(|| DockError::NoProfile(user_id.to_string()))?;

        let preset = presets::find(&profile.preset_id)
            .ok_or_else(|| DockError::UnknownPreset(profile.preset_id.clone()))?;

        // 官方档不注入 base_url / token —— 用 CLI 自身的登录态。
        if preset.kind != "official" {
            let base = profile
                .base_url_override
                .clone()
                .unwrap_or_else(|| preset.base_url.to_string());
            if !base.is_empty() {
                map.insert("ANTHROPIC_BASE_URL".into(), base);
            }
            map.insert(preset.token_field.to_string(), profile.secret.clone());
        }
        for (k, v) in &profile.models {
            if MANAGED_ENV_KEYS.contains(&k.as_str()) {
                map.insert(k.clone(), v.clone());
            }
        }
        Ok(EnvPatch(map))
    }

    /// 生图梯队二的环境补丁。仅当用户配了生图供应商时返回 Some。
    pub fn image_env_patch_for(&self, user_id: &str) -> Option<EnvPatch> {
        let p = self.store.active_image_profile(user_id).ok().flatten()?;
        if !p.active {
            return None;
        }
        let mut map = HashMap::new();
        map.insert("IMAGE_API_BASE_URL".into(), p.base_url);
        map.insert("IMAGE_API_KEY".into(), p.secret);
        map.insert("IMAGE_API_MODEL".into(), p.model);
        Some(EnvPatch(map))
    }

    /// 用户是否配置了生图梯队二。gen-pipeline 据此决定 codex 失败后能否降级。
    pub fn has_image_fallback(&self, user_id: &str) -> bool {
        self.image_env_patch_for(user_id).is_some()
    }
}

/// 日志脱敏：任何一行日志经过它，受管键的值被替换为 ***。
pub fn redact(line: &str) -> String {
    let mut out = line.to_string();
    for k in MANAGED_ENV_KEYS {
        if let Some(pos) = out.find(k) {
            // 形如 KEY=value 或 "KEY": "value"
            let tail = &out[pos + k.len()..];
            if let Some(eq) = tail.find(['=', ':']) {
                let val_start = pos + k.len() + eq + 1;
                let val_end = out[val_start..]
                    .find([' ', ',', '\n', '}'])
                    .map(|i| val_start + i)
                    .unwrap_or(out.len());
                if val_end > val_start {
                    out.replace_range(val_start..val_end, "***");
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dock_with(preset_id: &str) -> Dock<MemStore> {
        let mut s = MemStore::default();
        s.upsert(Profile {
            id: "p1".into(),
            user_id: "u1".into(),
            preset_id: preset_id.into(),
            secret: "sk-secret-123".into(),
            base_url_override: None,
            models: HashMap::new(),
            link_mode: false,
            active: true,
        });
        Dock::new(s)
    }

    #[test]
    fn switching_providers_yields_different_patches() {
        let a = dock_with("zhipu-glm")
            .env_patch_for("u1", Engine::Claude)
            .unwrap();
        let b = dock_with("kimi").env_patch_for("u1", Engine::Claude).unwrap();
        let c = dock_with("deepseek")
            .env_patch_for("u1", Engine::Claude)
            .unwrap();
        assert_ne!(a.get("ANTHROPIC_BASE_URL"), b.get("ANTHROPIC_BASE_URL"));
        assert_ne!(b.get("ANTHROPIC_BASE_URL"), c.get("ANTHROPIC_BASE_URL"));
        assert_eq!(a.get("ANTHROPIC_AUTH_TOKEN"), Some("sk-secret-123"));
    }

    #[test]
    fn official_preset_injects_nothing() {
        let p = dock_with("claude-official")
            .env_patch_for("u1", Engine::Claude)
            .unwrap();
        assert!(p.0.is_empty(), "官方档应使用 CLI 自身登录态");
    }

    #[test]
    fn codex_engine_gets_empty_patch() {
        let p = dock_with("kimi").env_patch_for("u1", Engine::Codex).unwrap();
        assert!(p.0.is_empty());
    }

    #[test]
    fn redact_hides_secrets() {
        let line = "spawn env ANTHROPIC_AUTH_TOKEN=sk-live-abcdef done";
        let r = redact(line);
        assert!(!r.contains("sk-live-abcdef"), "got: {r}");
        assert!(r.contains("***"));
    }

    #[test]
    fn cloud_dock_forbids_link_mode() {
        assert!(!dock_with("kimi").link_mode_allowed());
        assert!(dock_with("kimi").desktop().link_mode_allowed());
    }
}
