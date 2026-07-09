//! chenshi-worker —— 生产 worker。消费任务队列，驱动双 CLI 完成一切 AI 生产。
//!
//! 与 api 分进程分容器：CLI 重任务崩溃/OOM 不影响 API 可用性。
//! **worker 容器内含 claude/codex CLI 与生图凭据；api 容器不含。**
//!
//! worker 完成后**直接写时间线**，不依赖任何前端在线（持久生产）。

use exec::{Store, TaskQueue};
use gen_pipeline::{checks, image, prompts, script::Script, TaskKind};
use std::time::Duration;

mod exec;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let worker_id = format!("w-{}", uuid::Uuid::new_v4().simple());
    let data = gen_pipeline::data_dir();
    tracing::info!(%worker_id, data = %data.display(), "worker 启动");

    // 启动自检：CLI 是否可用。生图梯队一不可用时会自动降级，但这里要留痕。
    for (engine, ok, detail) in cli_core::selftest() {
        if ok {
            tracing::info!(engine = engine.as_str(), %detail, "CLI 可用");
        } else {
            tracing::warn!(engine = engine.as_str(), %detail, "CLI 不可用");
        }
    }

    let store = std::sync::Arc::new(api_store(&data)?);
    let dry = std::env::var("CHENSHI_DRY_RUN").is_ok();
    if dry {
        tracing::warn!("DRY_RUN 模式：不真实调用 CLI，仅走流程与校验");
    }

    // 并发消费槽。**串行会让一个重任务把所有轻任务堵死** —— 写剧本要跑十几分钟，
    // 期间用户提交一个改节点，得等剧本写完才动，体验不可接受。
    // 每个槽独立 claim；claim 是原子的（读盘→改→原子写，进程内加锁）。
    let slots: usize = std::env::var("CHENSHI_WORKER_SLOTS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(4);
    tracing::info!(slots, "启动消费槽");

    // 关停信号。**不装这个的后果**：`kill worker` 时 SIGTERM 直接终止进程，
    // Rust 的 Drop 根本不跑，cli-core 的 ProcGuard 无从回收 —— 每个在飞的
    // CLI 进程都变成孤儿，占着 CPU 继续烧 token。实测确实会留下。
    let shutdown = std::sync::Arc::new(tokio::sync::Notify::new());
    {
        let shutdown = shutdown.clone();
        tokio::spawn(async move {
            wait_for_signal().await;
            tracing::warn!("收到关停信号，取消在飞任务并回收进程树");
            shutdown.notify_waiters();
        });
    }

    let mut handles = Vec::new();
    for slot in 0..slots {
        let store = store.clone();
        let wid = format!("{worker_id}#{slot}");
        let sd = shutdown.clone();
        handles.push(tokio::spawn(async move { consume_loop(store, wid, dry, sd).await }));
    }
    for h in handles {
        let _ = h.await;
    }
    // 给 ProcGuard 的 kill_tree 留出落地时间。
    tokio::time::sleep(Duration::from_millis(600)).await;
    tracing::info!("worker 已退出");
    Ok(())
}

#[cfg(unix)]
async fn wait_for_signal() {
    use tokio::signal::unix::{signal, SignalKind};
    let mut term = signal(SignalKind::terminate()).expect("SIGTERM");
    let mut int = signal(SignalKind::interrupt()).expect("SIGINT");
    tokio::select! {
        _ = term.recv() => {}
        _ = int.recv() => {}
    }
}

#[cfg(not(unix))]
async fn wait_for_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

async fn consume_loop(
    store: std::sync::Arc<exec::EmbeddedStore>,
    worker_id: String,
    dry: bool,
    shutdown: std::sync::Arc<tokio::sync::Notify>,
) {
    loop {
        // 关停时：正在跑的 run_task 被 select 取消 → 局部变量 drop →
        // ProcGuard::drop → kill_tree。任务留在 running 态，由 api 的孤儿租约
        // 扫描退回队列（不作废）。
        let claimed = tokio::select! {
            biased;
            _ = shutdown.notified() => return,
            t = async { store.claim_task(&worker_id) } => t,
        };
        let Some(task) = claimed else {
            tokio::select! {
                _ = shutdown.notified() => return,
                _ = tokio::time::sleep(Duration::from_millis(800)) => continue,
            }
        };

        tracing::info!(task = %task.id, kind = ?task.kind, worker = %worker_id, "领取任务");
        store.append_event(
            &task.project_id,
            "task.running",
            serde_json::json!({"task_id": task.id, "kind": task.kind}),
        );

        // 关停必须能打断正在跑的任务本身 —— 否则一个十几分钟的写剧本任务
        // 会让 worker 拖着不退，容器等到超时被 SIGKILL，进程树照样成孤儿。
        let outcome = tokio::select! {
            biased;
            _ = shutdown.notified() => {
                tracing::warn!(task = %task.id, "关停中断任务，进程树已回收；任务由孤儿租约退回队列");
                return;
            }
            r = exec::run_task(&task, &store, dry) => r,
        };

        match outcome {
            Ok(payload) => {
                store.finish_task(&task.id, true, None);
                store.append_event(
                    &task.project_id,
                    "task.done",
                    serde_json::json!({"task_id": task.id, "kind": task.kind, "result": payload}),
                );
            }
            Err(e) => {
                let msg = e.to_string();
                tracing::error!(task = %task.id, error = %msg, "任务失败");
                // 重试策略在这一层，按任务类型定 —— cli-core 自身不 retry。
                let can_retry = task.retry < task.kind.max_retry();
                store.finish_task(&task.id, false, Some(msg.clone()));
                store.append_event(
                    &task.project_id,
                    if can_retry { "task.retry" } else { "task.failed" },
                    serde_json::json!({"task_id": task.id, "error": msg}),
                );
            }
        }
    }
}

/// worker 与 api 共享同一份存储实现（`chenshi-store`）。
/// 云端换 PgStore + Redis Stream，同 trait，业务逻辑不变。
fn api_store(data: &std::path::Path) -> anyhow::Result<exec::EmbeddedStore> {
    exec::EmbeddedStore::open(data)
}

/// 让编译器确认这些模块被用到（也是给读者的索引）。
#[allow(dead_code)]
fn _typecheck() {
    let _ = TaskKind::Script.is_heavy();
    let _: fn(&str) -> anyhow::Result<Script> = |s| Script::from_json(s);
    let _ = checks::GLOBAL_FLOOR;
    let _ = image::MAX_RETRY_TIER1;
    let _ = prompts::WRITE_SCRIPT;
}
