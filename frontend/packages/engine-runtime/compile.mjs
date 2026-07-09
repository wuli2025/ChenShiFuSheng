#!/usr/bin/env node
/* ============================================================================
   engine-runtime · 单文件编译器
   ---------------------------------------------------------------------------
   用法: node compile.mjs <script.md> <out.html> [assetsDir]

   把「数值人生引擎 + VN 演出层 + 灵动动效 + WebAudio 程序化音频 + base64 插画」
   全部内联进一个 HTML。产物要求：双击离线可玩、无外链请求、移动端可玩。

   worker 的 compile 任务调用它（容器内置 node），保证：
   大厅里玩到的 / 编辑器里试玩的 / 导出文件双击打开的 —— 是同一份字节。
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const [, , scriptPath, outPath, assetsDir] = process.argv;
if (!scriptPath || !outPath) {
  console.error('用法: node compile.mjs <script.md> <out.html> [assetsDir]');
  process.exit(2);
}

// script.md 里是 JSON（AI 接口说明 v14 协议：单一真源）
const raw = readFileSync(scriptPath, 'utf8');
const jsonStart = raw.indexOf('{');
if (jsonStart < 0) {
  console.error('script.md 里找不到 JSON 主体');
  process.exit(1);
}
const script = JSON.parse(raw.slice(jsonStart));

if (!Array.isArray(script.nodes) || script.nodes.length === 0) {
  console.error('剧本没有节点');
  process.exit(1);
}

// —— 插画内联为 base64。**只接受真生图产物**；这里不生成任何占位图。
const art = {};
if (assetsDir && existsSync(assetsDir)) {
  for (const f of readdirSync(assetsDir)) {
    const ext = extname(f).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) continue;
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    art[basename(f, ext)] = `data:${mime};base64,${readFileSync(join(assetsDir, f)).toString('base64')}`;
  }
}

const title = script.title || '尘世浮生';
const attrs = [...new Set(script.nodes.flatMap(n => Object.keys(n.effects || {})))];

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<style>
:root{--bg:#080b13;--tx:#e8eefb;--tx2:#93a5c4;--acc:#6ea8ff;--acc2:#b48cff;--line:rgba(255,255,255,.08)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:var(--bg);color:var(--tx);font:16px/1.9 'PingFang SC','Microsoft YaHei',sans-serif;overflow:hidden}
#stage{position:fixed;inset:0;display:flex;flex-direction:column}
#bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;
    transition:opacity .8s cubic-bezier(.2,.8,.2,1);filter:saturate(.95)}
#bg.on{opacity:1}
#fx{position:absolute;inset:0;pointer-events:none}
#veil{position:absolute;inset:0;background:linear-gradient(to top,rgba(4,6,12,.94) 12%,rgba(4,6,12,.25) 55%,transparent)}
#hud{position:relative;display:flex;gap:18px;padding:14px 22px;font-size:12px;
     font-variant-numeric:tabular-nums;color:var(--tx2);border-bottom:1px solid var(--line);
     background:rgba(8,11,19,.6);backdrop-filter:blur(8px)}
#hud b{color:var(--acc);font-weight:600}
#body{position:relative;flex:1;display:flex;align-items:flex-end;justify-content:center;padding:0 22px 28px}
#panel{width:min(760px,100%);}
#text{font-size:17px;min-height:5.6em;margin-bottom:20px;text-shadow:0 2px 12px rgba(0,0,0,.9)}
#choices{display:flex;flex-direction:column;gap:10px}
.choice{padding:12px 18px;border:1px solid var(--line);border-radius:12px;cursor:pointer;
  background:rgba(18,24,40,.72);backdrop-filter:blur(10px);font:inherit;font-size:15px;color:var(--tx);text-align:left;
  transition:transform .12s cubic-bezier(.2,.8,.2,1),border-color .12s,background .12s}
.choice:hover{transform:translateY(-2px);border-color:var(--acc);background:rgba(28,38,64,.85)}
.choice[disabled]{opacity:.4;cursor:not-allowed;transform:none}
.choice .req{float:right;font-size:12px;color:var(--tx2)}
#ending{text-align:center;padding:40px 0}
#ending h2{font-size:30px;font-weight:300;letter-spacing:4px;margin-bottom:8px;
  background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
#gate{position:absolute;inset:0;display:grid;place-items:center;background:rgba(4,6,12,.92);
  opacity:0;pointer-events:none;transition:opacity .4s cubic-bezier(.2,.8,.2,1)}
#gate.on{opacity:1}
#gate div{font-size:40px;letter-spacing:14px;font-weight:300}
#start{position:absolute;inset:0;display:grid;place-items:center;background:var(--bg);z-index:9;cursor:pointer}
#start h1{font-size:32px;font-weight:300;letter-spacing:8px}
#start p{color:var(--tx2);font-size:13px;margin-top:12px}
@media(max-width:640px){#text{font-size:16px}#hud{gap:12px;font-size:11px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style></head><body>
<div id="stage">
  <div id="bg"></div><canvas id="fx"></canvas><div id="veil"></div>
  <div id="hud"></div>
  <div id="body"><div id="panel"><div id="text"></div><div id="choices"></div></div></div>
  <div id="gate"><div></div></div>
  <div id="start"><div style="text-align:center"><h1>${esc(title)}</h1>
    <p>点击开始 · 声音将在首次交互后启用</p></div></div>
</div>
<script>
const SCRIPT=${JSON.stringify(script)};
const ART=${JSON.stringify(art)};
const ATTRS=${JSON.stringify(attrs)};
const SOFT_CAP=100;

// —— 存档：localStorage 自动续玩
const KEY='chenshi:'+${JSON.stringify(title)};
let S=load()||{node:SCRIPT.nodes[0].id,attrs:Object.fromEntries(ATTRS.map(a=>[a,10])),seen:[]};
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch{}}
function load(){try{return JSON.parse(localStorage.getItem(KEY))}catch{return null}}

// —— 软上限：越接近上限，收益越小。防爆表。
function applyEffect(a,delta){
  const cur=S.attrs[a]??0;
  if(delta<=0){S.attrs[a]=Math.max(0,cur+delta);return}
  const room=Math.max(0,SOFT_CAP-cur);
  S.attrs[a]=cur+delta*(0.35+0.65*(room/SOFT_CAP));
}

// —— WebAudio 程序化音频：BGM + 环境音 + 音效。体积不随曲目膨胀。
let AC=null;
function audio(){ if(!AC) AC=new (window.AudioContext||window.webkitAudioContext)(); return AC; }
function chirp(f=880,d=.08,type='sine',g=.05){
  const a=audio(),o=a.createOscillator(),v=a.createGain();
  o.type=type;o.frequency.value=f;v.gain.value=g;
  o.connect(v).connect(a.destination);o.start();
  v.gain.exponentialRampToValueAtTime(.001,a.currentTime+d);
  o.stop(a.currentTime+d);
}
let bgmOn=false;
function startBgm(){
  if(bgmOn)return; bgmOn=true;
  const a=audio(),g=a.createGain();g.gain.value=.018;g.connect(a.destination);
  [110,164.81,220].forEach((f,i)=>{
    const o=a.createOscillator(),lfo=a.createOscillator(),lg=a.createGain();
    o.type='sine';o.frequency.value=f;
    lfo.frequency.value=.05+i*.03;lg.gain.value=2.5;
    lfo.connect(lg).connect(o.frequency);
    o.connect(g);o.start();lfo.start();
  });
}

// —— 天气粒子层（灵动引擎演出能力）
const fx=document.getElementById('fx'),fxc=fx.getContext('2d');
let parts=[],weather=null,raf=0;
function resizeFx(){fx.width=innerWidth;fx.height=innerHeight}
addEventListener('resize',resizeFx);resizeFx();
function setWeather(kind){
  weather=kind;
  parts=kind?Array.from({length:kind==='snow'?90:150},()=>({
    x:Math.random()*fx.width,y:Math.random()*fx.height,
    v:kind==='snow'?.6+Math.random():4+Math.random()*5,
    s:kind==='snow'?1.6+Math.random()*1.6:1
  })):[];
  if(kind&&!raf)loop();
}
function loop(){
  raf=requestAnimationFrame(loop);
  fxc.clearRect(0,0,fx.width,fx.height);
  if(!weather){cancelAnimationFrame(raf);raf=0;return}
  fxc.fillStyle=weather==='snow'?'rgba(255,255,255,.75)':'rgba(160,190,255,.5)';
  for(const p of parts){
    if(weather==='snow'){fxc.beginPath();fxc.arc(p.x,p.y,p.s,0,6.283);fxc.fill();p.x+=Math.sin(p.y/40)*.4}
    else fxc.fillRect(p.x,p.y,1,10);
    p.y+=p.v;
    if(p.y>fx.height){p.y=-10;p.x=Math.random()*fx.width}
  }
}

// —— 演出行解析：cam.zoom / weather.rain / filter.* / audio.*
function runFx(lines){
  setWeather(null);
  document.getElementById('bg').style.transform='';
  for(const l of lines||[]){
    const m=/演出:\\s*(\\w+)\\.(\\w+)\\(([^)]*)\\)/.exec(l); if(!m)continue;
    const [,ns,fn,arg]=m;
    if(ns==='weather')setWeather(fn);
    if(ns==='cam'&&fn==='zoom')document.getElementById('bg').style.transform='scale('+(parseFloat(arg)||1.1)+')';
    if(ns==='audio'&&fn==='sfx')chirp(660,.1,'triangle');
  }
}

// —— 打字机
let typing=null;
function type(el,s){
  clearInterval(typing); el.textContent='';
  let i=0;
  typing=setInterval(()=>{ el.textContent=s.slice(0,++i); if(i>=s.length)clearInterval(typing); },18);
  el.onclick=()=>{clearInterval(typing);el.textContent=s};
}

const node=id=>SCRIPT.nodes.find(n=>n.id===id);
function meets(req){ return Object.entries(req||{}).every(([k,v])=>(S.attrs[k]??0)>=v); }

function render(){
  const n=node(S.node); if(!n)return;
  if(!S.seen.includes(n.id))S.seen.push(n.id);
  for(const [a,d] of Object.entries(n.effects||{})) applyEffect(a,d);

  // GATE：路线触发大字过场
  if(n.gate){
    const g=document.getElementById('gate');
    g.firstElementChild.textContent=n.gate.route;
    g.classList.add('on'); chirp(440,.3,'sine',.03);
    setTimeout(()=>g.classList.remove('on'),1100);
  }

  const bg=document.getElementById('bg');
  if(n.art&&ART[n.art]){ bg.style.backgroundImage='url('+ART[n.art]+')'; bg.classList.add('on'); }
  runFx(n.fx);

  // 每项独立 span，让 #hud 的 flex gap 生效（否则属性会挤成「魅力 13存款 10」）
  document.getElementById('hud').innerHTML=
    ATTRS.map(a=>'<span>'+a+' <b>'+Math.round(S.attrs[a]??0)+'</b></span>').join('')
    +'<span style="margin-left:auto">已见 <b>'+S.seen.length+'</b>/'+SCRIPT.nodes.length+'</span>';

  const t=document.getElementById('text'), c=document.getElementById('choices');
  c.innerHTML='';

  if(n.ending){
    t.textContent='';
    c.innerHTML='<div id="ending"><h2>'+esc(n.ending.name)+'</h2><p style="color:var(--tx2)">'+esc(n.text||'')+'</p>'
      +'<div style="margin-top:22px;display:flex;gap:22px;justify-content:center;font-variant-numeric:tabular-nums">'
      + ATTRS.map(a=>'<div style="font-size:12px;color:var(--tx2)"><b style="display:block;font-size:20px;color:var(--acc)">'
        +Math.round(S.attrs[a]??0)+'</b>'+a+'</div>').join('')
      +'</div><button class="choice" style="margin-top:26px;text-align:center" onclick="restart()">重新开始</button></div>';
    chirp(523,.5,'sine',.04);
    save(); return;
  }

  type(t,n.text||'');
  for(const ch of n.choices||[]){
    const b=document.createElement('button');
    b.className='choice';
    const ok=meets(ch.require);
    b.disabled=!ok;
    b.innerHTML=esc(ch.label)+(Object.keys(ch.require||{}).length
      ?'<span class="req">'+Object.entries(ch.require).map(([k,v])=>k+'≥'+v).join(' · ')+'</span>':'');
    b.onclick=()=>{ chirp(760,.06,'triangle',.04);
      for(const [a,d] of Object.entries(ch.effects||{}))applyEffect(a,d);
      S.node=ch.to; save(); render(); };
    c.appendChild(b);
  }
  save();
}
function restart(){ S={node:SCRIPT.nodes[0].id,attrs:Object.fromEntries(ATTRS.map(a=>[a,10])),seen:[]}; save(); render(); }
function esc(s){ return String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])) }

// 声音礼仪：首拍点击后才启用音频
document.getElementById('start').onclick=()=>{
  document.getElementById('start').remove();
  try{ audio().resume(); startBgm(); }catch{}
  render();
};
</script></body></html>`;

writeFileSync(outPath, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`✓ 编译完成 ${outPath}  ${kb}KB  ${script.nodes.length} 节点  ${Object.keys(art).length} 张内联插画`);
if (Buffer.byteLength(html) > 8 * 1024 * 1024) {
  console.error('✗ 产物超过 8MB 上限');
  process.exit(1);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
