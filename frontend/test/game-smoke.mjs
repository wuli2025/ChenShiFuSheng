import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///tmp/兽医人生.html');
await p.waitForTimeout(400);
console.log('=== 单文件游戏产物 · 真实可玩性验证');
console.log('  启动幕 ' + (await p.locator('#start').count() ? '✓' : '✗'));
await p.click('#start');                       // 声音礼仪：首拍点击
await p.waitForTimeout(600);
console.log('  HUD 属性面板: ' + (await p.locator('#hud').textContent()).trim().slice(0,44));
const txt = await p.locator('#text').textContent();
console.log('  打字机正文 ' + (txt.length>4 ? `✓ (${txt.length}字)` : '✗'));
let choices = await p.locator('.choice').count();
console.log(`  选项数 ${choices} ${choices>=2?'✓ 真分叉':'✗'}`);

// 连点 30 步，看是否能推进而不报错
let steps=0;
for (let i=0;i<30;i++){
  const n = await p.locator('.choice:not([disabled])').count();
  if(!n) break;
  await p.locator('.choice:not([disabled])').first().click();
  await p.waitForTimeout(60); steps++;
}
console.log(`  连续推进 ${steps} 步 ${steps>=25?'✓':'△'}`);
const hud = await p.locator('#hud').textContent();
console.log(`  属性已随选择变化: ${hud.match(/\d+/g).slice(0,5).join('/')}`);

// 存档：刷新后续玩
await p.reload(); await p.waitForTimeout(300);
await p.click('#start'); await p.waitForTimeout(300);
const hud2 = await p.locator('#hud').textContent();
const seen = hud2.match(/已见\s*(\d+)/);
console.log(`  刷新后续玩 ${seen && +seen[1] > 1 ? '✓ 存档生效（已见 '+seen[1]+' 节点）' : '✗'}`);
console.log(`  运行时错误 ${errs.length} 条`); errs.forEach(e=>console.log('   ✗',e));
await b.close();
