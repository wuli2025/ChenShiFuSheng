use crate::state::AppState;
use crate::store::{now, Project, ProjectState, Store, Task};
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
use std::convert::Infallible;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/v1/health", get(health))
        .route("/v1/hall/feed", get(hall_feed))
        .route("/v1/templates", get(templates))
        .route("/v1/templates/:id", get(template_detail))
        .route("/v1/projects", get(list_projects).post(create_project))
        .route("/v1/projects/:id/tasks", post(submit_task))
        .route("/v1/projects/:id/timeline", get(timeline))
        .route("/v1/projects/:id/events", get(events_sse))
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
    Json(serde_json::json!({
        "ok": true,
        "mode": if st.embedded { "embedded" } else { "server" },
        "data_dir": gen_pipeline::data_dir(),
        "cli": cli,
    }))
}

// ---------------------------------------------------------------- hall

async fn hall_feed(State(st): State<AppState>) -> impl IntoResponse {
    let mut pubs = st.store.publications();
    pubs.sort_by(|a, b| b.plays.cmp(&a.plays));
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

async fn events_sse(
    State(st): State<AppState>,
    Path(pid): Path<String>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut rx = st.bus.subscribe();
    let stream = async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(frame) => {
                    // 只推本项目的事件
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&frame) {
                        if v["project_id"] == pid.as_str() {
                            let id = v["id"].as_u64().unwrap_or(0);
                            yield Ok(Event::default().id(id.to_string()).data(frame));
                        }
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            }
        }
    };
    Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::default())
}

// ---------------------------------------------------------------- dock

/// 隔离板块的唯一读接口：只回预设清单，**不回任何密钥**。
async fn providers() -> impl IntoResponse {
    Json(serde_json::json!({ "presets": provider_dock::PRESETS }))
}

fn ise(e: anyhow::Error) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}
