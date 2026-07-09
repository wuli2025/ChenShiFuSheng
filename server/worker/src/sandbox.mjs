// 沙箱执行:在隔离的任务目录里以受限方式跑 claude / codex CLI。
// 容器层已保证:非 root、只读根文件系统、无特权、CPU/内存限额、独立网络。
// 本模块补进程级约束:
//   - 每任务独立 workdir,HOME/TMPDIR 均指向它,CLI 写不出这个目录
//   - 环境变量白名单注入,宿主 env 不透传
//   - 硬超时 + 进程组整组击杀(detached + kill(-pid))
//   - stdout/stderr 截断上限,防日志打爆磁盘
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const WORK_ROOT = process.env.WORK_DIR || "/work/jobs";
const OUTPUT_CAP = Number(process.env.SANDBOX_OUTPUT_CAP || 4 * 1024 * 1024);

// 只放行生成所需的最小环境
const ENV_ALLOW = [
  "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_MODEL", "OPENAI_API_KEY", "OPENAI_BASE_URL",
  "IMAGE_API_KEY", "PATH", "LANG",
];

export async function makeJobDir(jobId) {
  const dir = path.join(WORK_ROOT, String(jobId));
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function cleanJobDir(jobId) {
  await rm(path.join(WORK_ROOT, String(jobId)), { recursive: true, force: true });
}

/**
 * 在沙箱约束下运行命令。
 * @returns {Promise<{code:number, stdout:string, stderr:string, timedOut:boolean}>}
 */
export function runSandboxed(cmd, args, { cwd, timeoutMs, onStdout, signal }) {
  const env = { HOME: cwd, TMPDIR: cwd, XDG_CACHE_HOME: path.join(cwd, ".cache") };
  for (const k of ENV_ALLOW) if (process.env[k]) env[k] = process.env[k];

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      detached: true,           // 独立进程组,便于整组击杀
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "", timedOut = false, settled = false;
    const killGroup = () => { try { process.kill(-child.pid, "SIGKILL"); } catch {} };
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, timeoutMs);
    const onAbort = () => killGroup();
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (d) => {
      if (stdout.length < OUTPUT_CAP) stdout += d;
      onStdout?.(String(d));
    });
    child.stderr.on("data", (d) => { if (stderr.length < OUTPUT_CAP) stderr += d; });
    child.on("error", (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}
