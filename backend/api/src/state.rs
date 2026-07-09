use crate::store::{EmbeddedStore, Store};
use provider_dock::{Dock, FileStore};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<dyn Store>,
    /// dock 是隔离板块：外部只能通过它拿不透明 EnvPatch。
    pub dock: Arc<tokio::sync::Mutex<Dock<FileStore>>>,
    /// SSE fan-out。云端多实例时换成 Redis pub/sub，接口不变。
    pub bus: broadcast::Sender<String>,
    pub quota: gen_pipeline::Quota,
    pub embedded: bool,
}

impl AppState {
    pub fn new(data: &Path, embedded: bool) -> anyhow::Result<Self> {
        let store = Arc::new(EmbeddedStore::open(data)?);
        let dock_store = FileStore::open(data.join("dock"))?;
        // 云端一律隔离模式；桌面端才开放联动写 ~/.claude/settings.json。
        let dock = if embedded {
            Dock::new(dock_store).desktop()
        } else {
            Dock::new(dock_store)
        };
        let (bus, _) = broadcast::channel(1024);
        Ok(Self {
            store,
            dock: Arc::new(tokio::sync::Mutex::new(dock)),
            bus,
            quota: gen_pipeline::Quota::from_env(),
            embedded,
        })
    }

    /// 先写库、再广播 —— 顺序不可颠倒。SSE 只是显示器。
    pub fn emit(&self, project_id: &str, kind: &str, payload: serde_json::Value) -> u64 {
        let id = self.store.append_event(project_id, kind, payload.clone());
        let frame = serde_json::json!({
            "id": id, "project_id": project_id, "kind": kind, "payload": payload
        });
        let _ = self.bus.send(frame.to_string());
        id
    }
}
