import { chromium } from 'playwright';
const b=await chromium.launch({args:['--no-proxy-server']});
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto((process.env.BASE ?? 'http://127.0.0.1:17801') + '/apps/web/index.html',{waitUntil:'networkidle'});
await p.waitForTimeout(1200);

// 真正的可见性：截屏后看球心位置的像素，而不是查 canvas 内存
const box = await p.locator('#hallCanvas').boundingBox();
const buf = await p.screenshot({clip: box});
// 用 canvas 在页面里解码截图，取样球心与空白处对比
const shot = buf.toString('base64');
const r = await p.evaluate(async (b64)=>{
  const img = new Image(); img.src='data:image/png;base64,'+b64;
  await img.decode();
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
  const x=c.getContext('2d'); x.drawImage(img,0,0);
  const px=(px_,py_)=>{const d=x.getImageData(px_,py_,1,1).data; return d[0]+d[1]+d[2];};
  const cx=Math.round(img.width/2), cy=Math.round(img.height/2);
  // 第一颗球在中心右侧 110px（layout: rad=110, ang=0）
  const orb = px(cx+110, cy);
  const empty = px(20, 20);            // 左上角空白
  return {orb, empty, w:img.width};
}, shot);
console.log('=== 水晶球是否肉眼可见（对截图取样，不是查 canvas 内存）');
console.log(`  球心亮度 ${r.orb}  空白处亮度 ${r.empty}`);
console.log('  '+(r.orb > r.empty + 40 ? '✓ 球明显亮于背景，可见' : '✗ 球被遮挡或未绘制'));
await p.screenshot({path:'/tmp/hall_fixed.png'});
await b.close();
process.exit(r.orb > r.empty + 40 ? 0 : 1);
