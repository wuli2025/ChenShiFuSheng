create extension if not exists pgcrypto;

create table users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table saves (
  user_id    uuid not null references users(id) on delete cascade,
  script_id  text not null,
  slot       int  not null default 0,
  data       jsonb not null,
  version    int  not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, script_id, slot)
);

-- 分数流水(审计/重算用;实时榜在 Redis zset)
create table scores (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references users(id) on delete cascade,
  script_id  text not null,
  board      text not null,
  score      double precision not null,
  created_at timestamptz not null default now()
);
create index scores_board_idx on scores (script_id, board, score desc);

-- AI 生成任务(剧本/图片)
create table jobs (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null check (kind in ('script','image')),
  prompt     text not null,
  params     jsonb not null default '{}'::jsonb,
  status     text not null default 'queued'
             check (status in ('queued','running','done','failed','cancelled')),
  progress   int  not null default 0,
  error      text,
  result     jsonb,           -- 剧本 JSON 或产物文件相对路径清单
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_user_idx on jobs (user_id, id desc);
create index jobs_active_idx on jobs (status) where status in ('queued','running');
