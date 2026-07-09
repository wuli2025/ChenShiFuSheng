import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const srv = await serve();
const BASE = process.env.BASE ?? srv.base;
const b=await chromium.launch({args:['--no-proxy-server']});
console.log('=== 水晶球布局几何断言：不重叠 · 不溢出');
let bad=0;
for (const [w,h] of [[1440,900],[1920,1080],[768,1024],[390,844]]) {
  const p=await b.newPage({viewport:{width:w,height:h}});
  await p.goto(BASE + '/apps/web/index.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(700);
  const rows=[];
  for (const n of [1,2,5,10,30,80]) {
    const r = await p.evaluate((n)=>{
      const items = Array.from({length:n},(_,i)=>({id:'g'+i,title:'t'+i,plays:5000-i*57,progress:0,endings:1,playtime:1,author:'a'}));
      window.__hall.setItems(items);
      const orbs = window.__hall.orbs;
      const c = document.getElementById('hallCanvas').getBoundingClientRect();
      let overlap=0, minGap=1e9;
      for(let i=0;i<orbs.length;i++)for(let j=i+1;j<orbs.length;j++){
        const a=orbs[i],b2=orbs[j];
        const d=Math.hypot(a.x-b2.x,a.y-b2.y)-(a.r+b2.r);
        minGap=Math.min(minGap,d);
        if(d < -1) overlap++;   // 允许 1px 抗锯齿容差
      }
      // 溢出：球心±半径±进度环(6px)+呼吸幅度(5px) 必须在画布内
      const M=11;
      const out = orbs.filter(o=>o.x-o.r-M<0||o.x+o.r+M>c.width||o.y-o.r-M<0||o.y+o.r+M>c.height).length;
      return {n, overlap, out, minGap: orbs.length>1?Math.round(minGap):null};
    }, n);
    rows.push(r); if(r.overlap||r.out) bad++;
  }
  console.log(`  ${w}×${h}`);
  rows.forEach(r=>console.log(`    ${String(r.n).padStart(2)} 球  重叠 ${r.overlap}  溢出 ${r.out}  最小间隙 ${r.minGap ?? '-'}px  ${r.overlap||r.out?'✗':'✓'}`));
  await p.close();
}
await b.close();
await srv.close();
console.log('\n  '+(bad?`✗ ${bad} 组不合格`:'✓ 全部视口 × 全部球数：无重叠、无溢出'));
process.exit(bad?1:0);
