//! 错误码表 —— **前后端共享的唯一真源**（PRD §06 错误治理）。
//!
//! 规则：用户可见的错误必须带「发生了什么 / 为什么 / 怎么办」三段。
//! 只甩一句 stack trace 或 `HTTP 500` 是不合格的。
//!
//! 前端通过 `errcodes.json`（由 `cargo run -p gen-pipeline --example dump_errcodes` 生成）
//! 拿到同一份表，所以两端的文案不会漂移。

use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize)]
pub struct ErrCode {
    /// E-CLI-01 这样的稳定标识，可搜索、可上报、可写进工单。
    pub code: &'static str,
    /// 发生了什么（一句话，用户能懂）。
    pub what: &'static str,
    /// 为什么（技术原因，愿意看的人可以看）。
    pub why: &'static str,
    /// 怎么办（**必须是可执行的动作**，不是"请重试"）。
    pub how: &'static str,
    /// 用户自己能解决吗？false = 需要运维/作者介入。
    pub self_serve: bool,
}

macro_rules! codes {
    ($($id:ident => $code:literal, $what:literal, $why:literal, $how:literal, $ss:literal;)*) => {
        $(pub const $id: ErrCode = ErrCode {
            code: $code, what: $what, why: $why, how: $how, self_serve: $ss,
        };)*
        pub const ALL: &[ErrCode] = &[$($id),*];
    };
}

codes! {
    // ---- E-CLI-xx：cli-core 拉起 CLI 的问题
    CLI_NOT_FOUND => "E-CLI-01",
        "找不到 AI 命令行工具",
        "PATH 里没有 claude 或 codex 可执行文件。",
        "安装后重启服务：npm i -g @anthropic-ai/claude-code @openai/codex",
        true;
    CLI_NOT_LOGGED_IN => "E-CLI-02",
        "AI 命令行工具未登录",
        "CLI 能找到，但没有有效的登录态或 API key。",
        "在终端跑 claude /login；或在「设置 → API 供应商坞」里配一个 key。",
        true;
    CLI_IDLE_TIMEOUT => "E-CLI-03",
        "任务卡住了",
        "CLI 进程在超时窗口内没有任何输出，已终止并回收进程树。",
        "重试该任务。若反复发生，把任务拆小，或提高 CHENSHI_IDLE_TIMEOUT。",
        true;
    CLI_OUTPUT_LIMIT => "E-CLI-04",
        "任务输出过大",
        "单次输出超过上限，已中止，防止刷爆磁盘。",
        "缩小任务范围（例如一次改一个节点，而不是整本剧本）。",
        true;
    CLI_CANCELLED => "E-CLI-05",
        "任务被取消",
        "服务关停或用户取消，进程树已回收。",
        "任务已退回队列，服务恢复后会自动重跑，不需要你做什么。",
        true;
    CLI_QUOTA => "E-CLI-06",
        "AI 服务额度用尽",
        "上游供应商返回额度耗尽。",
        "等待额度重置，或在「设置 → API 供应商坞」换一个供应商。",
        true;

    // ---- E-GEN-xx：gen-pipeline 生产任务的问题
    GEN_CHECKS_FAILED => "E-GEN-01",
        "剧本没通过质量校验",
        "契约里的一票否决项有未通过的（节点数 / 结局数 / 时长 / 可达性…）。",
        "看时间线里 compile.checked 的明细，让 AI 补写，或换一个门槛更低的模板。",
        true;
    GEN_IMAGE_BOTH_TIERS => "E-GEN-02",
        "这张插画两条路都失败了",
        "codex CLI 生图失败，降级到生图 API 也失败。按底线，绝不用 SVG 占位图顶替。",
        "检查 codex 登录态与网络；或在「设置」里配置生图 API 作为梯队二，然后单张重生。",
        true;
    GEN_IMAGE_NO_FALLBACK => "E-GEN-03",
        "插画生成失败，且没有备用通道",
        "codex 不可用，而生图 API（梯队二）没有配置。",
        "在「设置 → 生图双梯队」里配置生图 API，或修好 codex 后重试。",
        true;
    GEN_SCRIPT_MISSING => "E-GEN-04",
        "找不到剧本",
        "编译时读不到 script.md —— 写剧本那一步可能没成功。",
        "回到 S2 重新生成剧本，确认时间线上有 task.done。",
        true;
    GEN_DANGLING_REF => "E-GEN-05",
        "剧本里有走不通的选项",
        "某些选项指向不存在的节点，玩家点了会卡死。",
        "在编辑器图谱里找到红色节点修正跳转，或让 AI 重写这几个节点。",
        true;

    // ---- E-PUB-xx：发布链的问题
    PUB_CHECKS_NOT_PASSED => "E-PUB-01",
        "校验没过，不能发布",
        "产物必须先通过模板契约的全部检查才允许进大厅。",
        "先修复校验失败项，再点发布。",
        true;
    PUB_EXTERNAL_LINK => "E-PUB-02",
        "产物里有外链，不能发布",
        "单文件游戏必须完全自包含，离线可玩。检出了 http(s) 外部引用。",
        "重新编译；若是自定义素材，确认它被内联成 base64 而不是外链。",
        false;
    PUB_TOO_LARGE => "E-PUB-03",
        "产物体积超限",
        "单文件 HTML 超过 8MB 上限，加载会很慢。",
        "压缩插画（用 jpg/webp 而不是 png），或减少内联图数量。",
        true;
    PUB_QUOTA => "E-PUB-04",
        "并发任务数已达上限",
        "每个项目同时只跑 1 个重任务，每个用户跨项目共 4 个。",
        "等当前任务跑完；任务已排队，不会丢。",
        true;
}

pub fn find(code: &str) -> Option<&'static ErrCode> {
    ALL.iter().find(|e| e.code == code)
}

/// 把 anyhow 错误映射成错误码。**新增映射时同步加测试。**
pub fn classify(err: &str) -> &'static ErrCode {
    let e = err.to_lowercase();
    if e.contains("not logged in") || e.contains("please run /login") {
        &CLI_NOT_LOGGED_IN
    } else if e.contains("usage limit") || e.contains("额度") || e.contains("quota") {
        &CLI_QUOTA
    } else if e.contains("找不到") && (e.contains("claude") || e.contains("codex")) {
        &CLI_NOT_FOUND
    } else if e.contains("空闲超时") {
        &CLI_IDLE_TIMEOUT
    } else if e.contains("输出超过上限") {
        &CLI_OUTPUT_LIMIT
    } else if e.contains("取消") {
        &CLI_CANCELLED
    // 顺序要紧：「未配置生图 API（梯队二），且梯队一不可用」两个关键词都含，
    // 必须先判它，否则会被 BOTH_TIERS 抢走。
    } else if e.contains("未配置生图 api") {
        &GEN_IMAGE_NO_FALLBACK
    } else if e.contains("梯队一") && e.contains("梯队二") {
        &GEN_IMAGE_BOTH_TIERS
    } else if e.contains("读不到 script.md") {
        &GEN_SCRIPT_MISSING
    } else if e.contains("悬空引用") {
        &GEN_DANGLING_REF
    } else if e.contains("校验未通过") {
        &GEN_CHECKS_FAILED
    } else if e.contains("外链") {
        &PUB_EXTERNAL_LINK
    } else {
        &GEN_CHECKS_FAILED
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_are_unique_and_well_formed() {
        let mut seen = std::collections::HashSet::new();
        for e in ALL {
            assert!(seen.insert(e.code), "重复错误码 {}", e.code);
            assert!(
                e.code.starts_with("E-CLI-") || e.code.starts_with("E-GEN-") || e.code.starts_with("E-PUB-"),
                "错误码前缀不合规: {}", e.code
            );
        }
    }

    /// PRD 硬要求：用户可见错误必须带「怎么办」，且不能是空话。
    #[test]
    fn every_code_tells_the_user_what_to_do() {
        for e in ALL {
            assert!(!e.what.is_empty() && !e.why.is_empty() && !e.how.is_empty(), "{} 三段不全", e.code);
            assert!(
                !e.how.contains("请重试") && !e.how.contains("稍后再试"),
                "{} 的「怎么办」是空话: {}", e.code, e.how
            );
        }
    }

    /// 真实错误串 → 错误码。这些字符串来自实际跑出来的日志。
    #[test]
    fn classify_real_world_errors() {
        assert_eq!(classify("claude 失败: Not logged in · Please run /login").code, "E-CLI-02");
        assert_eq!(classify("codex 失败: You've hit your usage limit.").code, "E-CLI-06");
        assert_eq!(classify("找不到 codex 可执行文件；请确认已安装并在 PATH 中").code, "E-CLI-01");
        assert_eq!(
            classify("节点 n1 生图失败：梯队一(codex 不可用)，梯队二(api 也挂了)").code,
            "E-GEN-02"
        );
        assert_eq!(classify("未配置生图 API（梯队二），且梯队一不可用：xxx").code, "E-GEN-03");
        assert_eq!(classify("读不到 script.md: No such file").code, "E-GEN-04");
        assert_eq!(classify("产物含外链请求").code, "E-PUB-02");
    }
}
