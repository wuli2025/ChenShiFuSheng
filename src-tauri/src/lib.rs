// ── 引擎模块（游戏平台精简后保留集）──
// 叙事游戏平台只需:对话生成(chat)+知识库/上传(kb)+文件转换(convert)+模型供应商(provider)
// +对话历史(conv)+项目上下文注入(claude_md)+技能意图(skills,chat 依赖)+语音(voice)
// +环境(doctor)+自更新(updater)+标题栏(titlebar)。其余 Polaris 模块已下线(见 git 历史)。
pub mod chat;
pub mod claude_md;
// Codex(ChatGPT)供应商路由的本地代理 —— provider::ensure_running 依赖它。
pub mod codex_proxy;
pub mod conv;
pub mod convert;
pub mod doctor;
// Agent 执行底座切换(codex CLI / claude CLI),默认 codex。chat.rs 据此分流。
pub mod engine;
pub mod kb;
pub mod provider;
pub mod skills;
// 创作工坊(AI人生画布引擎工作台)探活/拉起 —— 大厅「创作工坊」屏依赖。
pub mod studio;
// 灵动工坊(VN 动效叙事)——项目CRUD/claude写稿/codex生图/素材/导出,前端 pipeline.ts 编排。
pub mod vn_studio;
pub mod voice;
// 语音识别运行时(本地 SenseVoice via sherpa-rs);默认不编译,保护现有 build。
#[cfg(feature = "voice-asr")]
pub mod voice_asr;
// 实时语音输入(录音+全局热键+注入);桌面专属,默认不编译。
#[cfg(feature = "voice-live")]
pub mod voice_live;
// 自动更新依赖 Tauri updater/restart/package_info → 桌面专属。
#[cfg(feature = "desktop")]
pub mod updater;
// 原生标题栏染色（随主题切换，仅桌面窗口有标题栏）
#[cfg(feature = "desktop")]
pub mod titlebar;

#[cfg(feature = "desktop")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        // 自动更新（前端在启动时检查 GitHub Releases）+ 重启
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let h = app.handle();
            kb::init(h).map_err(|e| -> Box<dyn std::error::Error> { e.to_string().into() })?;
            conv::init(h).map_err(|e| -> Box<dyn std::error::Error> { e.to_string().into() })?;
            chat::init(h).map_err(|e| -> Box<dyn std::error::Error> { e.to_string().into() })?;
            claude_md::init(h)
                .map_err(|e| -> Box<dyn std::error::Error> { e.to_string().into() })?;
            provider::init(h)
                .map_err(|e| -> Box<dyn std::error::Error> { e.to_string().into() })?;
            engine::init(h).map_err(|e| -> Box<dyn std::error::Error> { e.to_string().into() })?;
            // 环境预热: 后台把 claude / pwsh 目录塞进进程 PATH + 设 Git Bash 路径,
            // 让之后 spawn 的 claude CLI 直接「找得到、有 shell」, 无需重启 (见 doctor.rs)。
            doctor::prime_path_for_claude();
            // 自动更新状态机初始化（记录当前版本 + 持久化路径 + 重启续提示）。best-effort。
            let _ = updater::init(h);
            // 语音输入「极速说」:配置 + 个人词表(首启种子)就位。
            voice::init();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // KB
            kb::kb_root,
            kb::kb_default_root,
            kb::kb_set_root,
            kb::kb_scan,
            kb::kb_compile,
            kb::kb_list,
            kb::kb_read,
            kb::kb_delete,
            kb::kb_clear,
            kb::kb_search,
            kb::kb_ingest,
            kb::kb_upload_files,
            kb::kb_convert_batch,
            kb::kb_graph,
            kb::kb_lint,
            kb::kb_scan_sources,
            kb::kb_quarantine,
            kb::kb_enrich_links,
            kb::kb_dedup,
            // 名人资料包（下载到自己的资料库，附带配套 skill）
            kb::kb_pack_list,
            kb::kb_pack_install,
            kb::kb_pack_remove,
            // Conv (项目 + 对话历史)
            conv::conv_list_projects,
            conv::conv_create_project,
            conv::conv_archive_project,
            conv::conv_open_project_dir,
            conv::conv_list_conversations,
            conv::conv_create_conversation,
            conv::conv_delete_conversation,
            conv::conv_rename_conversation,
            conv::conv_get_messages,
            conv::conv_set_project_kb_scope,
            conv::conv_archive_conversation,
            // Chat
            chat::chat_send,
            chat::chat_cancel,
            chat::chat_attach_files,
            chat::chat_attach_image,
            chat::open_url,
            chat::chat_build_manifest,
            chat::artifact_read,
            chat::artifact_write,
            chat::artifact_open_external,
            chat::artifact_reveal,
            chat::artifact_list,
            chat::artifact_search,
            // CLAUDE.md
            claude_md::claude_md_list_projects,
            claude_md::claude_md_kb_info,
            claude_md::claude_md_read,
            claude_md::claude_md_write,
            // Skills
            skills::list_skills,
            skills::get_skill,
            skills::create_skill,
            skills::install_skill,
            skills::import_skill,
            skills::delete_skill,
            // API 供应商坞 + 用量看板
            provider::provider_list,
            provider::provider_switch,
            provider::provider_set_link_mode,
            provider::provider_save,
            provider::provider_delete,
            provider::usage_summary,
            provider::codex_status,
            provider::codex_start_login,
            provider::codex_poll_login,
            // Agent 引擎切换(codex CLI / claude CLI)
            engine::engine_get,
            engine::engine_set,
            // 创作工坊(画布引擎工作台)探活/拉起/原生子WebView嵌入
            studio::studio_status,
            studio::studio_start,
            studio::studio_embed,
            studio::studio_embed_bounds,
            studio::studio_embed_close,
            studio::studio_embed_reload,
            // 灵动工坊(VN 动效叙事)
            vn_studio::vn_list,
            vn_studio::vn_create,
            vn_studio::vn_delete,
            vn_studio::vn_read_file,
            vn_studio::vn_write_file,
            vn_studio::vn_update_meta,
            vn_studio::vn_list_assets,
            vn_studio::vn_asset_b64,
            vn_studio::vn_assets_b64,
            vn_studio::vn_list_backups,
            vn_studio::vn_read_backup,
            vn_studio::vn_restore_backup,
            vn_studio::vn_export,
            vn_studio::vn_open_dir,
            vn_studio::vn_run_claude,
            vn_studio::vn_codex_shot,
            vn_studio::vn_probe_auth,
            // 环境医生 (环境监测 + 配置安装)
            doctor::env_check,
            doctor::env_fix_path,
            doctor::env_install_claude,
            doctor::env_install_node,
            doctor::env_install_pwsh,
            doctor::env_install_uv,
            doctor::env_uv_cache_info,
            doctor::env_uv_cache_clean,
            doctor::env_claude_update_check,
            doctor::env_update_claude,
            doctor::env_cancel,
            // 自动更新状态机
            updater::updater_get_state,
            updater::updater_check,
            updater::updater_apply,
            // 原生标题栏染色（主题切换联动）
            titlebar::set_titlebar_color,
            // 语音输入「极速说」:配置 / 个人词表 / 防污染(秒达档)/ 词表自学
            voice::voice_config_get,
            voice::voice_config_set,
            voice::voice_lexicon_get,
            voice::voice_hotword_add,
            voice::voice_hotword_remove,
            voice::voice_correction_add,
            voice::voice_correction_remove,
            voice::voice_anti_pollute,
            voice::voice_learn_correction,
            voice::voice_lexicon_learn,
            voice::voice_transcribe_file,
            voice::voice_listen_start,
            voice::voice_listen_stop,
            voice::voice_dictate_start,
            voice::voice_dictate_stop,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Polaris application")
        .run(|_app, event| {
            // App 退出 (关窗 / 主动退出) 时回收所有在飞的 claude 子进程树, 防孤儿继续占端口/CPU。
            if matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                chat::kill_all_children();
            }
        });
}
