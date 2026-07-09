/* ============================================================================
   环境医生 —— **仅桌面端**。由 ui-kit/platform.js 动态 import，
   网页端永不加载，构建产物里 grep 不到（CI 有断言）。

   职责（PRD §03）：帮个人用户装 CLI、登录、验证生图。
   服务端部署时这些由运维脚本与 /v1/health 的 selftest 保证，网页端不需要这一页。
   ========================================================================= */

const STEPS = [
  {
    id: 'cli',
    title: 'AI 命令行工具',
    check: h => h.cli?.every(c => c.ok),
    detail: h => (h.cli ?? []).map(c => `${c.ok ? '✓' : '✗'} ${c.engine} — ${c.detail}`).join('\n'),
    fix: '在终端执行：\nnpm i -g @anthropic-ai/claude-code @openai/codex',
  },
  {
    id: 'login',
    title: '登录态',
    // health 里 cli.ok 只说明找得到可执行文件；登录态要真跑一次才知道。
    check: h => h.cli?.some(c => c.engine === 'claude' && c.ok),
    detail: () => '点「验证」会真的跑一次 claude，确认登录态可用。',
    fix: '在终端执行：claude /login\n或在「设置 → API 供应商坞」里配一个第三方 key。',
  },
  {
    id: 'image',
    title: '生图能力',
    check: h => h.cli?.some(c => c.engine === 'codex' && c.ok) || h.image_fallback_ready,
    detail: h =>
      `梯队一 codex：${h.cli?.find(c => c.engine === 'codex')?.ok ? '可用' : '不可用'}\n` +
      `梯队二 生图 API：${h.image_fallback_ready ? '已配置' : '未配置'}`,
    fix: '两条路至少要有一条。codex 需登录；生图 API 在「设置」里配。\n两者都没有时，插画任务会直接报红 —— 绝不会退化成 SVG 占位图。',
  },
  {
    id: 'data',
    title: '数据目录',
    check: h => !!h.data_dir,
    detail: h => h.data_dir,
    fix: '改 CHENSHI_DATA_DIR 环境变量，或用下面的按钮换一个目录。',
  },
];

export async function mountDoctor(root, { apiBase, platform }) {
  root.innerHTML = `
    <div class="pad">
      <h1 class="title">环境医生</h1>
      <p class="lede">桌面端专属。网页端不需要这一页 —— 服务端部署时由 healthcheck 的 cli-core selftest 保证。</p>
      <div class="stack" id="doctorSteps"></div>
      <div class="row" style="margin-top:var(--sp-5)">
        <button class="btn btn-primary" id="recheck">重新检查</button>
        <button class="btn" id="pickDir">更换数据目录</button>
        <button class="btn" id="revealDir">在资源管理器中打开</button>
      </div>
    </div>`;

  const box = root.querySelector('#doctorSteps');

  async function refresh() {
    box.innerHTML = '<div class="skeleton" style="height:72px"></div>'.repeat(STEPS.length);
    let h;
    try {
      h = await (await fetch(`${apiBase}/health`)).json();
    } catch (e) {
      box.innerHTML = `<div class="error-state">
        <div class="what">连不上本地后端 <span class="code">E-CLI-00</span></div>
        <div class="why">sidecar 可能没起来，或端口被占。</div>
        <div class="how">→ 重启应用；若仍失败，看日志里的「后端启动失败」。</div></div>`;
      return;
    }

    box.innerHTML = STEPS.map(s => {
      const ok = !!s.check(h);
      return `<div class="card" style="border-left:3px solid var(--${ok ? 'ok' : 'warn'})">
        <div class="row">
          <span class="tag ${ok ? 'tag-ok' : 'tag-warn'}">${ok ? '正常' : '需处理'}</span>
          <strong>${s.title}</strong>
        </div>
        <pre style="margin-top:var(--sp-2);font-size:var(--fs-xs);color:var(--tx-2);white-space:pre-wrap">${s.detail(h)}</pre>
        ${ok ? '' : `<div class="how" style="margin-top:var(--sp-2);font-size:var(--fs-sm)">→ ${s.fix.replace(/\n/g, '<br>')}</div>`}
      </div>`;
    }).join('');
  }

  root.querySelector('#recheck').onclick = refresh;
  root.querySelector('#pickDir').onclick = async () => {
    const dir = await platform.chooseFolder();
    if (dir) alert(`已选择 ${dir}\n重启应用后生效（会写入 CHENSHI_DATA_DIR）。`);
  };
  root.querySelector('#revealDir').onclick = async () => {
    const h = await (await fetch(`${apiBase}/health`)).json();
    await platform.showInFolder(h.data_dir);
  };

  await refresh();
}
