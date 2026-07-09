//! vault-import —— 把 `vault/` 资产库导入平台。
//!
//! - `vault/art/**`  → 内容哈希去重 → `assets_lib`（共享素材库的第一批公共素材）
//! - `vault/works/*` → 模板代表作，挂在思路卡的「试玩样例」入口
//!
//! 用法: cargo run -p gen-pipeline --example vault_import -- <vault_dir> [--apply]
//! 不带 `--apply` 是 dry-run，只报告不落盘。

use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// FNV-1a 64。够用的内容哈希：我们要的是去重，不是抗碰撞攻击。
fn hash_bytes(b: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for &x in b {
        h ^= x as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

#[derive(Debug)]
struct Asset {
    hash: u64,
    path: PathBuf,
    kind: &'static str,
    size: u64,
    work: String,
}

fn classify(p: &Path) -> &'static str {
    let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    let dir = p.parent().and_then(|d| d.file_name()).and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    if name.contains("sprite") || name.contains("cast") || dir.contains("cast") || dir.contains("sprite") {
        "立绘"
    } else if name.contains("bg") || dir.contains("bg") || dir.contains("scene") {
        "背景"
    } else if name.contains("cover") {
        "封面"
    } else {
        "场景"
    }
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            walk(&p, out);
        } else if matches!(
            p.extension().and_then(|s| s.to_str()).map(str::to_lowercase).as_deref(),
            Some("png" | "jpg" | "jpeg" | "webp")
        ) {
            out.push(p);
        }
    }
}

fn main() -> anyhow::Result<()> {
    let vault = PathBuf::from(
        std::env::args().nth(1).ok_or_else(|| anyhow::anyhow!("用法: vault_import <vault_dir> [--apply]"))?,
    );
    let apply = std::env::args().any(|a| a == "--apply");

    // ---- art
    let art_root = vault.join("art");
    let mut files = Vec::new();
    walk(&art_root, &mut files);

    let mut by_hash: HashMap<u64, Vec<Asset>> = HashMap::new();
    let mut total_bytes = 0u64;
    for p in &files {
        let bytes = std::fs::read(p)?;
        total_bytes += bytes.len() as u64;
        let work = p
            .strip_prefix(&art_root)
            .ok()
            .and_then(|r| r.components().next())
            .map(|c| c.as_os_str().to_string_lossy().to_string())
            .unwrap_or_default();
        let a = Asset {
            hash: hash_bytes(&bytes),
            kind: classify(p),
            size: bytes.len() as u64,
            path: p.clone(),
            work,
        };
        by_hash.entry(a.hash).or_default().push(a);
    }

    let unique = by_hash.len();
    let dupes: usize = by_hash.values().map(|v| v.len() - 1).sum();
    let saved: u64 = by_hash
        .values()
        .filter(|v| v.len() > 1)
        .map(|v| v[0].size * (v.len() as u64 - 1))
        .sum();

    println!("━━ vault/art");
    println!("  扫描 {} 张图，{:.1} MB", files.len(), total_bytes as f64 / 1e6);
    println!("  内容哈希去重后 {unique} 张唯一（重复 {dupes} 张，省 {:.1} MB）", saved as f64 / 1e6);

    let mut by_work: HashMap<&str, usize> = HashMap::new();
    let mut by_kind: HashMap<&str, usize> = HashMap::new();
    for v in by_hash.values() {
        *by_work.entry(v[0].work.as_str()).or_default() += 1;
        *by_kind.entry(v[0].kind).or_default() += 1;
    }
    let mut works: Vec<_> = by_work.into_iter().collect();
    works.sort_by_key(|(_, n)| std::cmp::Reverse(*n));
    println!("  按来源: {}", works.iter().map(|(w, n)| format!("{w} {n}")).collect::<Vec<_>>().join(" · "));
    let mut kinds: Vec<_> = by_kind.into_iter().collect();
    kinds.sort_by_key(|(_, n)| std::cmp::Reverse(*n));
    println!("  按类别: {}", kinds.iter().map(|(k, n)| format!("{k} {n}")).collect::<Vec<_>>().join(" · "));

    // ---- works
    println!("\n━━ vault/works（模板代表作 · 思路卡的试玩样例）");
    let works_dir = vault.join("works");
    if let Ok(rd) = std::fs::read_dir(&works_dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().and_then(|s| s.to_str()) == Some("html") {
                let sz = e.metadata().map(|m| m.len()).unwrap_or(0);
                println!("  {:<44} {:.1} MB", p.file_name().unwrap().to_string_lossy(), sz as f64 / 1e6);
            }
        }
    }

    if apply {
        let dest = gen_pipeline::assets_dir().join("lib");
        std::fs::create_dir_all(&dest)?;
        // 内容哈希全平台单存：同一张图不论被几个项目引用，磁盘上只有一份。
        for (h, v) in &by_hash {
            let ext = v[0].path.extension().and_then(|s| s.to_str()).unwrap_or("png");
            let target = dest.join(format!("{h:016x}.{ext}"));
            if !target.exists() {
                std::fs::copy(&v[0].path, &target)?;
            }
        }
        // 索引：assets_lib 表的种子
        let index: Vec<_> = by_hash
            .values()
            .map(|v| {
                serde_json::json!({
                    "hash": format!("{:016x}", v[0].hash),
                    "kind": v[0].kind,
                    "size": v[0].size,
                    "source_work": v[0].work,
                    "status": "shared",
                })
            })
            .collect();
        std::fs::write(dest.join("index.json"), serde_json::to_vec_pretty(&index)?)?;
        println!("\n✓ 已导入 {} 张唯一素材 → {}", unique, dest.display());
    } else {
        println!("\n（dry-run。加 --apply 真正导入到 {}）", gen_pipeline::assets_dir().join("lib").display());
    }
    Ok(())
}
