# Backend Status

本文件记录叙事游戏平台 fork 当前的 Tauri 命令边界。权威来源是
`src-tauri/src/lib.rs` 中的 `tauri::generate_handler![...]` 注册清单。

`src/App.vue` 当前只渲染 `src/game/GamePlatform.vue`。Polaris 仪表盘外壳仍保留在
`src/components/` 和 `src/features/` 下，供日后复用；这些保留 UI 调到已剥离命令时，
`src/tauri.ts` 会命中 `STRIPPED_COMMANDS` 并走浏览器 stub / 友好错误，避免桌面模式出现
`command not found`。

## 已接入后端的命令

### KB

- `kb_root`
- `kb_default_root`
- `kb_set_root`
- `kb_scan`
- `kb_compile`
- `kb_list`
- `kb_read`
- `kb_delete`
- `kb_clear`
- `kb_search`
- `kb_ingest`
- `kb_upload_files`
- `kb_convert_batch`
- `kb_graph`
- `kb_lint`
- `kb_scan_sources`
- `kb_quarantine`
- `kb_enrich_links`
- `kb_dedup`
- `kb_pack_list`
- `kb_pack_install`
- `kb_pack_remove`

### Conv

- `conv_list_projects`
- `conv_create_project`
- `conv_archive_project`
- `conv_open_project_dir`
- `conv_list_conversations`
- `conv_create_conversation`
- `conv_delete_conversation`
- `conv_rename_conversation`
- `conv_get_messages`
- `conv_set_project_kb_scope`
- `conv_archive_conversation`

### Chat And Artifacts

- `chat_send`
- `chat_cancel`
- `chat_attach_files`
- `chat_attach_image`
- `open_url`
- `chat_build_manifest`
- `artifact_read`
- `artifact_write`
- `artifact_open_external`
- `artifact_reveal`
- `artifact_list`
- `artifact_search`

### CLAUDE.md

- `claude_md_list_projects`
- `claude_md_kb_info`
- `claude_md_read`
- `claude_md_write`

### Skills

- `list_skills`
- `get_skill`
- `create_skill`
- `install_skill`
- `import_skill`
- `delete_skill`

### Provider And Engine

- `provider_list`
- `provider_switch`
- `provider_set_link_mode`
- `provider_save`
- `provider_delete`
- `usage_summary`
- `codex_status`
- `codex_start_login`
- `codex_poll_login`
- `engine_get`
- `engine_set`

### Environment

- `env_check`
- `env_fix_path`
- `env_install_claude`
- `env_install_node`
- `env_install_pwsh`
- `env_install_uv`
- `env_uv_cache_info`
- `env_uv_cache_clean`
- `env_claude_update_check`
- `env_update_claude`
- `env_cancel`

### Desktop Shell

- `updater_get_state`
- `updater_check`
- `updater_apply`
- `set_titlebar_color`

### Voice

- `voice_config_get`
- `voice_config_set`
- `voice_lexicon_get`
- `voice_hotword_add`
- `voice_hotword_remove`
- `voice_correction_add`
- `voice_correction_remove`
- `voice_anti_pollute`
- `voice_learn_correction`
- `voice_lexicon_learn`
- `voice_transcribe_file`
- `voice_listen_start`
- `voice_listen_stop`
- `voice_dictate_start`
- `voice_dictate_stop`

## 游戏平台版已剥离、前端保留待复用的命令

这些命令仍有前端 wrapper，但没有出现在当前 `generate_handler!` 注册清单中。桌面模式下
`src/tauri.ts` 不会对它们调用 `rawInvoke`，而是走 `browserStub()` 降级。

### Feishu / WeCom

- `feishu_get_config`
- `feishu_set_config`
- `feishu_test_connection`
- `feishu_create_qr`
- `feishu_open_console`
- `feishu_gateway_start`
- `feishu_gateway_stop`
- `feishu_gateway_status`
- `wecom_scan_create`

### Media Accounts

- `media_accounts_status`
- `media_account_forget`

### Scan

- `scan_roots`
- `scan_resources`

### File Center / Fable

- `file_overview`
- `file_grid`
- `file_thumb`
- `file_gist`
- `file_cluster_build`
- `file_cluster_llm`
- `file_cluster_model_get`
- `file_cluster_model_set`
- `file_warm_thumbs`
- `fable_inventory_start`
- `fable_index_start`
- `fable_search`

### Sandbox / Cube

- `sandbox_status`
- `sandbox_build_image`
- `sandbox_start`
- `sandbox_stop`
- `sandbox_exec`
- `cube_config_get`
- `cube_config_set`
- `cube_status`

### Persona

- `persona_list`
- `persona_apply`

### Project / Forge

- `project_list`
- `project_status`
- `project_run`
- `project_stop`
- `forge_deck_to_pptx`
- `forge_spec_to_pptx`

### Other Unregistered Frontend Wrapper

- `codex_proxy_info`

`codex_proxy_info` 在 Rust 侧存在普通函数，但当前没有注册为 Tauri command，因此从前端
`invoke("codex_proxy_info")` 的角度同样不可用，已纳入统一降级集合。

## 重新挂载保留 UI 前

重新启用上述保留 UI 前，需要先补回对应 Rust 命令实现并加入 `generate_handler!` 注册清单。
完成后同步更新 `src/tauri.ts`：从 `STRIPPED_COMMANDS` 移除该命令，并删除或调整对应 stub。
