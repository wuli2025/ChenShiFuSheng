//! 生图双梯队（v11 §04）。
//!
//! - **梯队一**：codex CLI 驱动生图。并发 2–4 线，**每线独立 CODEX_HOME**，单张 300s，重试 ≤2。
//! - **梯队二**：生图模型 API 直连。梯队一不可用时**单张粒度**自动降级。
//!
//! 三原则：
//! 1. 单张降级，不整批放弃。
//! 2. 显式标记 `source: codex | api_fallback`，不静默 —— UI 上有角标，可一键重生。
//! 3. **底线不变**：两梯队都是真生图模型。两梯队全败该张即红，绝不落 SVG/占位图。

use cli_core::{CliJob, CollectSink, Engine, EnvPatch, Sandbox};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;

pub const SINGLE_IMAGE_TIMEOUT: Duration = Duration::from_secs(300);
pub const MAX_RETRY_TIER1: u32 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImageSource {
    /// 梯队一
    Codex,
    /// 梯队二（显式标记，UI 显示角标 + 可一键用 codex 重生）
    ApiFallback,
}

impl ImageSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            ImageSource::Codex => "codex",
            ImageSource::ApiFallback => "api_fallback",
        }
    }
}

/// 选路策略，来自 `contract.art.fallback`。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FallbackPolicy {
    /// 默认：codex 优先，失败降级。
    Auto,
    /// 只用 codex，失败即红。
    Off,
    /// 跳过 codex 直接走 API（例如部署环境没装 codex）。
    ApiOnly,
}

impl FallbackPolicy {
    pub fn parse(s: &str) -> Self {
        match s {
            "off" => FallbackPolicy::Off,
            "api_only" => FallbackPolicy::ApiOnly,
            _ => FallbackPolicy::Auto,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Shot {
    /// 横版场景图
    Landscape,
    /// 竖版透明立绘
    SpriteTransparent,
}

#[derive(Debug, Clone)]
pub struct ImageRequest {
    pub node_id: String,
    pub shot: Shot,
    /// 两梯队共用同一段 style_prompt —— fallback 图混入时风格不跳戏。
    pub style_prompt: String,
    pub scene_prompt: String,
    pub out_dir: PathBuf,
    /// 本条并发线的私有工作目录（内含独立 CODEX_HOME）。
    pub lane_dir: PathBuf,
}

impl ImageRequest {
    pub fn full_prompt(&self) -> String {
        let spec = match self.shot {
            Shot::Landscape => "生成一张 16:9 横版场景插画",
            Shot::SpriteTransparent => "生成一张竖版角色立绘，背景透明 PNG",
        };
        format!(
            "{spec}。\n风格要求：{}\n画面内容：{}\n输出到当前目录，文件名 {}.png",
            self.style_prompt, self.scene_prompt, self.node_id
        )
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ImageOutcome {
    pub node_id: String,
    pub source: ImageSource,
    pub path: PathBuf,
    /// 走了几次重试才成。
    pub attempts: u32,
}

#[derive(Debug, thiserror::Error)]
pub enum ImageError {
    /// 两个梯队都失败 —— 该张红。**不允许在这里静默返回 SVG。**
    #[error("节点 {node_id} 生图失败：梯队一({tier1})，梯队二({tier2})")]
    BothTiersFailed {
        node_id: String,
        tier1: String,
        tier2: String,
    },
    #[error("节点 {node_id} 生图失败（策略 off，不降级）：{reason}")]
    Tier1OnlyFailed { node_id: String, reason: String },
    #[error("未配置生图 API（梯队二），且梯队一不可用：{0}")]
    NoFallbackConfigured(String),
}

/// 梯队二的执行器抽象 —— 让测试能注入假实现，也让 API 厂商可替换。
/// 注意：这里拿到的是 dock 给的不透明 EnvPatch，**本模块不认识任何厂商名**。
pub trait ImageApi: Send + Sync {
    fn generate(&self, req: &ImageRequest, env: &EnvPatch) -> anyhow::Result<PathBuf>;
}

/// 梯队一的执行器抽象（便于测试注入失败）。
pub trait CodexShot: Send + Sync {
    fn generate(&self, req: &ImageRequest) -> anyhow::Result<PathBuf>;
}

/// 真实的梯队一实现：拉 codex CLI，让模型自己用生图工具。
/// 行为对齐画布引擎 `server.js` 的 codexShot / codexSprite。
pub struct RealCodexShot;

impl CodexShot for RealCodexShot {
    fn generate(&self, req: &ImageRequest) -> anyhow::Result<PathBuf> {
        // 每条并发线独立 lane_dir → cli-core 会在其中建私有 .cli-home 作为 CODEX_HOME
        std::fs::create_dir_all(&req.lane_dir)?;
        let job = CliJob::new(Engine::Codex, req.full_prompt(), &req.lane_dir)
            .sandbox(Sandbox::Full) // 生图要落盘，headless 无人审批
            .idle_timeout(Some(SINGLE_IMAGE_TIMEOUT));

        let rt = tokio::runtime::Handle::try_current();
        let result = match rt {
            Ok(h) => tokio::task::block_in_place(|| {
                h.block_on(cli_core::run(job, CollectSink::default()))
            })?,
            Err(_) => tokio::runtime::Runtime::new()?
                .block_on(cli_core::run(job, CollectSink::default()))?,
        };
        if !result.ok {
            anyhow::bail!(
                "codex 生图失败: {}",
                result.reason.unwrap_or_else(|| "未知原因".into())
            );
        }
        let out = req.lane_dir.join(format!("{}.png", req.node_id));
        if !out.exists() {
            anyhow::bail!("codex 报告成功但产物 {} 不存在", out.display());
        }
        let dest = req.out_dir.join(format!("{}.png", req.node_id));
        std::fs::create_dir_all(&req.out_dir)?;
        std::fs::rename(&out, &dest).or_else(|_| std::fs::copy(&out, &dest).map(|_| ()))?;
        Ok(dest)
    }
}

/// 单张图的双梯队执行。
pub fn generate_one(
    req: &ImageRequest,
    policy: FallbackPolicy,
    tier1: &dyn CodexShot,
    tier2: Option<(&dyn ImageApi, &EnvPatch)>,
) -> Result<ImageOutcome, ImageError> {
    let mut tier1_err = String::from("未尝试");

    if policy != FallbackPolicy::ApiOnly {
        for attempt in 1..=(MAX_RETRY_TIER1 + 1) {
            match tier1.generate(req) {
                Ok(path) => {
                    return Ok(ImageOutcome {
                        node_id: req.node_id.clone(),
                        source: ImageSource::Codex,
                        path,
                        attempts: attempt,
                    })
                }
                Err(e) => {
                    tier1_err = e.to_string();
                    tracing::warn!(node = %req.node_id, attempt, error = %tier1_err, "梯队一生图失败");
                }
            }
        }
    }

    // 策略 off：不降级，该张直接红。
    if policy == FallbackPolicy::Off {
        return Err(ImageError::Tier1OnlyFailed {
            node_id: req.node_id.clone(),
            reason: tier1_err,
        });
    }

    let Some((api, env)) = tier2 else {
        return Err(ImageError::NoFallbackConfigured(tier1_err));
    };

    match api.generate(req, env) {
        Ok(path) => {
            tracing::info!(node = %req.node_id, "降级至梯队二成功（已标记 api_fallback）");
            Ok(ImageOutcome {
                node_id: req.node_id.clone(),
                source: ImageSource::ApiFallback,
                path,
                attempts: MAX_RETRY_TIER1 + 2,
            })
        }
        Err(e) => Err(ImageError::BothTiersFailed {
            node_id: req.node_id.clone(),
            tier1: tier1_err,
            tier2: e.to_string(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    struct AlwaysFail;
    impl CodexShot for AlwaysFail {
        fn generate(&self, _: &ImageRequest) -> anyhow::Result<PathBuf> {
            anyhow::bail!("codex 不可用")
        }
    }
    struct CountingFail(AtomicU32);
    impl CodexShot for CountingFail {
        fn generate(&self, _: &ImageRequest) -> anyhow::Result<PathBuf> {
            self.0.fetch_add(1, Ordering::SeqCst);
            anyhow::bail!("boom")
        }
    }
    struct AlwaysOk;
    impl CodexShot for AlwaysOk {
        fn generate(&self, r: &ImageRequest) -> anyhow::Result<PathBuf> {
            Ok(r.out_dir.join(format!("{}.png", r.node_id)))
        }
    }
    struct ApiOk;
    impl ImageApi for ApiOk {
        fn generate(&self, r: &ImageRequest, _: &EnvPatch) -> anyhow::Result<PathBuf> {
            Ok(r.out_dir.join(format!("{}-api.png", r.node_id)))
        }
    }
    struct ApiFail;
    impl ImageApi for ApiFail {
        fn generate(&self, _: &ImageRequest, _: &EnvPatch) -> anyhow::Result<PathBuf> {
            anyhow::bail!("api 也挂了")
        }
    }

    fn req() -> ImageRequest {
        ImageRequest {
            node_id: "n1".into(),
            shot: Shot::Landscape,
            style_prompt: "水彩".into(),
            scene_prompt: "雨夜".into(),
            out_dir: PathBuf::from("/tmp/out"),
            lane_dir: PathBuf::from("/tmp/lane1"),
        }
    }

    #[test]
    fn tier1_success_marks_codex() {
        let o = generate_one(&req(), FallbackPolicy::Auto, &AlwaysOk, None).unwrap();
        assert_eq!(o.source, ImageSource::Codex);
        assert_eq!(o.attempts, 1);
    }

    #[test]
    fn tier1_retries_at_most_three_times() {
        let c = CountingFail(AtomicU32::new(0));
        let env = EnvPatch::default();
        let _ = generate_one(&req(), FallbackPolicy::Auto, &c, Some((&ApiOk, &env)));
        assert_eq!(c.0.load(Ordering::SeqCst), MAX_RETRY_TIER1 + 1);
    }

    #[test]
    fn falls_back_to_api_and_marks_it() {
        let env = EnvPatch::default();
        let o = generate_one(&req(), FallbackPolicy::Auto, &AlwaysFail, Some((&ApiOk, &env))).unwrap();
        assert_eq!(o.source, ImageSource::ApiFallback, "降级必须显式标记");
        assert!(o.path.to_string_lossy().contains("api"));
    }

    #[test]
    fn policy_off_never_falls_back() {
        let env = EnvPatch::default();
        let e = generate_one(&req(), FallbackPolicy::Off, &AlwaysFail, Some((&ApiOk, &env))).unwrap_err();
        assert!(matches!(e, ImageError::Tier1OnlyFailed { .. }));
    }

    #[test]
    fn api_only_skips_tier1() {
        let c = CountingFail(AtomicU32::new(0));
        let env = EnvPatch::default();
        let o = generate_one(&req(), FallbackPolicy::ApiOnly, &c, Some((&ApiOk, &env))).unwrap();
        assert_eq!(c.0.load(Ordering::SeqCst), 0, "api_only 不该碰 codex");
        assert_eq!(o.source, ImageSource::ApiFallback);
    }

    /// 底线：两梯队全败必须报错，**绝不返回占位图**。
    #[test]
    fn both_tiers_failed_is_a_hard_error() {
        let env = EnvPatch::default();
        let e = generate_one(&req(), FallbackPolicy::Auto, &AlwaysFail, Some((&ApiFail, &env))).unwrap_err();
        match e {
            ImageError::BothTiersFailed { node_id, .. } => assert_eq!(node_id, "n1"),
            other => panic!("应为 BothTiersFailed，实为 {other:?}"),
        }
    }

    #[test]
    fn no_fallback_configured_is_an_error_not_a_placeholder() {
        let e = generate_one(&req(), FallbackPolicy::Auto, &AlwaysFail, None).unwrap_err();
        assert!(matches!(e, ImageError::NoFallbackConfigured(_)));
    }

    #[test]
    fn both_tiers_share_style_prompt() {
        let r = req();
        assert!(r.full_prompt().contains("水彩"), "两梯队共用 style_prompt");
    }

    #[test]
    fn sprite_prompt_requests_transparency() {
        let mut r = req();
        r.shot = Shot::SpriteTransparent;
        assert!(r.full_prompt().contains("透明"));
    }
}
