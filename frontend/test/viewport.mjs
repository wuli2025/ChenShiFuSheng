import { chromium } from 'playwright';
const b = await chromium.launch();
const errs = [];
for (const [w,h,name] of [[390,844,'iPhone 竖屏'],[768,1024,'iPad'],[1440,900,'笔电'],[1920,1080,'桌面']]) {
  const p = await b.newPage({ viewport:{width:w,height:h} });
  p.on('pageerror', e=>errs.push(name+': '+e.message));
  await p.goto('file:///tmp/尘世浮生.html');
  await p.waitForTimeout(500);
  const res = {};
  for (const tab of ['hall','templates','studio','settings']) {
    await p.click(`button[data-tab="${tab}"]`); await p.waitForTimeout(250);
    res[tab] = await p.evaluate(()=>document.documentElement.scrollWidth > window.innerWidth+1);
  }
  const bad = Object.entries(res).filter(([,v])=>v).map(([k])=>k);
  console.log(`  ${name.padEnd(12)} ${w}×${h}  ${bad.length? '✗ 溢出: '+bad.join(','): '✓ 无横向溢出'}`);
  await p.close();
}
// 125% 缩放走查
const p = await b.newPage({ viewport:{width:1152,height:720}, deviceScaleFactor:1.25 });
await p.goto('file:///tmp/尘世浮生.html'); await p.waitForTimeout(400);
console.log(`  笔电 125%缩放         ${await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)?'✗ 溢出':'✓ 无横向溢出'}`);
console.log(`\n  运行时错误 ${errs.length} 条`); errs.forEach(e=>console.log('   ✗ '+e));
await b.close();
