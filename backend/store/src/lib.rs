//! 存储抽象 —— 「一个后端两种投放」的支点。
//!
//! 同一份业务逻辑，云端跑 PG，桌面跑 embedded。业务代码里**一行 if(桌面) 都没有**。
//!
//! 本次实装 `EmbeddedStore`（JSON 文件 + 原子写），云端 `PgStore` 按同 trait 补齐即可。

use gen_pipeline::{Contract, TaskKind};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProjectState {
    Draft,
    Working,
    Published,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub owner_id: String,
    pub title: String,
    pub template_id: String,
    pub state: ProjectState,
    pub created_at: i64,
}

/// 一切事件先写这张表，再广播。SSE 只是显示器。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineEvent {
    /// 单调递增，作为 Last-Event-ID。
    pub id: u64,
    pub project_id: String,
    pub kind: String,
    pub payload: serde_json::Value,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub kind: TaskKind,
    /// queued | running | done | failed
    pub state: String,
    pub retry: u32,
    pub payload: serde_json::Value,
    pub error: Option<String>,
    /// 租约：worker 崩溃后由 api 扫描回收孤儿。
    pub lease_worker: Option<String>,
    pub lease_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Publication {
    pub game_id: String,
    pub project_id: String,
    pub title: String,
    pub cover_url: String,
    pub html_url: String,
    pub endings: usize,
    pub playtime_sec: u32,
    pub plays: u64,
    pub featured: bool,
}

/// api 依赖的存储能力。**不含 claim/finish** —— 领取与结算任务是 worker 的职责，
/// api 二进制不该携带这个能力。云端换 PgStore 时实现同一 trait。
pub trait Store: Send + Sync {
    fn create_project(&self, p: Project) -> anyhow::Result<()>;
    fn get_project(&self, id: &str) -> Option<Project>;
    fn list_projects(&self, owner: &str) -> Vec<Project>;

    /// 先写库、返回自增 id，调用方再广播。
    fn append_event(&self, project_id: &str, kind: &str, payload: serde_json::Value) -> u64;
    /// `Last-Event-ID` 断线补拉。
    fn events_after(&self, project_id: &str, after: u64) -> Vec<TimelineEvent>;

    fn enqueue(&self, t: Task) -> anyhow::Result<()>;
    fn running_counts(&self, project_id: &str, owner: &str) -> (usize, usize, usize);
    /// 回收租约超时的孤儿任务（worker 崩溃）。返回回收数。api 侧定时扫描。
    fn reap_orphans(&self, timeout_sec: i64) -> usize;

    fn templates(&self) -> Vec<Contract>;
    fn publications(&self) -> Vec<Publication>;
    fn publish(&self, p: Publication);

    /// 观测用：全部任务与全部事件的快照。`timeline_events` 天然就是审计日志。
    fn all_tasks(&self) -> Vec<Task>;
    fn all_events(&self) -> Vec<TimelineEvent>;
}

/// worker 侧的队列消费能力。api 不 import 它。
pub trait TaskQueue: Send + Sync {
    /// 原子领取一个 queued 任务并盖租约。
    fn claim_task(&self, worker_id: &str) -> Option<Task>;
    fn finish_task(&self, task_id: &str, ok: bool, error: Option<String>);
}

pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[derive(Default, Serialize, Deserialize)]
struct Db {
    projects: HashMap<String, Project>,
    events: Vec<TimelineEvent>,
    tasks: Vec<Task>,
    publications: Vec<Publication>,
    next_event_id: u64,
}

/// 单机存储。**api 与 worker 是两个进程，共读写同一个 `db.json`**，
/// 所以每次操作都从磁盘重读 —— 不能持内存缓存，否则 worker 看不见 api 刚入队的任务。
///
/// `RwLock` 只保证进程内互斥；跨进程靠「读-改-原子写」窗口足够小。
/// 云端换 PgStore 后不存在这个问题（事务由数据库保证）。
pub struct EmbeddedStore {
    path: PathBuf,
    /// 进程内互斥锁。锁的是「读盘→改→写盘」这个临界区，不是数据本身。
    guard: RwLock<()>,
    templates: Vec<Contract>,
}

impl EmbeddedStore {
    pub fn open(dir: impl Into<PathBuf>) -> anyhow::Result<Self> {
        let dir: PathBuf = dir.into();
        std::fs::create_dir_all(&dir)?;
        let path = dir.join("db.json");
        Ok(Self {
            path,
            guard: RwLock::new(()),
            templates: gen_pipeline::template::builtin(),
        })
    }

    /// 读快照（加读锁 + 读盘）。
    fn read_db(&self) -> Db {
        let _g = self.guard.read().unwrap();
        self.load()
    }

    /// 每次都从磁盘读 —— 跨进程可见性的代价，单机量级可以接受。
    fn load(&self) -> Db {
        std::fs::read_to_string(&self.path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    /// 原子写：tmp + rename。断电不留半个文件。
    fn flush(&self, db: &Db) {
        let tmp = self.path.with_extension("json.tmp");
        if serde_json::to_vec_pretty(db)
            .ok()
            .and_then(|v| std::fs::write(&tmp, v).ok())
            .is_some()
        {
            let _ = std::fs::rename(&tmp, &self.path);
        }
    }
}

impl Store for EmbeddedStore {
    fn create_project(&self, p: Project) -> anyhow::Result<()> {
        let _g = self.guard.write().unwrap();
        let mut db = self.load();
        db.projects.insert(p.id.clone(), p);
        self.flush(&db);
        Ok(())
    }

    fn get_project(&self, id: &str) -> Option<Project> {
        self.read_db()
            .projects.get(id).cloned()
    }

    fn list_projects(&self, owner: &str) -> Vec<Project> {
        self.read_db()
            .projects
            .values()
            .filter(|p| p.owner_id == owner)
            .cloned()
            .collect()
    }

    fn append_event(&self, project_id: &str, kind: &str, payload: serde_json::Value) -> u64 {
        let _g = self.guard.write().unwrap();
        let mut db = self.load();
        db.next_event_id += 1;
        let id = db.next_event_id;
        db.events.push(TimelineEvent {
            id,
            project_id: project_id.into(),
            kind: kind.into(),
            payload,
            created_at: now(),
        });
        self.flush(&db);
        id
    }

    fn events_after(&self, project_id: &str, after: u64) -> Vec<TimelineEvent> {
        self.read_db()
            .events
            .iter()
            .filter(|e| e.project_id == project_id && e.id > after)
            .cloned()
            .collect()
    }

    fn enqueue(&self, t: Task) -> anyhow::Result<()> {
        let _g = self.guard.write().unwrap();
        let mut db = self.load();
        db.tasks.push(t);
        self.flush(&db);
        Ok(())
    }

    fn running_counts(&self, project_id: &str, owner: &str) -> (usize, usize, usize) {
        let db = self.read_db();
        let owned: Vec<&str> = db
            .projects
            .values()
            .filter(|p| p.owner_id == owner)
            .map(|p| p.id.as_str())
            .collect();
        let running = |pred: &dyn Fn(&Task) -> bool| db.tasks.iter().filter(|t| t.state == "running" && pred(t)).count();
        let heavy = running(&|t: &Task| t.project_id == project_id && t.kind.is_heavy());
        let light = running(&|t: &Task| t.project_id == project_id && !t.kind.is_heavy());
        let user = running(&|t: &Task| owned.contains(&t.project_id.as_str()));
        (heavy, light, user)
    }

    fn reap_orphans(&self, timeout_sec: i64) -> usize {
        let _g = self.guard.write().unwrap();
        let mut db = self.load();
        let cutoff = now() - timeout_sec;
        let mut n = 0;
        for t in db.tasks.iter_mut() {
            if t.state == "running" && t.lease_at.map(|a| a < cutoff).unwrap_or(false) {
                // 租约过期 = worker 崩了。退回队列，不作废（待办卡入库超时不作废）。
                t.state = "queued".into();
                t.lease_worker = None;
                t.lease_at = None;
                t.retry += 1;
                n += 1;
            }
        }
        if n > 0 {
            self.flush(&db);
        }
        n
    }

    fn templates(&self) -> Vec<Contract> {
        self.templates.clone()
    }

    fn publications(&self) -> Vec<Publication> {
        self.read_db()
            .publications.clone()
    }

    fn publish(&self, p: Publication) {
        let _g = self.guard.write().unwrap();
        let mut db = self.load();
        db.publications.retain(|x| x.game_id != p.game_id);
        db.publications.push(p);
        self.flush(&db);
    }

    fn all_tasks(&self) -> Vec<Task> {
        self.read_db().tasks
    }

    fn all_events(&self) -> Vec<TimelineEvent> {
        self.read_db().events
    }
}

impl TaskQueue for EmbeddedStore {
    fn claim_task(&self, worker_id: &str) -> Option<Task> {
        let _g = self.guard.write().unwrap();
        let mut db = self.load();
        let t = db.tasks.iter_mut().find(|t| t.state == "queued")?;
        t.state = "running".into();
        t.lease_worker = Some(worker_id.into());
        t.lease_at = Some(now());
        let out = t.clone();
        self.flush(&db);
        Some(out)
    }

    fn finish_task(&self, task_id: &str, ok: bool, error: Option<String>) {
        let _g = self.guard.write().unwrap();
        let mut db = self.load();
        if let Some(t) = db.tasks.iter_mut().find(|t| t.id == task_id) {
            t.state = if ok { "done".into() } else { "failed".into() };
            t.error = error;
            t.lease_worker = None;
            t.lease_at = None;
        }
        self.flush(&db);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // claim/finish 在 TaskQueue trait 上

    fn tmp() -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "chenshi-store-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    fn task(id: &str, pid: &str, kind: TaskKind) -> Task {
        Task {
            id: id.into(),
            project_id: pid.into(),
            kind,
            state: "queued".into(),
            retry: 0,
            payload: serde_json::json!({}),
            error: None,
            lease_worker: None,
            lease_at: None,
        }
    }

    #[test]
    fn events_are_monotonic_and_resumable() {
        let s = EmbeddedStore::open(tmp()).unwrap();
        let a = s.append_event("p1", "task.queued", serde_json::json!({}));
        let b = s.append_event("p1", "task.running", serde_json::json!({}));
        s.append_event("p2", "noise", serde_json::json!({}));
        assert!(b > a);
        // 断线补拉：只拿 after=a 之后的，且只本项目
        let after = s.events_after("p1", a);
        assert_eq!(after.len(), 1);
        assert_eq!(after[0].kind, "task.running");
    }

    #[test]
    fn timeline_survives_restart() {
        let d = tmp();
        {
            let s = EmbeddedStore::open(&d).unwrap();
            s.append_event("p1", "e1", serde_json::json!({"x":1}));
        }
        // 模拟「关掉浏览器/重启进程」
        let s2 = EmbeddedStore::open(&d).unwrap();
        let ev = s2.events_after("p1", 0);
        assert_eq!(ev.len(), 1, "事件必须先写库，重启后还在");
        assert_eq!(ev[0].payload["x"], 1);
    }

    #[test]
    fn claim_is_exclusive() {
        let s = EmbeddedStore::open(tmp()).unwrap();
        s.enqueue(task("t1", "p1", TaskKind::Script)).unwrap();
        assert!(s.claim_task("w1").is_some());
        assert!(s.claim_task("w2").is_none(), "同一任务不能被两个 worker 领走");
    }

    #[test]
    fn orphan_tasks_return_to_queue_not_void() {
        let s = EmbeddedStore::open(tmp()).unwrap();
        s.enqueue(task("t1", "p1", TaskKind::Image)).unwrap();
        s.claim_task("w1").unwrap();
        assert_eq!(s.reap_orphans(-1), 1); // 立刻判超时
        let t = s.claim_task("w2").expect("应回到队列");
        assert_eq!(t.retry, 1, "重试计数应递增，任务不作废");
    }

    #[test]
    fn running_counts_separate_heavy_and_light() {
        let s = EmbeddedStore::open(tmp()).unwrap();
        s.create_project(Project {
            id: "p1".into(),
            owner_id: "u1".into(),
            title: "t".into(),
            template_id: "life-seven-classic".into(),
            state: ProjectState::Draft,
            created_at: now(),
        })
        .unwrap();
        s.enqueue(task("t1", "p1", TaskKind::Script)).unwrap();
        s.enqueue(task("t2", "p1", TaskKind::Revise)).unwrap();
        s.claim_task("w1");
        s.claim_task("w2");
        let (h, l, u) = s.running_counts("p1", "u1");
        assert_eq!((h, l, u), (1, 1, 2));
    }

    /// 回归：api 与 worker 是**两个进程**，各持一个 EmbeddedStore。
    /// 曾经 EmbeddedStore 持内存缓存，导致 worker 永远看不见 api 刚入队的任务。
    #[test]
    fn two_processes_see_each_others_writes() {
        let dir = tmp();
        let api = EmbeddedStore::open(&dir).unwrap();     // 进程 A
        let worker = EmbeddedStore::open(&dir).unwrap();  // 进程 B

        api.enqueue(task("t1", "p1", TaskKind::Script)).unwrap();
        let claimed = worker.claim_task("w1");
        assert!(claimed.is_some(), "worker 必须看得见 api 入队的任务");

        // 反向：worker 写的时间线，api 立刻读得到
        worker.append_event("p1", "task.done", serde_json::json!({}));
        assert_eq!(api.events_after("p1", 0).len(), 1, "api 必须看得见 worker 写的事件");

        // 且 api 看到任务已被领走
        assert!(api.claim_task("w2").is_none());
    }

    #[test]
    fn builtin_templates_are_served() {
        let s = EmbeddedStore::open(tmp()).unwrap();
        assert_eq!(s.templates().len(), 5);
    }
}
