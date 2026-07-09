# 尘世浮生 · 生产部署(国内云服务器)

面向阿里云/腾讯云 ECS 的工业化部署:网关限流、无状态 API 可水平扩容、
生成任务走队列在沙箱 worker 内消费,全容器非 root + 只读根文件系统。

## 架构

```
公网 :80
  └─ gateway (nginx-unprivileged)     限流/静态缓存/WS/SSE
       ├─ /            → chenshi      既有游戏服务(前端 + chat/生图代理)
       ├─ /v1/*        → api ×N       账号 JWT / 云存档 / 排行榜 / 生成任务
       └─ /assets/*    → 共享卷        worker 产物直出,30 天缓存
  api ──入队──▶ Redis(BullMQ) ──消费──▶ worker ×N
  worker: 沙箱内跑 claude(剧本) / codex(生图),产物→assets 卷,状态→Postgres
  Postgres 16(账号/存档/分数流水/任务)  Redis 7(队列/排行榜/限流/配额/SSE)
```

## 安全基线(已在 compose 内固化)

- 全部容器**非 root**(node / nginx-unprivileged / postgres 内建降权)
- `read_only: true` 根文件系统 + `no-new-privileges`,可写处全为显式 tmpfs/卷
- worker 任务工作区在 **tmpfs**(/work/jobs),每任务独立目录,HOME/TMPDIR
  重定向进去,任务结束即删;CLI 进程组硬超时整组击杀
- 环境变量白名单注入子进程,宿主 env 不透传
- 仅 gateway 暴露 80 端口,DB/Redis 不出内网
- API 密钥只存在服务端,前端永不下发

## 服务器要求

- 2C4G 起步(worker 并发 4);建议 4C8G
- Docker 24+ 与 compose 插件;国内配好镜像加速器
  (`/etc/docker/daemon.json` → `registry-mirrors`)
- 备案域名 + 安全组只放行 80/443/22

## 部署步骤

```bash
git clone <repo> && cd 尘世浮生
cp .env.prod.example .env.prod
# 填 JWT_SECRET(openssl rand -hex 32)、POSTGRES_PASSWORD、LLM key
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

验收:

```bash
curl http://127.0.0.1/v1/health          # {"ok":true}
curl http://127.0.0.1/                   # 游戏前端
curl http://127.0.0.1/v1/metrics         # 队列/用户指标
```

## 扩容与运维

```bash
# 水平扩容(api 无状态,worker 抢队列,直接加副本)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --scale api=3 --scale worker=2

# 日志
docker compose -f docker-compose.prod.yml logs -f api worker

# 数据库备份(建议 cron 每日)
docker exec chenshi-prod-postgres-1 pg_dump -U chenshi chenshi | gzip > backup-$(date +%F).sql.gz
```

- 限流:网关 30r/s/IP + 应用层(登录 20/min、注册 10/min、全局 300/min,
  Redis 共享计数,多实例一致)
- 生成配额:每用户并发 `MAX_ACTIVE_JOBS_PER_USER`、每日 `DAILY_JOB_QUOTA`
- HTTPS:建议前面再挂云厂商 SLB/CDN 终止 TLS,或在 gateway 加 certbot 卷

## API 速览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /v1/auth/register · /v1/auth/login | 注册/登录 → JWT |
| GET/PUT/DELETE | /v1/saves/:scriptId/:slot | 云存档(乐观版本,冲突 409) |
| POST/GET | /v1/leaderboard/:scriptId/:board | 提分(只升不降)/ 取榜 |
| POST | /v1/jobs | 提交生成任务 `{kind: script\|image, prompt}` → 202 |
| GET | /v1/jobs/:id · /v1/jobs/:id/events | 轮询 / SSE 进度 |
| POST | /v1/jobs/:id/cancel | 取消(击杀沙箱进程组) |

除排行榜读取外均需 `Authorization: Bearer <token>`。
