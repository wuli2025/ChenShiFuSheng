-- v6/v7 平台化扩展:项目 / 持久时间线 / 发布大厅 / 共享素材库。
-- 幂等迁移器按序执行,本文件在 001_init.sql 之后。

-- ── 项目:创作的隔离单位,一切时间线/任务/素材都挂在项目上 ──────────
create table projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  title        text not null,
  cover_asset  text,                       -- 封面产物相对路径,可空;无封面不能发布
  script_md    text not null default '',   -- 工程格式:剧本源文
  project_json jsonb,                       -- 装配后的结构化产物,可空
  status       text not null default 'draft'
               check (status in ('draft','finalized')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index projects_user_idx on projects (user_id, updated_at desc);

-- ── 持久时间线:一切事件先写库再广播,SSE 只是显示器 ─────────────────
create table timeline_events (
  id         bigint generated always as identity primary key,
  project_id uuid not null references projects(id) on delete cascade,
  seq        bigint not null,              -- 每项目内单调递增,事务内取 max+1
  kind       text not null check (kind in (
               'user_msg','ai_msg','job_submitted','job_progress',
               'job_result','adopt','save_summary','pending_card')),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index timeline_events_seq_uidx on timeline_events (project_id, seq);
create index timeline_events_project_idx on timeline_events (project_id, seq);

-- ── 发布:当前装配产物的快照,再改项目不影响已发布版 ─────────────────
create table publishes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  version    int  not null,
  title      text not null,
  cover_url  text,
  html_path  text,
  visibility text not null default 'public'
             check (visibility in ('public','link')),
  plays      bigint not null default 0,
  created_at timestamptz not null default now()
);
create index publishes_public_idx on publishes (id desc) where visibility = 'public';
create index publishes_project_idx on publishes (project_id, version desc);

-- ── 共享素材库:平台级资源,按内容哈希全平台只存一份 ─────────────────
create table assets_lib (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('sfx','voice','ui','bg','sprite','bgm')),
  name        text not null,
  style_tag   text,
  mood_tag    text,
  path        text not null,
  bytes       bigint not null default 0,
  duration_ms int,                          -- 音频类时长,可空
  hash        text not null unique,         -- 内容哈希,去重
  status      text not null default 'pending'
              check (status in ('approved','pending')),
  uploader    uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index assets_lib_kind_idx on assets_lib (kind, id desc) where status = 'approved';

-- ── 项目素材引用:点「添加」建引用(不复制文件),直到手动移出 ─────────
create table project_assets (
  project_id uuid not null references projects(id) on delete cascade,
  asset_id   uuid not null references assets_lib(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (project_id, asset_id)
);

-- ── 扩展 jobs.kind:新增 sprite/cover/voice/assemble/revise ───────────
alter table jobs drop constraint jobs_kind_check;
alter table jobs add constraint jobs_kind_check
  check (kind in ('script','image','sprite','cover','voice','assemble','revise'));
