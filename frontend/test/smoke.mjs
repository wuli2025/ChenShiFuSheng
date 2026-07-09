import { chromium } from 'playwright';

const url = 'file:///tmp/尘世浮生.html';
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

console.log('=== 1) 加载与运行时错误');
const t0 = Date.now();
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
console.log(`  首屏可交互 ${Date.now() - t0}ms`);
console.log(`  运行时错误 ${errors.length} 条`);
errors.forEach(e => console.log('    ✗ ' + e));

console.log('\n=== 2) 水晶球大厅：canvas 已渲染（非空白）');
const painted = await page.evaluate(() => {
  const c = document.getElementById('hallCanvas');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let nz = 0;
  for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) nz++;
  return { w: c.width, h: c.height, nonEmptyPixels: nz };
});
console.log(`  canvas ${painted.w}×${painted.h}, 非透明采样点 ${painted.nonEmptyPixels}`);
console.log(`  ${painted.nonEmptyPixels > 50 ? '✓ 球体已绘制' : '✗ 画布空白'}`);

console.log('\n=== 3) 帧率实测（3 秒 rAF 采样）');
const fps = await page.evaluate(() => new Promise(res => {
  let n = 0; const t = performance.now();
  const tick = () => { n++; performance.now() - t < 3000 ? requestAnimationFrame(tick) : res(n / 3); };
  requestAnimationFrame(tick);
}));
console.log(`  ${fps.toFixed(1)} fps  ${fps >= 55 ? '✓ 达标(≥55)' : fps >= 30 ? '△ 降级区间' : '✗ 卡顿'}`);

console.log('\n=== 4) 悬停水晶球 → 浮出信息卡');
const box = await page.locator('#hallCanvas').boundingBox();
// 球布局：第一颗在中心右侧 rad=110
await page.mouse.move(box.x + box.width / 2 + 110, box.y + box.height / 2);
await page.waitForTimeout(200);
const cardShown = await page.locator('#orbCard[data-show]').count();
const cardText = await page.locator('#orbCard .t').textContent();
console.log(`  信息卡 ${cardShown ? '✓ 已浮出' : '✗ 未浮出'}  标题="${cardText}"`);

console.log('\n=== 5) 点击水晶球 → 招牌转场 → Player Shell 全屏');
await page.mouse.click(box.x + box.width / 2 + 110, box.y + box.height / 2);
await page.waitForTimeout(900);
const playerOpen = await page.locator('#player[data-open]').count();
console.log(`  Player ${playerOpen ? '✓ 已接管' : '✗ 未打开'}`);
const inGame = await page.frameLocator('#playerFrame').locator('h1').textContent().catch(() => null);
console.log(`  iframe 内游戏标题: ${inGame ?? '(空)'}`);

console.log('\n=== 6) Esc 退出 → 球缩回原位');
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
console.log(`  Player ${await page.locator('#player[data-open]').count() ? '✗ 仍开着' : '✓ 已关闭'}`);

console.log('\n=== 7) 模板库：5 张卡 + 思路卡抽屉 + 做同款');
await page.click('button[data-tab="templates"]');
await page.waitForTimeout(300);
const tplCount = await page.locator('.tpl').count();
console.log(`  模板卡 ${tplCount} 张 ${tplCount === 5 ? '✓' : '✗'}`);
await page.locator('.tpl').first().click();
await page.waitForTimeout(500);
const drawerOpen = await page.locator('#drawer[data-open]').count();
const rationaleH = await page.locator('#drawer .rationale h5').count();
console.log(`  思路抽屉 ${drawerOpen ? '✓' : '✗'}，思路条目 ${rationaleH} 条`);
await page.click('#cloneBtn');
await page.waitForTimeout(400);
const onStudio = await page.locator('#studio[data-active]').count();
console.log(`  「做同款」跳创作台 ${onStudio ? '✓' : '✗'}`);

console.log('\n=== 8) 创作台：立项 → 五段流水线 → 生图降级 → 校验 → 发布');
await page.fill('#topicInput', '兽医人生');
await page.click('#forgeBtn');
await page.waitForTimeout(5200);
const stages = await page.$$eval('.stage', els => els.map(e => e.dataset.state));
console.log(`  流水线状态 ${JSON.stringify(stages)}`);
console.log(`  ${stages.every(s => s === 'done') ? '✓ 五段全部完成' : '✗ 未跑完'}`);
const events = await page.locator('.ev').count();
const fallbackEv = await page.locator('.ev-warn').count();
console.log(`  时间线事件 ${events} 条，其中降级标记 ${fallbackEv} 条 ${fallbackEv > 0 ? '✓ api_fallback 显式可见' : '✗'}`);

console.log('\n=== 9) 主题切换（深空琉璃 ⇄ 奶油琉璃）');
await page.click('#themeBtn');
await page.waitForTimeout(200);
const theme = await page.evaluate(() => document.documentElement.dataset.theme);
console.log(`  当前主题 ${theme} ${theme === 'cream-glass' ? '✓' : '✗'}`);

console.log('\n=== 10) 移动端视口不横向溢出');
await page.setViewportSize({ width: 390, height: 844 });
await page.click('button[data-tab="hall"]');
await page.waitForTimeout(400);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
console.log(`  横向溢出 ${overflow ? '✗ 有' : '✓ 无'}`);

console.log('\n=== 总计运行时错误：' + errors.length);
await browser.close();
process.exit(errors.length ? 1 : 0);
