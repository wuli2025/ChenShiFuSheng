/* =====================================================================
 * vn_studio.rs · 灵动工坊后端 —— VN 项目 CRUD / claude·codex CLI 执行 / 素材 / 导出
 * 项目目录: ~/Polaris/data/vn_projects/<名字>/{script.md, project.js, meta.json, assets/, 备份/}
 * 设计: 前端(pipeline.ts)编排流程,本模块只做原子操作——
 *   vn_run_claude 一问一答 / vn_codex_shot 一图一存 / 文件读写带备份
 * ===================================================================== */
use directories::UserDirs;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let _ = cmd;
}

fn home() -> Result<PathBuf, String> {
    UserDirs::new()
        .map(|u| u.home_dir().to_path_buf())
        .ok_or_else(|| "无法定位用户目录".into())
}
fn vn_root() -> Result<PathBuf, String> {
    let d = home()?.join("Polaris").join("data").join("vn_projects");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}
fn safe_name(n: &str) -> bool {
    !n.is_empty()
        && n.chars().count() <= 40
        && n.chars().all(|c| {
            c.is_alphanumeric() || c == '·' || c == '-' || c == '_' || ('\u{4e00}'..='\u{9fff}').contains(&c)
        })
}
fn proj_dir(name: &str) -> Result<PathBuf, String> {
    if !safe_name(name) {
        return Err("项目名只能是中英文/数字/·/-/_,≤40字".into());
    }
    Ok(vn_root()?.join(name))
}
fn safe_file(f: &str) -> bool {
    !f.is_empty() && !f.contains("..") && !f.contains('/') && !f.contains('\\')
}

/* ---------------- base64(自带,不引 crate) ---------------- */
const B64: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
fn b64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | (b[2] as u32);
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}
fn mime_of(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        _ => "image/jpeg",
    }
}

/* ---------------- 项目 CRUD ---------------- */
#[derive(Serialize)]
pub struct VnInfo {
    pub name: String,
    pub meta: serde_json::Value,
    pub has_script: bool,
    pub has_project: bool,
    pub img_done: usize,
}

#[tauri::command]
pub fn vn_list() -> Result<Vec<VnInfo>, String> {
    let root = vn_root()?;
    let mut out = Vec::new();
    for ent in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let ent = match ent {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !ent.path().is_dir() {
            continue;
        }
        let name = ent.file_name().to_string_lossy().to_string();
        let dir = ent.path();
        let meta: serde_json::Value = fs::read_to_string(dir.join("meta.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(serde_json::json!({}));
        let img_done = fs::read_dir(dir.join("assets"))
            .map(|rd| {
                rd.filter_map(|e| e.ok())
                    .filter(|e| {
                        let n = e.file_name().to_string_lossy().to_ascii_lowercase();
                        n.ends_with(".png") || n.ends_with(".jpg") || n.ends_with(".jpeg") || n.ends_with(".webp")
                    })
                    .count()
            })
            .unwrap_or(0);
        out.push(VnInfo {
            has_script: dir.join("script.md").exists(),
            has_project: dir.join("project.js").exists(),
            img_done,
            name,
            meta,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
pub fn vn_create(name: String, intent: String) -> Result<(), String> {
    let dir = proj_dir(&name)?;
    if dir.exists() {
        return Err("项目已存在".into());
    }
    fs::create_dir_all(dir.join("assets")).map_err(|e| e.to_string())?;
    let meta = serde_json::json!({
        "name": name, "intent": intent, "mode": "vn",
        "scriptStatus": "none",
        "created": chrono_now(),
    });
    fs::write(dir.join("meta.json"), serde_json::to_string_pretty(&meta).unwrap()).map_err(|e| e.to_string())
}

fn chrono_now() -> String {
    // 不引 chrono:用系统时间粗略格式化(仅展示用)
    let d = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("@{}", d)
}

#[tauri::command]
pub fn vn_delete(name: String) -> Result<(), String> {
    let dir = proj_dir(&name)?;
    if !dir.exists() {
        return Err("项目不存在".into());
    }
    fs::remove_dir_all(dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vn_read_file(name: String, file: String) -> Result<String, String> {
    if !safe_file(&file) {
        return Err("非法文件名".into());
    }
    let p = proj_dir(&name)?.join(&file);
    fs::read_to_string(&p).map_err(|e| format!("{}: {}", file, e))
}

#[tauri::command]
pub fn vn_write_file(name: String, file: String, content: String) -> Result<String, String> {
    if !safe_file(&file) {
        return Err("非法文件名".into());
    }
    let dir = proj_dir(&name)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = dir.join(&file);
    // script.md / project.js 改前留备份(最近10份)
    if p.exists() && (file == "script.md" || file == "project.js") {
        let bdir = dir.join("备份");
        let _ = fs::create_dir_all(&bdir);
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let _ = fs::copy(&p, bdir.join(format!("{}.备份_{}", file, stamp)));
        if let Ok(rd) = fs::read_dir(&bdir) {
            let mut olds: Vec<PathBuf> = rd
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|q| q.file_name().map(|n| n.to_string_lossy().starts_with(&format!("{}.备份_", file))).unwrap_or(false))
                .collect();
            olds.sort();
            while olds.len() > 10 {
                let _ = fs::remove_file(olds.remove(0));
            }
        }
    }
    fs::write(&p, content).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn vn_update_meta(name: String, patch: serde_json::Value) -> Result<serde_json::Value, String> {
    let p = proj_dir(&name)?.join("meta.json");
    let mut meta: serde_json::Value = fs::read_to_string(&p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({}));
    if let (Some(obj), Some(po)) = (meta.as_object_mut(), patch.as_object()) {
        for (k, v) in po {
            obj.insert(k.clone(), v.clone());
        }
    }
    fs::write(&p, serde_json::to_string_pretty(&meta).unwrap()).map_err(|e| e.to_string())?;
    Ok(meta)
}

#[tauri::command]
pub fn vn_list_assets(name: String) -> Result<Vec<String>, String> {
    let dir = proj_dir(&name)?.join("assets");
    let mut out = Vec::new();
    if let Ok(rd) = fs::read_dir(&dir) {
        for e in rd.filter_map(|e| e.ok()) {
            if e.path().is_file() {
                out.push(e.file_name().to_string_lossy().to_string());
            }
        }
    }
    out.sort();
    Ok(out)
}

#[tauri::command]
pub fn vn_asset_b64(name: String, file: String) -> Result<String, String> {
    if !safe_file(&file) {
        return Err("非法文件名".into());
    }
    let p = proj_dir(&name)?.join("assets").join(&file);
    let bytes = fs::read(&p).map_err(|e| format!("{}: {}", file, e))?;
    Ok(format!("data:{};base64,{}", mime_of(&p), b64_encode(&bytes)))
}

#[tauri::command]
pub fn vn_assets_b64(name: String) -> Result<HashMap<String, String>, String> {
    let dir = proj_dir(&name)?.join("assets");
    let mut out = HashMap::new();
    if let Ok(rd) = fs::read_dir(&dir) {
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if !p.is_file() {
                continue;
            }
            let n = e.file_name().to_string_lossy().to_string();
            let low = n.to_ascii_lowercase();
            if !(low.ends_with(".png") || low.ends_with(".jpg") || low.ends_with(".jpeg") || low.ends_with(".webp")) {
                continue;
            }
            if let Ok(bytes) = fs::read(&p) {
                out.insert(n, format!("data:{};base64,{}", mime_of(&p), b64_encode(&bytes)));
            }
        }
    }
    Ok(out)
}

/* ---------------- 版本历史(可回退) ---------------- */
#[derive(Serialize)]
pub struct VnBackup {
    pub file: String,
    pub of: String,
    pub ts: u64,
    pub bytes: u64,
}

#[tauri::command]
pub fn vn_list_backups(name: String) -> Result<Vec<VnBackup>, String> {
    let bdir = proj_dir(&name)?.join("备份");
    let mut out = Vec::new();
    if let Ok(rd) = fs::read_dir(&bdir) {
        for e in rd.filter_map(|e| e.ok()) {
            let fname = e.file_name().to_string_lossy().to_string();
            // 形如 script.md.备份_1783445092
            if let Some(ix) = fname.find(".备份_") {
                let of = fname[..ix].to_string();
                let ts = fname[ix + ".备份_".len()..].parse::<u64>().unwrap_or(0);
                let bytes = e.metadata().map(|m| m.len()).unwrap_or(0);
                out.push(VnBackup { file: fname, of, ts, bytes });
            }
        }
    }
    out.sort_by(|a, b| b.ts.cmp(&a.ts));
    Ok(out)
}

#[tauri::command]
pub fn vn_read_backup(name: String, file: String) -> Result<String, String> {
    if !safe_file(&file) {
        return Err("非法文件名".into());
    }
    let p = proj_dir(&name)?.join("备份").join(&file);
    fs::read_to_string(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vn_restore_backup(name: String, file: String) -> Result<(), String> {
    if !safe_file(&file) {
        return Err("非法文件名".into());
    }
    let dir = proj_dir(&name)?;
    let src = dir.join("备份").join(&file);
    let of = file.split(".备份_").next().unwrap_or("").to_string();
    if of != "script.md" && of != "project.js" {
        return Err("只允许回滚 script.md / project.js".into());
    }
    let content = fs::read_to_string(&src).map_err(|e| e.to_string())?;
    // 回滚前先把当前版本也备份一份,链条不断
    vn_write_file(name, of, content).map(|_| ())
}

#[tauri::command]
pub fn vn_export(name: String, html: String) -> Result<String, String> {
    let dir = proj_dir(&name)?;
    let p = dir.join(format!("{}_单文件.html", name));
    fs::write(&p, html).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn vn_open_dir(name: String) -> Result<(), String> {
    let dir = proj_dir(&name)?;
    if !dir.exists() {
        return Err("项目不存在".into());
    }
    #[cfg(windows)]
    {
        let mut c = Command::new("explorer");
        c.arg(&dir);
        no_window(&mut c);
        c.spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = &dir;
    }
    Ok(())
}

/* ---------------- claude CLI:一次问答 ---------------- */
fn run_cli_capture(mut cmd: Command, stdin_text: String, timeout: Duration) -> Result<(bool, String, String), String> {
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    no_window(&mut cmd);
    crate::doctor::harden_child_env(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("启动失败: {}", e))?;
    // prompt 走 stdin(Windows 命令行 32k 上限,绝不能走 argv),写完关管道送 EOF
    if let Some(mut si) = child.stdin.take() {
        std::thread::spawn(move || {
            let _ = si.write_all(stdin_text.as_bytes());
        });
    }
    let mut out_pipe = child.stdout.take();
    let mut err_pipe = child.stderr.take();
    let out_th = std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(ref mut o) = out_pipe {
            use std::io::Read;
            let _ = o.read_to_string(&mut s);
        }
        s
    });
    let err_th = std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(ref mut o) = err_pipe {
            use std::io::Read;
            let _ = o.read_to_string(&mut s);
        }
        s
    });
    let t0 = Instant::now();
    let ok = loop {
        match child.try_wait() {
            Ok(Some(st)) => break st.success(),
            Ok(None) => {
                if t0.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = out_th.join();
                    let _ = err_th.join();
                    return Err(format!("超时({}秒)已终止", timeout.as_secs()));
                }
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) => return Err(e.to_string()),
        }
    };
    let out = out_th.join().unwrap_or_default();
    let err = err_th.join().unwrap_or_default();
    Ok((ok, out, err))
}

#[tauri::command]
pub async fn vn_run_claude(prompt: String, timeout_ms: Option<u64>, tools: Option<String>) -> Result<String, String> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(600_000));
    tauri::async_runtime::spawn_blocking(move || {
        let exe = crate::doctor::resolve_claude_exe().unwrap_or_else(|| PathBuf::from("claude"));
        let mut cmd = Command::new(exe);
        cmd.args(["-p", "--output-format", "text"]);
        if let Some(t) = tools.filter(|t| !t.is_empty()) {
            cmd.args(["--allowedTools", &t]); // 例如 "WebSearch,WebFetch":联网调研真实范例
        }
        let (ok, out, err) = run_cli_capture(cmd, prompt, timeout)?;
        if !ok && out.trim().is_empty() {
            return Err(format!("claude CLI 失败: {}", err.chars().take(400).collect::<String>()));
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

/* ---------------- codex CLI:一图一存(独立 CODEX_HOME 防并发错配) ---------------- */
fn codex_home_for(worker: u32) -> Result<PathBuf, String> {
    let h = home()?.join("Polaris").join("data").join("vn_codex_homes").join(format!("w{}", worker));
    fs::create_dir_all(&h).map_err(|e| e.to_string())?;
    let real = home()?.join(".codex");
    for f in ["auth.json", "config.toml", "version.json", "installation_id"] {
        let src = real.join(f);
        let dst = h.join(f);
        if src.exists() && !dst.exists() {
            let _ = fs::copy(&src, &dst);
        }
    }
    Ok(h)
}

#[tauri::command]
pub async fn vn_codex_shot(
    name: String,
    file: String,
    prompt: String,
    sprite: bool,
    worker: u32,
    timeout_ms: Option<u64>,
) -> Result<bool, String> {
    if !safe_file(&file) {
        return Err("非法文件名".into());
    }
    let assets = proj_dir(&name)?.join("assets");
    fs::create_dir_all(&assets).map_err(|e| e.to_string())?;
    let abs = assets.join(&file);
    let abs_str = abs.to_string_lossy().to_string();
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(340_000));
    let instr = if sprite {
        format!(
            "You are producing ONE standing character sprite for a visual-novel game.\n\
Requirements (hard):\n\
- PORTRAIT orientation, vertical, size 1024x1536. The image MUST be taller than wide.\n\
- FULLY TRANSPARENT background (alpha channel PNG). No scenery, no floor, no gradient, no frame — only the character on transparency.\n\
- ONE single character, FULL BODY visible head to feet, centered horizontally, feet close to the bottom edge.\n\
- Clean silhouette suitable for compositing over game backgrounds.\n\
- Absolutely NO text, letters, captions, watermarks, logos or signatures.\n\
Character to depict: {}\n\
Steps: use your image generation tool with transparent background enabled to render the sprite in portrait orientation, then copy the newly generated PNG to the absolute path '{}' (create parent dirs, overwrite if it exists). Reply only DONE when the portrait file is saved.",
            prompt, abs_str
        )
    } else {
        format!(
            "You are producing ONE cinematic STORYBOARD KEYFRAME for a visual-novel game.\n\
Requirements (hard):\n\
- WIDE LANDSCAPE orientation, horizontal, size 1536x1024. The image MUST be wider than tall.\n\
- Single dramatic composition, film-still quality, rich detail, strong staging and lighting.\n\
- Absolutely NO text, letters, captions, watermarks, logos or signatures in the image.\n\
Scene to depict: {}\n\
Steps: use your image generation tool to render the scene in landscape orientation, then copy the newly generated PNG to the absolute path '{}' (create parent dirs, overwrite if it exists). Reply only DONE when the landscape file is saved.",
            prompt, abs_str
        )
    };
    tauri::async_runtime::spawn_blocking(move || {
        let _ = fs::remove_file(&abs);
        let exe = crate::doctor::resolve_codex_exe().unwrap_or_else(|| PathBuf::from("codex"));
        let mut cmd = Command::new(exe);
        cmd.args(["exec", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", "-"]);
        cmd.env("CODEX_HOME", codex_home_for(worker)?);
        let _ = run_cli_capture(cmd, instr, timeout); // 成败以文件落盘为准
        Ok(abs.exists() && fs::metadata(&abs).map(|m| m.len() > 3000).unwrap_or(false))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn crud_assets_export_roundtrip() {
        let name = "vn测试-勿动".to_string();
        let _ = vn_delete(name.clone());
        vn_create(name.clone(), "测试".into()).unwrap();
        assert!(vn_list().unwrap().iter().any(|p| p.name == name));
        vn_write_file(name.clone(), "script.md".into(), "# 测试".into()).unwrap();
        vn_write_file(name.clone(), "script.md".into(), "# 测试2".into()).unwrap(); // 触发备份
        assert_eq!(vn_read_file(name.clone(), "script.md".into()).unwrap(), "# 测试2");
        // 素材 base64
        let assets = proj_dir(&name).unwrap().join("assets");
        fs::write(assets.join("a.png"), [137u8, 80, 78, 71, 1, 2, 3]).unwrap();
        let map = vn_assets_b64(name.clone()).unwrap();
        assert!(map.get("a.png").unwrap().starts_with("data:image/png;base64,"));
        assert_eq!(vn_list_assets(name.clone()).unwrap(), vec!["a.png"]);
        // 导出
        let p = vn_export(name.clone(), "<html></html>".into()).unwrap();
        assert!(Path::new(&p).exists());
        // 路径安全
        assert!(vn_read_file(name.clone(), "..\\..\\x".into()).is_err());
        assert!(vn_create("bad/../name".into(), "".into()).is_err());
        vn_delete(name).unwrap();
    }
}

/* ---------------- 授权探测 ---------------- */
#[tauri::command]
pub async fn vn_probe_auth() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let h = home()?;
        let claude_installed = crate::doctor::resolve_claude_exe().is_some();
        let codex_installed = crate::doctor::resolve_codex_exe().is_some();
        let claude_authed = h.join(".claude").join(".credentials.json").exists()
            || fs::read_to_string(h.join(".claude.json"))
                .ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .map(|j| j.get("oauthAccount").is_some())
                .unwrap_or(false);
        let codex_authed = fs::read_to_string(h.join(".codex").join("auth.json"))
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .map(|j| j.get("tokens").is_some() || j.get("OPENAI_API_KEY").is_some())
            .unwrap_or(false);
        Ok(serde_json::json!({
            "claude": { "installed": claude_installed, "authed": claude_authed },
            "codex":  { "installed": codex_installed, "authed": codex_authed },
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}
