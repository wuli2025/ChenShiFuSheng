//! 五种任务的执行体。
//!
//! 生图任务是全项目最讲究的一段：双梯队 + 单张粒度降级 + 显式 source 标记。

use cli_core::{CliJob, CollectSink, Engine, EnvPatch, Sandbox};
use gen_pipeline::checks::{self, ArtAudit};
use gen_pipeline::image::{self, FallbackPolicy, ImageRequest, ImageSource, RealCodexShot, Shot};
use gen_pipeline::script::Script;
use gen_pipeline::{prompts, Contract, TaskKind};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

// ---------------------------------------------------------------- 共享存储
// worker 与 api 在单机模式下读写同一份 db.json。云端换 PG，接口不变。

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub kind: TaskKind,
    pub state: String,
    pub retry: u32,
    pub payload: serde_json::Value,
    pub error: Option<String>,
    pub lease_worker: Option<String>,
    pub lease_at: Option<i64>,
}

#[derive(Default, Serialize, Deserialize)]
struct Db {
    projects: serde_json::Value,
    events: Vec<serde_json::Value>,
    tasks: Vec<Task>,
    publications: Vec<serde_json::Value>,
    next_event_id: u64,
}

pub struct SharedStore {
    path: PathBuf,
    lock: RwLock<()>,
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

impl SharedStore {
    pub fn open(dir: &Path) -> anyhow::Result<Self> {
        std::fs::create_dir_all(dir)?;
        Ok(Self {
            path: dir.join("db.json"),
            lock: RwLock::new(()),
        })
    }

    fn read(&self) -> Db {
        std::fs::read_to_string(&self.path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    fn write(&self, db: &Db) {
        let tmp = self.path.with_extension("json.tmp");
        if let Ok(v) = serde_json::to_vec_pretty(db) {
            if std::fs::write(&tmp, v).is_ok() {
                let _ = std::fs::rename(&tmp, &self.path);
            }
        }
    }

    pub fn claim_task(&self, worker_id: &str) -> Option<Task> {
        let _g = self.lock.write().unwrap();
        let mut db = self.read();
        let t = db.tasks.iter_mut().find(|t| t.state == "queued")?;
        t.state = "running".into();
        t.lease_worker = Some(worker_id.into());
        t.lease_at = Some(now());
        let out = t.clone();
        self.write(&db);
        Some(out)
    }

    pub fn finish_task(&self, id: &str, ok: bool, error: Option<String>) {
        let _g = self.lock.write().unwrap();
        let mut db = self.read();
        if let Some(t) = db.tasks.iter_mut().find(|t| t.id == id) {
            t.state = if ok { "done".into() } else { "failed".into() };
            t.error = error;
            t.lease_worker = None;
            t.lease_at = None;
        }
        self.write(&db);
    }

    /// worker 完成直接写时间线 —— 不依赖前端在线。
    pub fn append_event(&self, project_id: &str, kind: &str, payload: serde_json::Value) {
        let _g = self.lock.write().unwrap();
        let mut db = self.read();
        db.next_event_id += 1;
        db.events.push(serde_json::json!({
            "id": db.next_event_id,
            "project_id": project_id,
            "kind": kind,
            "payload": payload,
            "created_at": now(),
        }));
        self.write(&db);
    }

    pub fn template_of(&self, project_id: &str) -> Option<Contract> {
        let db = self.read();
        let tid = db.projects.get(project_id)?.get("template_id")?.as_str()?;
        gen_pipeline::template::builtin()
            .into_iter()
            .find(|t| t.id == tid)
    }
}

// ---------------------------------------------------------------- 任务分发

pub async fn run_task(task: &Task, store: &SharedStore, dry: bool) -> anyhow::Result<serde_json::Value> {
    let contract = store
        .template_of(&task.project_id)
        .or_else(|| {
            task.payload
                .get("template_id")
                .and_then(|v| v.as_str())
                .and_then(|id| {
                    gen_pipeline::template::builtin().into_iter().find(|t| t.id == id)
                })
        })
        .ok_or_else(|| anyhow::anyhow!("项目 {} 找不到模板契约", task.project_id))?;

    match task.kind {
        TaskKind::Script => write_script(task, &contract, dry).await,
        TaskKind::Revise => revise_node(task, &contract, dry).await,
        TaskKind::Fx => write_fx(task, &contract, dry).await,
        TaskKind::Image => batch_images(task, &contract, store, dry).await,
        TaskKind::Compile => compile(task, &contract, store).await,
    }
}

/// 通用：跑一次 CLI 拿文本。prompt 走 stdin（cli-core 保证）。
async fn cli_text(engine: Engine, prompt: String, cwd: PathBuf, dry: bool) -> anyhow::Result<String> {
    if dry {
        return Ok(String::from("{}"));
    }
    std::fs::create_dir_all(&cwd)?;
    // env_patch 来自 dock —— 这里传空表示用 CLI 自身登录态（官方档）。
    let job = CliJob::new(engine, prompt, cwd)
        .sandbox(Sandbox::Full)
        .env_patch(EnvPatch::default())
        .idle_timeout(Some(std::time::Duration::from_secs(600)));
    let r = cli_core::run(job, CollectSink::default()).await?;
    if !r.ok {
        anyhow::bail!("{} 失败: {}", engine.as_str(), r.reason.unwrap_or_default());
    }
    Ok(r.text)
}

/// S2 写剧本。长任务，不自动重试（失败交人工）。
async fn write_script(task: &Task, c: &Contract, dry: bool) -> anyhow::Result<serde_json::Value> {
    let topic = task
        .payload
        .get("topic")
        .and_then(|v| v.as_str())
        .unwrap_or("未命名人生");
    let prompt = prompts::render(prompts::WRITE_SCRIPT, c, &[("topic", topic)]);
    let dir = gen_pipeline::project_dir(&task.project_id);
    let text = cli_text(Engine::Claude, prompt, dir.clone(), dry).await?;

    if !dry {
        // 唯一真源落盘：script.md（内含 JSON）
        std::fs::write(dir.join("script.md"), &text)?;
    }
    Ok(serde_json::json!({"bytes": text.len(), "path": dir.join("script.md")}))
}

async fn revise_node(task: &Task, c: &Contract, dry: bool) -> anyhow::Result<serde_json::Value> {
    let node = task.payload.get("node").cloned().unwrap_or_default().to_string();
    let ins = task
        .payload
        .get("instruction")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let prompt = prompts::render(prompts::REVISE_NODE, c, &[("node_json", &node), ("instruction", ins)]);
    let text = cli_text(Engine::Claude, prompt, gen_pipeline::project_dir(&task.project_id), dry).await?;
    // 产出 diff 卡，由前端确认后才落 script.md
    Ok(serde_json::json!({"diff": text}))
}

async fn write_fx(task: &Task, c: &Contract, dry: bool) -> anyhow::Result<serde_json::Value> {
    let node = task.payload.get("node").cloned().unwrap_or_default().to_string();
    let prompt = prompts::render(prompts::WRITE_FX, c, &[("node_json", &node)]);
    let text = cli_text(Engine::Claude, prompt, gen_pipeline::project_dir(&task.project_id), dry).await?;
    // AI 写的「演出:」行与编辑器手点写的是同一份数据。
    let lines: Vec<&str> = text.lines().filter(|l| l.trim_start().starts_with("演出:")).collect();
    Ok(serde_json::json!({"fx": lines}))
}

/// S4 批量生图 —— 双梯队。**每条并发线独立 lane_dir（内含独立 CODEX_HOME）。**
async fn batch_images(
    task: &Task,
    c: &Contract,
    store: &SharedStore,
    dry: bool,
) -> anyhow::Result<serde_json::Value> {
    let nodes: Vec<serde_json::Value> = task
        .payload
        .get("nodes")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if nodes.is_empty() {
        anyhow::bail!("生图任务没有节点列表");
    }

    let policy = FallbackPolicy::parse(&c.art.fallback);
    let out_dir = gen_pipeline::assets_dir().join(&task.project_id);
    std::fs::create_dir_all(&out_dir)?;

    let mut outcomes = Vec::new();
    let mut failures = Vec::new();

    for (i, node) in nodes.iter().enumerate() {
        let node_id = node.get("id").and_then(|v| v.as_str()).unwrap_or("n").to_string();
        let scene = node.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let shot = if node.get("sprite").and_then(|v| v.as_bool()).unwrap_or(false) {
            Shot::SpriteTransparent
        } else {
            Shot::Landscape
        };
        let req = ImageRequest {
            node_id: node_id.clone(),
            shot,
            style_prompt: c.art.style_prompt.clone(),
            scene_prompt: scene,
            out_dir: out_dir.clone(),
            lane_dir: gen_pipeline::lane_dir(&task.project_id, i % c.art.concurrency),
        };

        if dry {
            outcomes.push(serde_json::json!({"node_id": node_id, "source": "codex", "dry": true}));
            continue;
        }

        // 梯队二：从 dock 拿不透明 EnvPatch。worker 不认识任何厂商名。
        let fallback_env = image_fallback_env();
        let api: Option<Box<dyn image::ImageApi>> = fallback_env.as_ref().map(|_| {
            Box::new(HttpImageApi) as Box<dyn image::ImageApi>
        });
        let tier2 = match (api.as_deref(), fallback_env.as_ref()) {
            (Some(a), Some(e)) => Some((a, e)),
            _ => None,
        };

        match image::generate_one(&req, policy, &RealCodexShot, tier2) {
            Ok(o) => {
                // 显式标记 source，UI 上有角标，可一键用 codex 重生。
                store.append_event(
                    &task.project_id,
                    "image.done",
                    serde_json::json!({"node_id": o.node_id, "source": o.source.as_str(), "attempts": o.attempts}),
                );
                if o.source == ImageSource::ApiFallback {
                    tracing::warn!(node = %o.node_id, "该图走了梯队二，已标记 api_fallback");
                }
                outcomes.push(serde_json::json!({"node_id": o.node_id, "source": o.source.as_str()}));
            }
            Err(e) => {
                // 单张失败不整批放弃；但**绝不落 SVG/占位图**。
                store.append_event(
                    &task.project_id,
                    "image.failed",
                    serde_json::json!({"node_id": node_id, "error": e.to_string()}),
                );
                failures.push(serde_json::json!({"node_id": node_id, "error": e.to_string()}));
            }
        }
    }

    if !failures.is_empty() && outcomes.is_empty() {
        anyhow::bail!("全部 {} 张图生成失败，禁止降级为占位图", failures.len());
    }
    Ok(serde_json::json!({"ok": outcomes, "failed": failures}))
}

/// 梯队二的 env：从 dock 取。这里读环境是因为 worker 容器由 api 注入。
fn image_fallback_env() -> Option<EnvPatch> {
    let base = std::env::var("IMAGE_API_BASE_URL").ok()?;
    let key = std::env::var("IMAGE_API_KEY").ok()?;
    let model = std::env::var("IMAGE_API_MODEL").unwrap_or_else(|_| "default".into());
    let mut m = std::collections::HashMap::new();
    m.insert("IMAGE_API_BASE_URL".into(), base);
    m.insert("IMAGE_API_KEY".into(), key);
    m.insert("IMAGE_API_MODEL".into(), model);
    Some(EnvPatch(m))
}

/// 梯队二实现：真生图模型 API 直连。**不是占位图生成器。**
struct HttpImageApi;

impl image::ImageApi for HttpImageApi {
    fn generate(&self, req: &ImageRequest, env: &EnvPatch) -> anyhow::Result<PathBuf> {
        let base = env.get("IMAGE_API_BASE_URL").ok_or_else(|| anyhow::anyhow!("缺 base_url"))?;
        let key = env.get("IMAGE_API_KEY").ok_or_else(|| anyhow::anyhow!("缺 api_key"))?;
        let model = env.get("IMAGE_API_MODEL").unwrap_or("default");

        let body = serde_json::json!({
            "model": model,
            "prompt": req.full_prompt(),   // 与梯队一共用 style_prompt，风格不跳戏
            "n": 1,
        });
        let client = reqwest::blocking::Client::builder()
            .timeout(image::SINGLE_IMAGE_TIMEOUT)
            .build()?;
        let resp = client
            .post(format!("{base}/v1/images/generations"))
            .bearer_auth(key)
            .json(&body)
            .send()?;
        if !resp.status().is_success() {
            anyhow::bail!("生图 API 返回 {}", resp.status());
        }
        let v: serde_json::Value = resp.json()?;
        let b64 = v.pointer("/data/0/b64_json")
            .and_then(|x| x.as_str())
            .ok_or_else(|| anyhow::anyhow!("生图 API 响应缺 b64_json"))?;
        let bytes = base64_decode(b64)?;
        let dest = req.out_dir.join(format!("{}.png", req.node_id));
        std::fs::write(&dest, bytes)?;
        Ok(dest)
    }
}

fn base64_decode(s: &str) -> anyhow::Result<Vec<u8>> {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut rev = [255u8; 256];
    for (i, c) in T.iter().enumerate() {
        rev[*c as usize] = i as u8;
    }
    let mut out = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0u32;
    for c in s.bytes() {
        if c == b'=' || c == b'\n' || c == b'\r' {
            continue;
        }
        let v = rev[c as usize];
        if v == 255 {
            anyhow::bail!("非法 base64 字符");
        }
        buf = (buf << 6) | v as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Ok(out)
}

/// S5 编译 + 跑 contract.checks。**任何一条不过，产物不进大厅。**
async fn compile(task: &Task, c: &Contract, store: &SharedStore) -> anyhow::Result<serde_json::Value> {
    let dir = gen_pipeline::project_dir(&task.project_id);
    let raw = std::fs::read_to_string(dir.join("script.md"))
        .map_err(|e| anyhow::anyhow!("读不到 script.md: {e}"))?;
    let script = Script::from_json(&raw)?;

    // 插画来源审计：source 只认 codex / api_fallback。
    let art = ArtAudit {
        sources: task
            .payload
            .get("art_sources")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
            .unwrap_or_default(),
    };

    let report = checks::run(&script, c, &art);
    store.append_event(
        &task.project_id,
        "compile.checked",
        serde_json::to_value(&report)?,
    );

    if !report.passed() {
        let fails: Vec<String> = report
            .failures()
            .iter()
            .map(|f| format!("{}: {}", f.name, f.detail))
            .collect();
        anyhow::bail!("校验未通过（产物不进大厅）:\n  - {}", fails.join("\n  - "));
    }

    // 编译成单文件 HTML：调 engine-runtime（worker 容器内置 node，保产物一致）。
    let out = gen_pipeline::builds_dir().join(format!("{}.html", task.project_id));
    std::fs::create_dir_all(out.parent().unwrap())?;
    let compiler = std::env::var("CHENSHI_COMPILER")
        .unwrap_or_else(|_| "../frontend/packages/engine-runtime/compile.mjs".into());
    let status = std::process::Command::new("node")
        .arg(&compiler)
        .arg(dir.join("script.md"))
        .arg(&out)
        .status();
    match status {
        Ok(s) if s.success() => {}
        _ => anyhow::bail!("编译器执行失败: node {compiler}"),
    }
    Ok(serde_json::json!({"html": out, "checks": report.results.len()}))
}
