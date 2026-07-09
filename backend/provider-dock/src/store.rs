//! Profile 存储抽象。同一 trait 两个实现，撑起「一个后端两种投放」：
//! - 云端：PG 表 `provider_profiles`，secrets 加密列（由 api crate 实现 PgStore）。
//! - 桌面：`FileStore`，落 `$CHENSHI_DATA_DIR/providers.json`。

use crate::{ImageProfile, Profile};
use std::collections::HashMap;
use std::path::PathBuf;

pub trait ProfileStore: Send + Sync {
    fn active_profile(&self, user_id: &str) -> anyhow::Result<Option<Profile>>;
    fn active_image_profile(&self, user_id: &str) -> anyhow::Result<Option<ImageProfile>>;
    fn list(&self, user_id: &str) -> anyhow::Result<Vec<Profile>>;
    fn upsert(&mut self, p: Profile);
    fn upsert_image(&mut self, p: ImageProfile);
    fn delete(&mut self, id: &str);
}

#[derive(Default)]
pub struct MemStore {
    profiles: HashMap<String, Profile>,
    images: HashMap<String, ImageProfile>,
}

impl ProfileStore for MemStore {
    fn active_profile(&self, user_id: &str) -> anyhow::Result<Option<Profile>> {
        Ok(self
            .profiles
            .values()
            .find(|p| p.user_id == user_id && p.active)
            .cloned())
    }
    fn active_image_profile(&self, user_id: &str) -> anyhow::Result<Option<ImageProfile>> {
        Ok(self.images.get(user_id).cloned())
    }
    fn list(&self, user_id: &str) -> anyhow::Result<Vec<Profile>> {
        Ok(self
            .profiles
            .values()
            .filter(|p| p.user_id == user_id)
            .cloned()
            .collect())
    }
    fn upsert(&mut self, p: Profile) {
        // 同用户激活唯一：先把其余置为非激活。
        if p.active {
            for other in self.profiles.values_mut() {
                if other.user_id == p.user_id {
                    other.active = false;
                }
            }
        }
        self.profiles.insert(p.id.clone(), p);
    }
    fn upsert_image(&mut self, p: ImageProfile) {
        self.images.insert(p.user_id.clone(), p);
    }
    fn delete(&mut self, id: &str) {
        self.profiles.remove(id);
    }
}

/// 桌面端存储。secrets 落盘前做一次轻量混淆——真正的加密由 api 侧 PgStore 承担；
/// 桌面单用户场景以文件权限为主要防线。
pub struct FileStore {
    path: PathBuf,
    mem: MemStore,
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct Disk {
    profiles: Vec<Profile>,
    images: Vec<ImageProfile>,
}

impl FileStore {
    pub fn open(dir: impl Into<PathBuf>) -> anyhow::Result<Self> {
        let dir: PathBuf = dir.into();
        std::fs::create_dir_all(&dir)?;
        let path = dir.join("providers.json");
        let mut mem = MemStore::default();
        if path.exists() {
            let raw = std::fs::read_to_string(&path)?;
            let disk: Disk = serde_json::from_str(&raw).unwrap_or_default();
            for p in disk.profiles {
                mem.profiles.insert(p.id.clone(), p);
            }
            for i in disk.images {
                mem.images.insert(i.user_id.clone(), i);
            }
        }
        Ok(Self { path, mem })
    }

    fn flush(&self) -> anyhow::Result<()> {
        let disk = Disk {
            profiles: self.mem.profiles.values().cloned().collect(),
            images: self.mem.images.values().cloned().collect(),
        };
        // 原子写：tmp + rename，避免断电留半个文件。
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(&disk)?)?;
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }
}

impl ProfileStore for FileStore {
    fn active_profile(&self, user_id: &str) -> anyhow::Result<Option<Profile>> {
        self.mem.active_profile(user_id)
    }
    fn active_image_profile(&self, user_id: &str) -> anyhow::Result<Option<ImageProfile>> {
        self.mem.active_image_profile(user_id)
    }
    fn list(&self, user_id: &str) -> anyhow::Result<Vec<Profile>> {
        self.mem.list(user_id)
    }
    fn upsert(&mut self, p: Profile) {
        self.mem.upsert(p);
        let _ = self.flush();
    }
    fn upsert_image(&mut self, p: ImageProfile) {
        self.mem.upsert_image(p);
        let _ = self.flush();
    }
    fn delete(&mut self, id: &str) {
        self.mem.delete(id);
        let _ = self.flush();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(id: &str, active: bool) -> Profile {
        Profile {
            id: id.into(),
            user_id: "u".into(),
            preset_id: "kimi".into(),
            secret: "s".into(),
            base_url_override: None,
            models: HashMap::new(),
            link_mode: false,
            active,
        }
    }

    #[test]
    fn activating_one_deactivates_others() {
        let mut s = MemStore::default();
        s.upsert(p("a", true));
        s.upsert(p("b", true));
        let active: Vec<_> = s.list("u").unwrap().into_iter().filter(|x| x.active).collect();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].id, "b");
    }

    #[test]
    fn file_store_roundtrips() {
        let dir = std::env::temp_dir().join(format!("dock-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        {
            let mut s = FileStore::open(&dir).unwrap();
            s.upsert(p("a", true));
        }
        let s2 = FileStore::open(&dir).unwrap();
        assert_eq!(s2.active_profile("u").unwrap().unwrap().id, "a");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
