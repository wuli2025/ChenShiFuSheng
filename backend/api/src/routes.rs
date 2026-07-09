use crate::state::AppState;
use crate::store::{now, Project, ProjectState, Publication, Task};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{sse::Event, IntoResponse, Sse},
    routing::{get, post},
    Json, Router,
};
use futures::stream::Stream;
use gen_pipeline::TaskKind;
use serde::Deserialize;
use std::collections::HashMap;
use std::convert::Infallible;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/v1/health", get(health))
        .route("/v1/metrics", get(metrics))
        .route("/v1/errcodes", get(errcodes))
        .route("/v1/hall/feed", get(hall_feed))
        .route("/v1/templates", get(templates))
        .route("/v1/templates/:id", get(template_detail))
        .route("/v1/projects", get(list_projects).post(create_project))
        .route("/v1/projects/:id/tasks", post(submit_task))
        .route("/v1/projects/:id/timeline", get(timeline))
        .route("/v1/projects/:id/events", get(events_sse))
        .route("/v1/projects/:id/publish", post(publish))
        // dock 路由物理独立（隔离板块）
        .route("/v1/providers", get(providers))
        .with_state(state)
}

// ---------------------------------------------------------------- health

/// 替代网页端「环境医生」：部署期 healthcheck 调它。
async fn health(State(st): State<AppState>) -> impl IntoResponse {
    let cli: Vec<_> = cli_core::selftest()
        .into_iter()
        .map(|(e, ok, detail)| serde_json::json!({"engine": e.as_str(), "ok": ok, "detail": detail}))
        .collect();
    // 生图梯队二是否就绪。dock 是隔离板块 —— 这里只问「有没有」，不问「是哪家」。
    let dock = st.dock.lock().await;
    let image_fallback_ready = dock.has_image_fallback("local");
    let link_mode = dock.link_mode_allowed();
    Json(serde_json::json!({
        "ok": true,
        "mode": if st.embedded { "embedded" } else { "server" },
        "data_dir": gen_pipeline::data_dir(),
        "cli": cli,
        "image_fallback_ready": image_fallback_ready,
        "link_mode_allowed": link_mode,
    }))
}

// ---------------------------------------------------------------- 观测

/// PRD §06 四核心看板：任务成功率 / CLI p95 时长 / 队列深度 / 生图失败率+降级率。
///
/// 数据源就是 `timeline_events` —— 它天然是审计日志，不需要另建一套埋点。
async fn metrics(State(st): State<AppState>) -> impl IntoResponse {
    let tasks = st.store.all_tasks();
    let events = st.store.all_events();

    // ① 任务成功率
    let done = tasks.iter().filter(|t| t.state == "done").count();
    let failed = tasks.iter().filter(|t| t.state == "failed").count();
    let settled = done + failed;
    let success_rate = if settled == 0 { 1.0 } else { done as f64 / settled as f64 };

    // ② CLI 时长 p95：task.running → task.done/failed 的时间差
    let mut started: HashMap<String, i64> = HashMap::new();
    let mut durations: Vec<i64> = Vec::new();
    for e in &events {
        let Some(tid) = e.payload.get("task_id").and_then(|v| v.as_str()) else { continue };
        match e.kind.as_str() {
            "task.running" => {
                started.insert(tid.to_string(), e.created_at);
            }
            "task.done" | "task.failed" => {
                if let Some(t0) = started.remove(tid) {
                    durations.push((e.created_at - t0).max(0));
                }
            }
            _ => {}
        }
    }
    durations.sort_unstable();
    let p = |q: f64| -> i64 {
        if durations.is_empty() { return 0 }
        let i = ((durations.len() as f64 - 1.0) * q).round() as usize;
        durations[i]
    };

    // ③ 队列深度
    let queued = tasks.iter().filter(|t| t.state == "queued").count();
    let running = tasks.iter().filter(|t| t.state == "running").count();

    // ④ 生图失败率 + 降级率
    let img_ok = events.iter().filter(|e| e.kind == "image.done").count();
    let img_fail = events.iter().filter(|e| e.kind == "image.failed").count();
    let img_fallback = events
        .iter()
        .filter(|e| e.kind == "image.done" && e.payload.get("source").and_then(|v| v.as_str()) == Some("api_fallback"))
        .count();
    let img_total = img_ok + img_fail;

    Json(serde_json::json!({
        "task_success_rate": round3(success_rate),
        "task_done": done, "task_failed": failed,
        "cli_duration_sec": { "p50": p(0.5), "p95": p(0.95), "max": durations.last().copied().unwrap_or(0) },
        "queue": { "queued": queued, "running": running },
        "image": {
            "total": img_total,
            "failure_rate": if img_total == 0 { 0.0 } else { round3(img_fail as f64 / img_total as f64) },
            // 降级率：走了梯队二的图占成功图的比例。持续偏高说明 codex 环境有问题。
            "fallback_rate": if img_ok == 0 { 0.0 } else { round3(img_fallback as f64 / img_ok as f64) },
        },
        // 失败任务按错误码聚合，直接看出是哪类问题在拖后腿
        "failures_by_code": failures_by_code(&events),
    }))
}

fn round3(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

fn failures_by_code(events: &[crate::store::TimelineEvent]) -> serde_json::Value {
    let mut m: HashMap<String, usize> = HashMap::new();
    for e in events.iter().filter(|e| e.kind == "task.failed") {
        let code = e
            .payload
            .get("code")
            .and_then(|v| v.as_str())
            .unwrap_or("E-UNKNOWN")
            .to_string();
        *m.entry(code).or_default() += 1;
    }
    serde_json::to_value(m).unwrap_or(serde_json::Value::Null)
}

/// 错误码表：前端拉一次，渲染「发生了什么/为什么/怎么办」三段式。
/// 前后端同一份真源，文案不会漂移。
async fn errcodes() -> impl IntoResponse {
    Json(serde_json::json!({ "items": gen_pipeline::errcode::ALL }))
}

// ---------------------------------------------------------------- hall

async fn hall_feed(State(st): State<AppState>) -> impl IntoResponse {
    let mut pubs = st.store.publications();
    pubs.sort_by_key(|p| std::cmp::Reverse(p.plays));
    Json(serde_json::json!({ "items": pubs }))
}

// ---------------------------------------------------------------- templates

async fn templates(State(st): State<AppState>) -> impl IntoResponse {
    Json(serde_json::json!({ "items": st.store.templates() }))
}

async fn template_detail(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let t = st
        .store
        .templates()
        .into_iter()
        .find(|t| t.id == id)
        .ok_or(StatusCode::NOT_FOUND)?;
    Ok(Json(serde_json::json!({
        "contract": t,
        "rationale_url": format!("/templates/{id}/rationale.md"),
    })))
}

// ---------------------------------------------------------------- projects

#[derive(Deserialize)]
struct CreateProject {
    /// 「做同款」：只填题材一句话，其余全部从契约继承。
    topic: String,
    template_id: String,
    #[serde(default = "anon")]
    owner_id: String,
}
fn anon() -> String {
    "local".into()
}

async fn create_project(
    State(st): State<AppState>,
    Json(req): Json<CreateProject>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    if !st.store.templates().iter().any(|t| t.id == req.template_id) {
        return Err((StatusCode::BAD_REQUEST, format!("未知模板 {}", req.template_id)));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let p = Project {
        id: id.clone(),
        owner_id: req.owner_id.clone(),
        title: req.topic.clone(),
        template_id: req.template_id.clone(),
        state: ProjectState::Draft,
        created_at: now(),
    };
    st.store.create_project(p).map_err(ise)?;
    st.emit(&id, "project.created", serde_json::json!({"title": req.topic}));

    // 端差策略：立项后**直接开始执行**，不弹确认、不问路径。
    let task = Task {
        id: uuid::Uuid::new_v4().to_string(),
        project_id: id.clone(),
        kind: TaskKind::Script,
        state: "queued".into(),
        retry: 0,
        payload: serde_json::json!({"topic": req.topic, "template_id": req.template_id}),
        error: None,
        lease_worker: None,
        lease_at: None,
    };
    let tid = task.id.clone();
    st.store.enqueue(task).map_err(ise)?;
    st.emit(&id, "task.queued", serde_json::json!({"task_id": tid, "kind": "script"}));

    Ok(Json(serde_json::json!({ "project_id": id, "task_id": tid })))
}

async fn list_projects(State(st): State<AppState>) -> impl IntoResponse {
    Json(serde_json::json!({ "items": st.store.list_projects("local") }))
}

#[derive(Deserialize)]
struct SubmitTask {
    kind: TaskKind,
    #[serde(default)]
    payload: serde_json::Value,
}

async fn submit_task(
    State(st): State<AppState>,
    Path(pid): Path<String>,
    Json(req): Json<SubmitTask>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let project = st
        .store
        .get_project(&pid)
        .ok_or((StatusCode::NOT_FOUND, "项目不存在".into()))?;

    let (h, l, u) = st.store.running_counts(&pid, &project.owner_id);
    if !st.quota.admits(req.kind, h, l, u) {
        // 超限进等待队列而非拒绝 —— 但要显式告知。
        st.emit(&pid, "task.throttled", serde_json::json!({"kind": req.kind}));
    }

    let task = Task {
        id: uuid::Uuid::new_v4().to_string(),
        project_id: pid.clone(),
        kind: req.kind,
        state: "queued".into(),
        retry: 0,
        payload: req.payload,
        error: None,
        lease_worker: None,
        lease_at: None,
    };
    let tid = task.id.clone();
    st.store.enqueue(task).map_err(ise)?;
    st.emit(&pid, "task.queued", serde_json::json!({"task_id": tid, "kind": req.kind}));
    Ok(Json(serde_json::json!({ "task_id": tid })))
}

// ---------------------------------------------------------------- timeline

#[derive(Deserialize)]
struct After {
    #[serde(default)]
    after: u64,
}

/// 断线补拉。前端 store 是「时间线的物化视图」，重连后状态自动收敛。
async fn timeline(
    State(st): State<AppState>,
    Path(pid): Path<String>,
    Query(q): Query<After>,
) -> impl IntoResponse {
    Json(serde_json::json!({ "events": st.store.events_after(&pid, q.after) }))
}

/// SSE 从**时间线本身**读，而不是只订阅 api 进程的内存总线。
///
/// 这是必须的：worker 是另一个进程，它 `append_event` 写库，广播不到 api 的 broadcast
/// channel。若 SSE 只听内存总线，客户端就永远看不到 worker 写的 `task.running` /
/// `task.done` —— 而那恰恰是用户最关心的事件。
///
/// 内存总线保留下来，只当作「有新事件了，别等满一个 tick」的唤醒信号（低延迟优化）；
/// **真相永远来自库**。云端多实例时把 bus 换成 Redis pub/sub，这段逻辑一行不用改。
async fn events_sse(
    State(st): State<AppState>,
    Path(pid): Path<String>,
    headers: axum::http::HeaderMap,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    // 断线重连时浏览器自动带上 Last-Event-ID，从那之后接着推。
    let mut last: u64 = headers
        .get("last-event-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let mut wake = st.bus.subscribe();
    let stream = async_stream::stream! {
        loop {
            for e in st.store.events_after(&pid, last) {
                last = e.id;
                let frame = serde_json::json!({
                    "id": e.id, "project_id": e.project_id,
                    "kind": e.kind, "payload": e.payload,
                });
                yield Ok(Event::default().id(e.id.to_string()).data(frame.to_string()));
            }
            // 等唤醒信号；最多 500ms 后自己醒来查库 —— worker 写的事件靠这条路径送达。
            let _ = tokio::time::timeout(std::time::Duration::from_millis(500), wake.recv()).await;
        }
    };
    Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::default())
}

// ---------------------------------------------------------------- publish

#[derive(Deserialize)]
struct PublishReq {
    /// 编译产出的单文件 HTML（相对 builds/ 的文件名）。
    build: String,
    cover_url: String,
    endings: usize,
    playtime_sec: u32,
    /// 编译时跑的 contract.checks 是否全过。**任何一条不过，产物不进大厅。**
    checks_passed: bool,
}

async fn publish(
    State(st): State<AppState>,
    Path(pid): Path<String>,
    Json(req): Json<PublishReq>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let project = st
        .store
        .get_project(&pid)
        .ok_or((StatusCode::NOT_FOUND, "项目不存在".into()))?;

    if !req.checks_passed {
        st.emit(&pid, "publish.rejected", serde_json::json!({"reason": "校验未通过"}));
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "校验未通过，产物不进大厅".into(),
        ));
    }
    // 静态扫描兜底：产物不得引用外链。
    let html = gen_pipeline::builds_dir().join(&req.build);
    if let Ok(content) = std::fs::read_to_string(&html) {
        if content.contains("src=\"http") || content.contains("href=\"http") {
            st.emit(&pid, "publish.rejected", serde_json::json!({"reason": "产物含外链"}));
            return Err((StatusCode::UNPROCESSABLE_ENTITY, "产物含外链请求".into()));
        }
    }

    let game_id = uuid::Uuid::new_v4().to_string();
    st.store.publish(Publication {
        game_id: game_id.clone(),
        project_id: pid.clone(),
        title: project.title.clone(),
        cover_url: req.cover_url,
        // 产物仓静态直出，玩家读流量不打 API。
        html_url: format!("/games/{}", req.build),
        endings: req.endings,
        playtime_sec: req.playtime_sec,
        plays: 0,
        featured: false,
    });
    st.emit(&pid, "published", serde_json::json!({"game_id": game_id}));
    Ok(Json(serde_json::json!({ "game_id": game_id })))
}

// ---------------------------------------------------------------- dock

/// 隔离板块的唯一读接口：只回预设清单，**不回任何密钥**。
async fn providers() -> impl IntoResponse {
    Json(serde_json::json!({ "presets": provider_dock::PRESETS }))
}

fn ise(e: anyhow::Error) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}
