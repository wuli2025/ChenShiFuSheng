//! gen-pipeline —— 生产流水线。五种任务 × 模板契约。
//!
//! S1 立项 → S2 写剧本 → S3 图谱定稿 → S4 生产素材 → S5 编译发布。
//! 每种任务的 prompt 由「模板 prompts + contract 注入」拼装，
//! 校验由 `contract.checks` 驱动 —— 规则是数据，不是代码。

pub mod checks;
pub mod errcode;
pub mod image;
pub mod prompts;
pub mod script;
pub mod template;

use serde::{Deserialize, Serialize};

pub use checks::{ArtAudit, CheckResult, Report};
pub use errcode::ErrCode;
pub use image::{FallbackPolicy, ImageOutcome, ImageSource};
pub use script::Script;
pub use template::Contract;

/// 五种任务。重任务 = script / image / compile；轻任务 = revise / fx。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskKind {
    /// S2 写剧本。长任务，断点续写，**不自动重试**（失败交人工）。
    Script,
    /// 改节点，产出 diff 卡。
    Revise,
    /// 批量生图。双梯队，单张重试 ≤2。
    Image,
    /// 写「演出:」行。AI 与编辑器同权。
    Fx,
    /// 编译单文件 HTML + 跑 contract.checks。
    Compile,
}

impl TaskKind {
    /// 重任务受「每项目并发 1」限制。
    pub fn is_heavy(&self) -> bool {
        matches!(self, TaskKind::Script | TaskKind::Image | TaskKind::Compile)
    }

    /// 重试策略随任务类型定 —— cli-core 自身不做任何自动 retry。
    pub fn max_retry(&self) -> u32 {
        match self {
            TaskKind::Image => image::MAX_RETRY_TIER1,
            TaskKind::Script => 0, // 长任务失败交人工，别烧钱
            _ => 1,
        }
    }
}

/// 配额（v7 继承）：每项目 1 重任务 + N 轻任务；每用户跨项目总并发 4。
#[derive(Debug, Clone, Copy)]
pub struct Quota {
    pub per_project_heavy: usize,
    pub per_project_light: usize,
    pub per_user_total: usize,
}

impl Default for Quota {
    fn default() -> Self {
        Self {
            per_project_heavy: 1,
            per_project_light: 4,
            per_user_total: 4,
        }
    }
}

impl Quota {
    /// 从 env 读，允许运维调。
    pub fn from_env() -> Self {
        let g = |k: &str, d: usize| {
            std::env::var(k)
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(d)
        };
        Self {
            per_project_heavy: g("CHENSHI_QUOTA_PROJECT_HEAVY", 1),
            per_project_light: g("CHENSHI_QUOTA_PROJECT_LIGHT", 4),
            per_user_total: g("CHENSHI_QUOTA_USER_TOTAL", 4),
        }
    }

    pub fn admits(
        &self,
        kind: TaskKind,
        project_heavy_running: usize,
        project_light_running: usize,
        user_total_running: usize,
    ) -> bool {
        if user_total_running >= self.per_user_total {
            return false;
        }
        if kind.is_heavy() {
            project_heavy_running < self.per_project_heavy
        } else {
            project_light_running < self.per_project_light
        }
    }
}

/// 数据目录。两端同一路径约定；env `CHENSHI_DATA_DIR` 可改。
/// **网页端不提供目标文件夹选择** —— 直接用这个，零询问。
pub fn data_dir() -> std::path::PathBuf {
    std::env::var("CHENSHI_DATA_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            if cfg!(windows) {
                std::path::PathBuf::from(r"D:\chenshi-data")
            } else {
                std::path::PathBuf::from("/data/chenshi")
            }
        })
}

pub fn project_dir(project_id: &str) -> std::path::PathBuf {
    data_dir().join("projects").join(project_id)
}
pub fn builds_dir() -> std::path::PathBuf {
    data_dir().join("builds")
}
pub fn assets_dir() -> std::path::PathBuf {
    data_dir().join("assets")
}
/// 第 n 条并发生图线的私有目录（内含独立 CODEX_HOME）。
pub fn lane_dir(project_id: &str, lane: usize) -> std::path::PathBuf {
    project_dir(project_id).join(format!("lane-w{}", lane + 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heavy_tasks_are_serialized_per_project() {
        let q = Quota::default();
        assert!(q.admits(TaskKind::Script, 0, 0, 0));
        assert!(!q.admits(TaskKind::Script, 1, 0, 1), "每项目只许 1 个重任务");
        assert!(q.admits(TaskKind::Revise, 1, 0, 1), "轻任务不受重任务阻塞");
    }

    #[test]
    fn user_total_cap_wins() {
        let q = Quota::default();
        assert!(!q.admits(TaskKind::Revise, 0, 0, 4));
    }

    #[test]
    fn script_task_never_auto_retries() {
        assert_eq!(TaskKind::Script.max_retry(), 0);
        assert_eq!(TaskKind::Image.max_retry(), 2);
    }

    #[test]
    fn lanes_are_isolated() {
        assert_ne!(lane_dir("p", 0), lane_dir("p", 1));
        assert!(lane_dir("p", 0).ends_with("lane-w1"));
    }
}
