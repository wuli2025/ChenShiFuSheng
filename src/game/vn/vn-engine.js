/* =====================================================================
 * vn-engine.js · 灵动引擎 v2 —— 轻量动效视觉小说内核(零依赖)
 * 数据源: window.VN_PROJECT (vn-compile.js 产物)
 * 素材:   window.ASSET_DATA[name] (单文件导出) 或 ASSET_BASE+name (工作台)
 * 预览:   window.PREVIEW_SCENE = 'sc_xx' 直接从指定场景起播
 * v2 动效: KenBurns+双源视差(鼠标+无操作自动缓漂) / 立绘呼吸·摇晃·姿势交叉淡化·
 *   行走颠动 / 说话景深(背景微失焦) / 镜头(震动·推近·闪白·闪黑) / 水墨晕染转场 /
 *   雨夜闪电+雷声 / 六套粒子 / 电影颗粒 / 四情绪生成式BGM / 入场风声·章节钟声SFX /
 *   Web Speech 分声线配音 / 剧场录屏模式
 * ===================================================================== */
(function(){
"use strict";
var P=window.VN_PROJECT;
if(!P){document.body.innerHTML='<p style="color:#c66;font:16px sans-serif;padding:2em">VN_PROJECT 未加载:请先编译剧本。</p>';return;}
function A(n){return (window.ASSET_DATA&&window.ASSET_DATA[n])||((window.ASSET_BASE||'')+n);}
function $(id){return document.getElementById(id);}
var FILTERS={none:'',night:'brightness(.62) saturate(.8) hue-rotate(-8deg)',sepia:'sepia(.55) brightness(.9)',mist:'blur(2px) brightness(1.05)',gray:'grayscale(1) brightness(.9)'};
var TIER_COLOR={'传奇':'#e3b341','隐藏':'#9d7bd8','悲喜':'#b8524f','普通':'#7c8b96'};

/* ===================== CSS ===================== */
var css=''
+'html,body{margin:0;height:100%;background:#0b0f14;overflow:hidden;font-family:"KaiTi","STKaiti","Kaiti SC",serif;-webkit-user-select:none;user-select:none}'
+'#stageWrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}'
+'#stage{position:relative;aspect-ratio:16/9;width:min(100vw,177.78vh);container-type:size;overflow:hidden;background:#000}'
+'#cam{position:absolute;inset:0;will-change:transform}'
+'.bgw{position:absolute;inset:-4%;opacity:0;will-change:transform}'
+'.bgw.on{opacity:1}'
+'.bgw img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;will-change:transform,filter;transition:filter .7s ease}'
+'#sprLayer{position:absolute;inset:0;will-change:transform}'
+'.spr{position:absolute;bottom:-2cqh;height:74cqh;transform:translateX(-50%);transition:left 1.15s cubic-bezier(.45,0,.25,1),opacity .6s,filter .5s;will-change:transform,filter}'
+'.spr .swayer{height:100%;animation:sway 5.6s ease-in-out infinite alternate;transform-origin:50% 100%}'
+'.spr .breather{height:100%;animation:breath 3.4s ease-in-out infinite alternate;transform-origin:50% 100%}'
+'.spr .imgbox{position:relative;height:100%}'
+'.spr img{height:100%;display:block;-webkit-user-drag:none;filter:drop-shadow(0 1.2cqh 2.4cqh rgba(0,0,0,.55))}'
+'.spr img.b{position:absolute;left:0;top:0;opacity:0;transition:opacity .38s ease}'
+'.spr.dim{filter:brightness(.7) saturate(.85)}'
+'.spr.talk .breather{animation:talkbob .42s ease-in-out infinite alternate}'
+'.spr.walk .breather{animation:walkbob .3s ease-in-out infinite alternate}'
+'.spr.enterL{animation:inL 1s cubic-bezier(.3,.7,.3,1) both}'
+'.spr.enterR{animation:inR 1s cubic-bezier(.3,.7,.3,1) both}'
+'.spr.enterF{animation:inF 1.1s ease both}'
+'.spr.out{opacity:0!important;transition:opacity .7s}'
+'@keyframes breath{from{transform:translateY(0) scaleY(1)}to{transform:translateY(-.55cqh) scaleY(1.008)}}'
+'@keyframes sway{from{transform:rotate(-.42deg)}to{transform:rotate(.42deg)}}'
+'@keyframes talkbob{from{transform:translateY(0)}to{transform:translateY(-.85cqh)}}'
+'@keyframes walkbob{from{transform:translateY(0)}to{transform:translateY(-1.1cqh)}}'
+'@keyframes inL{from{opacity:0;transform:translateX(-150%)}to{opacity:1;transform:translateX(-50%)}}'
+'@keyframes inR{from{opacity:0;transform:translateX(50%)}to{opacity:1;transform:translateX(-50%)}}'
+'@keyframes inF{from{opacity:0;transform:translateX(-50%) translateY(3cqh)}to{opacity:1;transform:translateX(-50%) translateY(0)}}'
+'#fx,#grain{position:absolute;inset:0;pointer-events:none}'
+'#grain{opacity:.045;mix-blend-mode:overlay}'
+'#vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 52%,rgba(4,8,14,.55) 100%)}'
+'#flash{position:absolute;inset:0;pointer-events:none;opacity:0;z-index:35}'
+'.bar{position:absolute;left:0;right:0;height:0;background:#000;z-index:40;transition:height .9s cubic-bezier(.6,0,.3,1)}'
+'#barT{top:0}#barB{bottom:0}'
+'body.theater .bar{height:7.2cqh}'
+'body.theater #ctrl,body.theater #more{opacity:0;pointer-events:none}'
+'body.theater{cursor:none}'
+'#chap{position:absolute;left:0;right:0;top:37%;text-align:center;color:#e9e6dd;font-size:7cqh;letter-spacing:1.2em;text-indent:1.2em;text-shadow:0 2px 18px rgba(0,0,0,.8);opacity:0;pointer-events:none;z-index:30;transition:opacity .9s ease,letter-spacing 2.4s ease,text-indent 2.4s ease}'
+'#chap.on{opacity:1;letter-spacing:.42em;text-indent:.42em}'
+'#dlg{position:absolute;left:5%;right:5%;bottom:4%;background:linear-gradient(160deg,rgba(14,20,28,.86),rgba(14,20,28,.72));border:1px solid rgba(255,255,255,.14);border-radius:1.4cqh;padding:1.6% 2.4% 1.9%;color:#e9e6dd;cursor:pointer;backdrop-filter:blur(4px);z-index:20;box-shadow:0 1cqh 4cqh rgba(0,0,0,.4);transition:opacity .5s}'
+'#dlg.hide{opacity:0;pointer-events:none}'
+'#who{display:inline-block;background:#2c4661;color:#f0ede4;padding:.12em .9em;border-radius:.5cqh;font-size:2.9cqh;margin-bottom:1cqh;letter-spacing:.18em}'
+'#who.narr{background:#4a5a50}#who.f{background:#54405e}'
+'#txt{font-size:3.5cqh;line-height:1.8;min-height:12.6cqh;letter-spacing:.06em;text-shadow:0 1px 6px rgba(0,0,0,.5)}'
+'#more{text-align:right;font-size:2.1cqh;opacity:.5;transition:opacity .4s}'
+'#choices{position:absolute;left:14%;right:14%;bottom:26%;display:none;flex-direction:column;gap:1.6cqh;z-index:25}'
+'#choices.on{display:flex;animation:chIn .5s ease both}'
+'@keyframes chIn{from{opacity:0;transform:translateY(2cqh)}to{opacity:1;transform:translateY(0)}}'
+'.chq{color:#cfd8dc;font-size:2.7cqh;letter-spacing:.2em;text-align:center;text-shadow:0 1px 8px rgba(0,0,0,.8);margin-bottom:.4cqh}'
+'.chopt{background:linear-gradient(160deg,rgba(24,34,46,.88),rgba(16,24,34,.78));border:1px solid rgba(255,255,255,.2);border-radius:1cqh;color:#e9e6dd;font-family:inherit;font-size:3cqh;letter-spacing:.12em;padding:1.5cqh 3cqh;cursor:pointer;backdrop-filter:blur(4px);transition:transform .2s,background .2s,border-color .2s;text-align:center}'
+'.chopt:hover{transform:translateY(-.3cqh);background:rgba(44,70,97,.85);border-color:rgba(227,179,65,.4)}'
+'#ctrl{position:absolute;top:2.2cqh;right:2.4cqh;display:flex;gap:1cqh;z-index:50;transition:opacity .4s}'
+'.cbtn{background:rgba(14,20,28,.72);border:1px solid rgba(255,255,255,.16);color:#cfd8dc;font-family:inherit;font-size:2.3cqh;letter-spacing:.12em;padding:.7cqh 1.6cqh;border-radius:.7cqh;cursor:pointer;backdrop-filter:blur(3px)}'
+'.cbtn:hover{background:rgba(44,70,97,.85);color:#fff}'
+'.cbtn.off{opacity:.45;text-decoration:line-through}'
+'#title{position:absolute;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3cqh;background:rgba(6,10,16,.5);backdrop-filter:blur(2px);transition:opacity 1s}'
+'#title.gone{opacity:0;pointer-events:none}'
+'#title h1{margin:0;color:#e9e6dd;font-size:8cqh;letter-spacing:.4em;text-indent:.4em;text-shadow:0 3px 24px rgba(0,0,0,.9);font-weight:400}'
+'#title p{margin:0;color:#9fb0bd;font-size:2.6cqh;letter-spacing:.3em}'
+'#title .go{margin-top:2cqh;display:flex;gap:2.4cqh}'
+'.tbtn{background:rgba(44,70,97,.8);border:1px solid rgba(255,255,255,.25);color:#f0ede4;font-family:inherit;font-size:3.1cqh;letter-spacing:.3em;text-indent:.3em;padding:1.5cqh 4.4cqh;border-radius:1cqh;cursor:pointer}'
+'.tbtn:hover{background:#2c4661}'
+'.tbtn.ghost{background:rgba(14,20,28,.6)}'
+'#hintbar{color:#7c8b96;font-size:2cqh;letter-spacing:.15em;margin-top:1.2cqh}'
+'#endCard{position:absolute;inset:0;z-index:55;display:none;flex-direction:column;align-items:center;justify-content:center;gap:2.6cqh;background:rgba(6,10,16,.72);backdrop-filter:blur(3px)}'
+'#endCard.on{display:flex;animation:chIn .9s ease both}'
+'#endTier{font-size:2.6cqh;letter-spacing:.5em;text-indent:.5em;padding:.4cqh 2cqh;border:1px solid;border-radius:.6cqh}'
+'#endName{color:#e9e6dd;font-size:6.4cqh;letter-spacing:.3em;text-indent:.3em;text-shadow:0 3px 24px rgba(0,0,0,.9)}'
+'#endEpi{color:#b9c6cf;font-size:3cqh;letter-spacing:.2em;max-width:70%;text-align:center;line-height:2}'
+'#pvGate{position:absolute;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(6,10,16,.55);cursor:pointer}'
+'#pvGate span{color:#e9e6dd;font-size:3.4cqh;letter-spacing:.3em;border:1px solid rgba(255,255,255,.3);border-radius:1cqh;padding:1.6cqh 4cqh;background:rgba(14,20,28,.8)}'
;
var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

/* ===================== DOM ===================== */
document.body.innerHTML='<div id="stageWrap"><div id="stage">'
+'<div id="cam">'
+'<div class="bgw" id="bgA"><img></div><div class="bgw" id="bgB"><img></div>'
+'<div id="sprLayer"></div>'
+'<canvas id="fx"></canvas><div id="grain"></div><div id="vig"></div>'
+'</div>'
+'<div id="flash"></div>'
+'<div id="chap"></div>'
+'<div class="bar" id="barT"></div><div class="bar" id="barB"></div>'
+'<div id="choices"></div>'
+'<div id="dlg" class="hide"><span id="who"></span><div id="txt"></div><div id="more">▼ 点击 / 空格 继续</div></div>'
+'<div id="endCard"><span id="endTier"></span><div id="endName"></div><div id="endEpi"></div>'
+'<div class="go"><button class="tbtn" id="endRe">重新开始</button><button class="tbtn ghost" id="endHome">回到扉页</button></div></div>'
+'<div id="ctrl">'
+'<button class="cbtn" id="bAuto">自动</button><button class="cbtn" id="bVoice">配音</button>'
+'<button class="cbtn" id="bAmb">音效</button><button class="cbtn" id="bTheater">剧场</button>'
+'</div>'
+'<div id="title"><h1></h1><p></p>'
+'<div class="go"><button class="tbtn" id="goPlay">开 始</button><button class="tbtn ghost" id="goRec">剧场模式（录屏）</button></div>'
+'<div id="hintbar">空格/点击推进 · A 自动 · T 剧场 · V 配音 · M 音效</div>'
+'</div>'
+'</div></div>';
var stage=$('stage'),cam=$('cam'),sprLayer=$('sprLayer'),dlg=$('dlg'),whoEl=$('who'),txtEl=$('txt'),moreEl=$('more'),chapEl=$('chap');
document.addEventListener('error',function(e){var t=e.target;if(t&&t.tagName==='IMG')t.style.visibility='hidden';},true);
$('title').querySelector('h1').textContent=P.meta.title||'无题';
$('title').querySelector('p').textContent=P.meta.subtitle||'';

/* ===================== 视差(鼠标 + 自动缓漂) ===================== */
var par={x:0,y:0,tx:0,ty:0},lastMove=0;
stage.addEventListener('pointermove',function(e){
  var r=stage.getBoundingClientRect();
  par.tx=((e.clientX-r.left)/r.width-.5)*2;par.ty=((e.clientY-r.top)/r.height-.5)*2;lastMove=Date.now();
});
stage.addEventListener('pointerleave',function(){par.tx=0;par.ty=0;});
(function parLoop(t){
  if(Date.now()-lastMove>3000){ /* 无操作:自动缓漂,录屏时画面也活着 */
    var s=(t||0)/1000;par.tx=Math.sin(s*.11)*.55;par.ty=Math.cos(s*.07)*.35;
  }
  par.x+=(par.tx-par.x)*.04;par.y+=(par.ty-par.y)*.04;
  var bx=(par.x*1.1).toFixed(3),by=(par.y*.7).toFixed(3);
  $('bgA').style.transform='translate('+bx+'%,'+by+'%)';
  $('bgB').style.transform='translate('+bx+'%,'+by+'%)';
  sprLayer.style.transform='translate('+(-par.x*1.6)+'%,'+(-par.y*.9)+'%)';
  requestAnimationFrame(parLoop);
})(0);

/* ===================== 背景 + 水墨晕染转场 + 景深 ===================== */
var bgCur=0,kbAnims=[null,null],curBgFile=null,curFilter='none',focusOn=false;
function bgFilterStr(){return (FILTERS[curFilter]||'')+(focusOn?' blur(1.4px) brightness(.94)':'');}
function applyBgFilter(){var img=[$('bgA'),$('bgB')][bgCur].querySelector('img');img.style.filter=bgFilterStr();}
function setFocus(on){if(focusOn===on)return;focusOn=on;applyBgFilter();}
function setBg(file,filter,ink){
  curFilter=filter||'none';
  if(file===curBgFile){applyBgFilter();return;}
  curBgFile=file;
  var wraps=[$('bgA'),$('bgB')],next=1-bgCur,w=wraps[next],img=w.querySelector('img');
  img.style.visibility='';img.src=A(file);img.style.filter=bgFilterStr();
  if(kbAnims[next])kbAnims[next].cancel();
  var dx=(Math.random()*2-1)*2.2,dy=(Math.random()*2-1)*1.4;
  if(img.animate)kbAnims[next]=img.animate([
    {transform:'scale(1.07) translate(0,0)'},
    {transform:'scale(1.15) translate('+dx.toFixed(2)+'%,'+dy.toFixed(2)+'%)'}
  ],{duration:26000,direction:'alternate',iterations:Infinity,easing:'ease-in-out'});
  w.classList.add('on');
  if(ink&&w.animate){ /* 水墨晕染:圆形遮罩自随机点扩散 */
    var cx=20+Math.random()*60,cy=25+Math.random()*50;
    w.animate([{clipPath:'circle(0% at '+cx+'% '+cy+'%)'},{clipPath:'circle(145% at '+cx+'% '+cy+'%)'}],
      {duration:1150,easing:'cubic-bezier(.4,.1,.3,1)'});
  }else{w.style.transition='opacity 1.2s ease';}
  var prev=wraps[bgCur];
  setTimeout(function(){prev.classList.remove('on');},ink?1150:1200);
  bgCur=next;
}

/* ===================== 粒子 ===================== */
var fxc=$('fx'),fxx=fxc.getContext('2d'),fxMode='none',parts=[];
function fxResize(){fxc.width=stage.clientWidth;fxc.height=stage.clientHeight;}
window.addEventListener('resize',fxResize);
function setFx(mode){
  if(mode===fxMode)return;
  fxMode=mode;parts=[];fxResize();
  var W=fxc.width,H=fxc.height,i;
  if(mode==='rain')for(i=0;i<130;i++)parts.push({x:Math.random()*W,y:Math.random()*H,l:H*.02+Math.random()*H*.03,s:H*.012+Math.random()*H*.01,o:.12+Math.random()*.25});
  if(mode==='motes')for(i=0;i<55;i++)parts.push({x:Math.random()*W,y:Math.random()*H,r:1+Math.random()*2.6,a:Math.random()*7,sp:.12+Math.random()*.3,o:Math.random()});
  if(mode==='embers')for(i=0;i<70;i++)parts.push({x:Math.random()*W,y:H*.55+Math.random()*H*.45,r:.8+Math.random()*2.2,vy:.25+Math.random()*.9,vx:(Math.random()-.3)*.4,o:Math.random(),hot:Math.random()<.35});
  if(mode==='fireflies')for(i=0;i<26;i++)parts.push({x:Math.random()*W,y:H*.3+Math.random()*H*.65,a:Math.random()*7,sp:.2+Math.random()*.35,o:Math.random()*7,r:1.2+Math.random()*1.6});
  if(mode==='snow')for(i=0;i<90;i++)parts.push({x:Math.random()*W,y:Math.random()*H,r:1+Math.random()*2.4,s:H*.0012+Math.random()*H*.0022,a:Math.random()*7,o:.25+Math.random()*.5});
  if(mode==='petals')for(i=0;i<38;i++)parts.push({x:Math.random()*W,y:Math.random()*H,r:2.2+Math.random()*3,s:H*.0016+Math.random()*H*.002,a:Math.random()*7,rot:Math.random()*7,o:.3+Math.random()*.4});
}
(function fxLoop(){
  var W=fxc.width,H=fxc.height;
  fxx.clearRect(0,0,W,H);
  var i,p,g,al;
  if(fxMode==='rain'){
    fxx.strokeStyle='rgba(190,210,230,1)';fxx.lineWidth=Math.max(1,H/900);
    for(i=0;i<parts.length;i++){p=parts[i];
      fxx.globalAlpha=p.o;fxx.beginPath();fxx.moveTo(p.x,p.y);fxx.lineTo(p.x-p.l*.14,p.y+p.l);fxx.stroke();
      p.y+=p.s;p.x-=p.s*.14;if(p.y>H){p.y=-p.l;p.x=Math.random()*(W*1.1);}}
  }else if(fxMode==='motes'){
    for(i=0;i<parts.length;i++){p=parts[i];
      p.a+=.008;p.x+=Math.cos(p.a)*p.sp;p.y-=p.sp*.55;p.o+=.008;
      if(p.y<-6){p.y=H+6;p.x=Math.random()*W;}
      al=.14+Math.abs(Math.sin(p.o))*.3;
      g=fxx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*3.2);
      g.addColorStop(0,'rgba(255,240,200,'+al+')');g.addColorStop(1,'rgba(255,240,200,0)');
      fxx.globalAlpha=1;fxx.fillStyle=g;fxx.beginPath();fxx.arc(p.x,p.y,p.r*3.2,0,7);fxx.fill();}
  }else if(fxMode==='embers'){
    for(i=0;i<parts.length;i++){p=parts[i];
      p.y-=p.vy;p.x+=p.vx+Math.sin(p.y*.02)*.3;p.o+=.012;
      if(p.y<H*.18){p.y=H+8;p.x=Math.random()*W;}
      al=.1+Math.abs(Math.sin(p.o))*(p.hot?.5:.22);
      fxx.globalAlpha=al;fxx.fillStyle=p.hot?'#ffb26b':'#cfd8dc';
      fxx.beginPath();fxx.arc(p.x,p.y,p.r,0,7);fxx.fill();}
  }else if(fxMode==='fireflies'){
    for(i=0;i<parts.length;i++){p=parts[i];
      p.a+=.006;p.x+=Math.cos(p.a*1.3)*p.sp;p.y+=Math.sin(p.a)*p.sp*.6;p.o+=.02;
      if(p.x<-8)p.x=W+8;if(p.x>W+8)p.x=-8;
      al=Math.max(0,Math.sin(p.o))*.7;
      g=fxx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*4);
      g.addColorStop(0,'rgba(190,255,140,'+al+')');g.addColorStop(1,'rgba(190,255,140,0)');
      fxx.globalAlpha=1;fxx.fillStyle=g;fxx.beginPath();fxx.arc(p.x,p.y,p.r*4,0,7);fxx.fill();}
  }else if(fxMode==='snow'){
    fxx.fillStyle='#e8eef4';
    for(i=0;i<parts.length;i++){p=parts[i];
      p.a+=.01;p.y+=p.s;p.x+=Math.sin(p.a)*.5;
      if(p.y>H+4){p.y=-4;p.x=Math.random()*W;}
      fxx.globalAlpha=p.o;fxx.beginPath();fxx.arc(p.x,p.y,p.r,0,7);fxx.fill();}
  }else if(fxMode==='petals'){
    fxx.fillStyle='#e8b4c8';
    for(i=0;i<parts.length;i++){p=parts[i];
      p.a+=.012;p.rot+=.03;p.y+=p.s;p.x+=Math.sin(p.a)*.9+.25;
      if(p.y>H+6){p.y=-6;p.x=Math.random()*W;}
      fxx.globalAlpha=p.o;fxx.save();fxx.translate(p.x,p.y);fxx.rotate(p.rot);
      fxx.beginPath();fxx.ellipse(0,0,p.r,p.r*.55,0,0,7);fxx.fill();fxx.restore();}
  }
  fxx.globalAlpha=1;
  requestAnimationFrame(fxLoop);
})();

/* ===================== 电影颗粒 ===================== */
(function grain(){
  var tiles=[],k;
  for(k=0;k<3;k++){
    var c=document.createElement('canvas');c.width=c.height=128;
    var x=c.getContext('2d'),d=x.createImageData(128,128);
    for(var i=0;i<d.data.length;i+=4){var v=Math.random()*255|0;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;}
    x.putImageData(d,0,0);tiles.push('url('+c.toDataURL()+')');
  }
  var g=$('grain'),ix=0;
  g.style.backgroundSize='128px 128px';
  setInterval(function(){ix=(ix+1)%3;g.style.backgroundImage=tiles[ix];},130);
})();

/* ===================== 镜头动作 ===================== */
function camAct(kind){
  if(!cam.animate)return;
  if(kind==='shake'){
    var kf=[{transform:'translate(0,0)'}];
    for(var i=0;i<6;i++)kf.push({transform:'translate('+((Math.random()*2-1)*.9).toFixed(2)+'%,'+((Math.random()*2-1)*.7).toFixed(2)+'%)'});
    kf.push({transform:'translate(0,0)'});
    cam.animate(kf,{duration:480,easing:'ease-out'});
  }else if(kind==='punch'){
    cam.animate([{transform:'scale(1)'},{transform:'scale(1.05)',offset:.35},{transform:'scale(1.045)',offset:.75},{transform:'scale(1)'}],{duration:1600,easing:'cubic-bezier(.3,.6,.3,1)'});
  }else if(kind==='flashw'||kind==='flashb'){
    var f=$('flash');f.style.background=kind==='flashw'?'#fff':'#000';
    f.animate([{opacity:0},{opacity:kind==='flashw'?.9:1,offset:.18},{opacity:0}],{duration:kind==='flashw'?520:900,easing:'ease-out'});
  }
}

/* ===================== WebAudio: 环境音 / BGM / SFX ===================== */
var AC=null,master=null,ambGain=null,ambStops=[],ambOn=true,curAmb='none';
var bgmOn=true,bgmStops=[],curBgm='none';
function ac(){
  if(AC)return AC;
  AC=new (window.AudioContext||window.webkitAudioContext)();
  master=AC.createGain();master.gain.value=.9;master.connect(AC.destination);
  ambGain=AC.createGain();ambGain.gain.value=1;ambGain.connect(master);
  return AC;
}
var _nbuf={};
function noiseBuf(pink){
  var key=pink?'p':'w';if(_nbuf[key])return _nbuf[key];
  var c=ac(),len=c.sampleRate*2,b=c.createBuffer(1,len,c.sampleRate),d=b.getChannelData(0);
  var b0=0,b1=0,b2=0;
  for(var i=0;i<len;i++){var w=Math.random()*2-1;
    if(pink){b0=.997*b0+.0299*w;b1=.985*b1+.0785*w;b2=.95*b2+.169*w;d[i]=(b0+b1+b2+w*.05)*.35;}
    else d[i]=w*.5;}
  _nbuf[key]=b;return b;
}
function mkNoise(pink,type,freq,q,vol,dest){
  var c=ac(),src=c.createBufferSource();src.buffer=noiseBuf(pink);src.loop=true;
  var f=c.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q||.7;
  var g=c.createGain();g.gain.value=vol;
  src.connect(f);f.connect(g);g.connect(dest||ambGain);src.start();
  return {src:src,f:f,g:g};
}
function lfo(param,base,amp,hz){
  var c=ac(),o=c.createOscillator(),g=c.createGain();
  o.frequency.value=hz;g.gain.value=amp;param.value=base;
  o.connect(g);g.connect(param);o.start();return o;
}
function plink(freq,dur,vol,pan){
  var c=ac(),o=c.createOscillator(),g=c.createGain(),p=c.createStereoPanner?c.createStereoPanner():null;
  o.type='sine';o.frequency.setValueAtTime(freq,c.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(60,freq*.4),c.currentTime+dur);
  g.gain.setValueAtTime(vol,c.currentTime);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+dur);
  o.connect(g);if(p){p.pan.value=pan||0;g.connect(p);p.connect(ambGain);}else g.connect(ambGain);
  o.start();o.stop(c.currentTime+dur+.05);
}
function chirp(base,pan){
  var c=ac(),o=c.createOscillator(),g=c.createGain(),p=c.createStereoPanner?c.createStereoPanner():null;
  var t=c.currentTime;o.type='sine';
  o.frequency.setValueAtTime(base,t);o.frequency.linearRampToValueAtTime(base*1.35,t+.05);o.frequency.linearRampToValueAtTime(base*.9,t+.1);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.05,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+.13);
  o.connect(g);if(p){p.pan.value=pan;g.connect(p);p.connect(ambGain);}else g.connect(ambGain);
  o.start(t);o.stop(t+.2);
}
function sfxWhoosh(){
  if(!ambOn||!AC)return;
  var c=ac(),src=c.createBufferSource();src.buffer=noiseBuf(false);
  var f=c.createBiquadFilter();f.type='bandpass';f.Q.value=1.2;
  var t=c.currentTime;
  f.frequency.setValueAtTime(300,t);f.frequency.exponentialRampToValueAtTime(1900,t+.28);
  var g=c.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.09,t+.06);g.gain.exponentialRampToValueAtTime(.0001,t+.4);
  src.connect(f);f.connect(g);g.connect(master);src.start(t);src.stop(t+.45);
}
function sfxGong(){
  if(!ambOn||!AC)return;
  var c=ac(),t=c.currentTime;
  [523.25,659.25,784].forEach(function(fq,i){
    var o=c.createOscillator(),g=c.createGain();
    o.type='sine';o.frequency.value=fq*(1+(Math.random()-.5)*.004);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.05-i*.012,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+2.6);
    o.connect(g);g.connect(master);o.start(t+i*.03);o.stop(t+2.8);
  });
}
function sfxThunder(){
  if(!ambOn||!AC)return;
  var c=ac(),src=c.createBufferSource();src.buffer=noiseBuf(true);
  var f=c.createBiquadFilter();f.type='lowpass';
  var t=c.currentTime,dur=1.4+Math.random()*.9;
  f.frequency.setValueAtTime(420,t);f.frequency.exponentialRampToValueAtTime(90,t+dur);
  var g=c.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.34,t+.09);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  src.connect(f);f.connect(g);g.connect(master);src.start(t);src.stop(t+dur+.1);
}
function stopAmb(){ambStops.forEach(function(f){try{f();}catch(e){}});ambStops=[];}
var lightningTimer=null;
function stopLightning(){if(lightningTimer){clearTimeout(lightningTimer);lightningTimer=null;}}
function scheduleLightning(){
  stopLightning();
  lightningTimer=setTimeout(function(){
    if(fxMode==='rain'&&curAmb==='rain'){
      var f=$('flash');f.style.background='#dfe9ff';
      if(f.animate)f.animate([{opacity:0},{opacity:.55,offset:.1},{opacity:.08,offset:.3},{opacity:.7,offset:.45},{opacity:0}],{duration:700,easing:'ease-out'});
      setTimeout(sfxThunder,300+Math.random()*600);
    }
    scheduleLightning();
  },6000+Math.random()*9000);
}
function startAmb(kind){
  if(kind===curAmb&&ambStops.length)return;
  curAmb=kind;stopAmb();stopLightning();
  if(!ambOn||!AC||kind==='none')return;
  if(kind==='rain'){
    var hiss=mkNoise(false,'bandpass',3800,.6,.16);
    var rum=mkNoise(true,'lowpass',240,.7,.14);
    lfo(rum.g.gain,.14,.05,.07);
    var t1=setInterval(function(){if(Math.random()<.75)plink(900+Math.random()*1600,.1+Math.random()*.12,.02+Math.random()*.035,Math.random()*2-1);},260);
    ambStops.push(function(){hiss.src.stop();rum.src.stop();clearInterval(t1);});
    scheduleLightning();
  }else if(kind==='garden'){
    var wind=mkNoise(true,'bandpass',520,.9,.13);
    lfo(wind.f.frequency,520,260,.05);lfo(wind.g.gain,.13,.06,.08);
    var t2=setInterval(function(){
      if(Math.random()<.62){var base=2100+Math.random()*1400,pan=Math.random()*2-1,n=2+Math.floor(Math.random()*3);
        for(var i=0;i<n;i++)setTimeout(function(){chirp(base*(0.92+Math.random()*.16),pan);},i*130+Math.random()*40);}
    },1900);
    ambStops.push(function(){wind.src.stop();clearInterval(t2);});
  }else if(kind==='sea'){
    var waves=mkNoise(true,'lowpass',420,.6,.0001);lfo(waves.g.gain,.16,.12,.09);
    var wind2=mkNoise(true,'bandpass',700,.8,.07);lfo(wind2.f.frequency,700,300,.04);
    var c=ac(),ro=c.createOscillator(),rg=c.createGain();
    ro.type='sine';ro.frequency.value=44;rg.gain.value=.05;lfo(rg.gain,.05,.025,.11);
    ro.connect(rg);rg.connect(ambGain);ro.start();
    ambStops.push(function(){waves.src.stop();wind2.src.stop();ro.stop();});
  }else if(kind==='city'){
    var hum=mkNoise(true,'lowpass',300,.6,.12);lfo(hum.g.gain,.12,.04,.05);
    var hiss2=mkNoise(false,'bandpass',2400,.4,.028);
    var t3=setInterval(function(){if(Math.random()<.2)plink(340+Math.random()*300,.5,.012,Math.random()*2-1);},2400);
    ambStops.push(function(){hum.src.stop();hiss2.src.stop();clearInterval(t3);});
  }else if(kind==='night'){
    var base=mkNoise(true,'lowpass',200,.6,.07);
    var t4=setInterval(function(){ /* 蟋蟀:高频快速三连 */
      if(Math.random()<.7){var pan=Math.random()*2-1;
        for(var i=0;i<3;i++)setTimeout(function(){chirp(4200+Math.random()*400,pan);},i*90);}
    },1400);
    ambStops.push(function(){base.src.stop();clearInterval(t4);});
  }else if(kind==='wind'){
    var w1=mkNoise(true,'bandpass',480,.8,.15);
    lfo(w1.f.frequency,480,320,.04);lfo(w1.g.gain,.15,.08,.06);
    ambStops.push(function(){w1.src.stop();});
  }
}
/* ---- BGM 四情绪 ---- */
function stopBgm(){bgmStops.forEach(function(f){try{f();}catch(e){}});bgmStops=[];curBgm='none';}
function startBgm(mood){
  if(mood===curBgm)return;
  stopBgm();curBgm=mood||'calm';
  if(!bgmOn||!AC||curBgm==='none')return;
  var c=ac(),dl=c.createDelay(1),fb=c.createGain(),lp=c.createBiquadFilter(),out=c.createGain();
  dl.delayTime.value=.42;fb.gain.value=.34;lp.type='lowpass';lp.frequency.value=2400;out.gain.value=.5;
  dl.connect(fb);fb.connect(lp);lp.connect(dl);dl.connect(out);out.connect(master);
  bgmStops.push(function(){out.disconnect();});
  function pluck(base,scale,type,vol,dur){
    var f=base*scale[Math.floor(Math.random()*scale.length)]*(Math.random()<.25?2:1);
    var o=c.createOscillator(),g=c.createGain(),t=c.currentTime;
    o.type=type;o.frequency.value=f;
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g);g.connect(master);g.connect(dl);o.start(t);o.stop(t+dur+.1);
  }
  var iv;
  if(curBgm==='calm'){
    iv=setInterval(function(){if(Math.random()<.72)pluck(196,[1,9/8,5/4,3/2,5/3,2,9/4],'triangle',.05,2.1);},2100);
  }else if(curBgm==='warm'){
    iv=setInterval(function(){if(Math.random()<.8)pluck(220,[1,9/8,5/4,3/2,5/3,2],'sine',.055,1.8);},1650);
  }else if(curBgm==='tense'){
    var d1=c.createOscillator(),d2=c.createOscillator(),df=c.createBiquadFilter(),dg=c.createGain();
    d1.type='sawtooth';d2.type='sawtooth';d1.frequency.value=55;d2.frequency.value=55.7;
    df.type='lowpass';df.frequency.value=220;dg.gain.value=.05;
    lfo(dg.gain,.05,.02,.05);
    d1.connect(df);d2.connect(df);df.connect(dg);dg.connect(master);d1.start();d2.start();
    bgmStops.push(function(){d1.stop();d2.stop();});
    iv=setInterval(function(){if(Math.random()<.5)pluck(147,[1,6/5,4/3,3/2,9/5],'triangle',.04,2.6);},3000);
  }else if(curBgm==='epic'){
    var chords=[[1,5/4,3/2],[5/6,1,5/4],[2/3,5/6,1],[3/4,15/16,9/8]],ci=0,padStops=[];
    function pad(){
      padStops.forEach(function(f){f();});padStops=[];
      var ch=chords[ci%chords.length];ci++;
      ch.forEach(function(r){
        var o=c.createOscillator(),g=c.createGain(),t=c.currentTime;
        o.type='triangle';o.frequency.value=110*r;
        g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.035,t+1.6);g.gain.linearRampToValueAtTime(.02,t+5.4);g.gain.linearRampToValueAtTime(.0001,t+6.4);
        o.connect(g);g.connect(master);o.start(t);o.stop(t+6.6);
        padStops.push(function(){try{o.stop();}catch(e){}});
      });
    }
    pad();var pv=setInterval(pad,6200);
    var dv=setInterval(function(){ /* 深鼓 */
      var o=c.createOscillator(),g=c.createGain(),t=c.currentTime;
      o.type='sine';o.frequency.setValueAtTime(88,t);o.frequency.exponentialRampToValueAtTime(42,t+.28);
      g.gain.setValueAtTime(.16,t);g.gain.exponentialRampToValueAtTime(.0001,t+.5);
      o.connect(g);g.connect(master);o.start(t);o.stop(t+.55);
    },3200);
    bgmStops.push(function(){clearInterval(pv);clearInterval(dv);padStops.forEach(function(f){f();});});
  }
  if(iv)bgmStops.push(function(){clearInterval(iv);});
}

/* ===================== 配音 ===================== */
var voiceOn=true,voices=[];
function loadVoices(){voices=window.speechSynthesis?speechSynthesis.getVoices():[];}
if(window.speechSynthesis){loadVoices();speechSynthesis.onvoiceschanged=loadVoices;}
function pickVoice(kind){
  var zh=voices.filter(function(v){return /zh|CN|中文/i.test(v.lang+v.name);});
  if(!zh.length)return null;
  function find(names){for(var i=0;i<names.length;i++){var hit=zh.filter(function(v){return v.name.indexOf(names[i])>=0;})[0];if(hit)return hit;}return null;}
  if(kind==='m')return find(['Yunxi','Yunjian','Yunyang','Kangkang'])||zh[0];
  if(kind==='f')return find(['Xiaoxiao','Xiaoyi','Huihui','Yaoyao'])||zh[0];
  return find(['Yunyang','Xiaoxiao','Huihui'])||zh[0];
}
function speak(text,kind,cb){
  var done=false;function fin(){if(done)return;done=true;cb&&cb();}
  if(!voiceOn||!window.speechSynthesis){fin();return fin;}
  try{speechSynthesis.cancel();}catch(e){}
  var u=new SpeechSynthesisUtterance(String(text).replace(/[「」『』——]/g,''));
  var vv=pickVoice(kind);if(vv)u.voice=vv;
  u.lang='zh-CN';u.rate=kind==='narr'?.98:1.04;u.pitch=kind==='f'?1.12:(kind==='m'?.92:1);
  u.onend=fin;u.onerror=fin;
  setTimeout(fin,Math.max(2500,text.length*260)+1500);
  speechSynthesis.speak(u);
  return function(){try{speechSynthesis.cancel();}catch(e){}fin();};
}

/* ===================== 立绘 ===================== */
var charsOn={}; /* 角色名 -> {el,imgA,imgB,front:'a'|'b',pose,x} */
function sprFile(who,pose){
  var c=P.chars[who];if(!c)return null;
  return c.poses[pose||'默认']||c.poses['默认']||c.poses[Object.keys(c.poses)[0]];
}
function addChar(who,pose,x,enter){
  var el=document.createElement('div');el.className='spr';
  el.innerHTML='<div class="swayer"><div class="breather"><div class="imgbox"><img class="a"><img class="b"></div></div></div>';
  var ia=el.querySelector('img.a');
  ia.src=A(sprFile(who,pose));
  el.style.left=x+'%';
  el.querySelector('.swayer').style.animationDelay=(Math.random()*3)+'s';
  el.querySelector('.breather').style.animationDelay=(Math.random()*2)+'s';
  el.classList.add(enter==='left'?'enterL':(enter==='right'?'enterR':'enterF'));
  sprLayer.appendChild(el);
  charsOn[who]={el:el,front:'a',pose:pose||'默认',x:x};
  sfxWhoosh();
  setTimeout(function(){el.classList.remove('enterL','enterR','enterF');},1150);
}
function removeChar(who){
  var o=charsOn[who];if(!o)return;
  o.el.classList.add('out');delete charsOn[who];
  setTimeout(function(){o.el.remove();},750);
}
function clearChars(){Object.keys(charsOn).forEach(removeChar);}
function setPose(who,pose){
  /* 交叉淡化:img.b 顶层淡入新姿势,落定后回写到 img.a 底层再隐掉顶层 */
  var o=charsOn[who];if(!o||o.pose===pose)return;
  var file=sprFile(who,pose);if(!file)return;
  var base=o.el.querySelector('img.a'),top=o.el.querySelector('img.b');
  top.src=A(file);top.style.visibility='';
  requestAnimationFrame(function(){top.style.opacity='1';});
  o.pose=pose;
  clearTimeout(o._pt);
  o._pt=setTimeout(function(){base.src=top.src;top.style.opacity='0';},430);
}
function moveChar(who,x){
  var o=charsOn[who];if(!o||o.x===x)return;
  o.el.classList.add('walk');o.el.style.left=x+'%';o.x=x;
  setTimeout(function(){o.el.classList.remove('walk');},1200);
}
function focusChar(who){
  Object.keys(charsOn).forEach(function(k){
    charsOn[k].el.classList.toggle('talk',k===who);
    charsOn[k].el.classList.toggle('dim',!!who&&k!==who);
  });
  setFocus(!!who);
}

/* ===================== 打字机 ===================== */
var typing=null;
function typeText(s,cb){
  txtEl.textContent='';moreEl.style.opacity='0';
  var i=0,t={full:s,cb:cb};
  t.id=setInterval(function(){
    txtEl.textContent=s.slice(0,++i);
    if(i>=s.length){clearInterval(t.id);if(typing===t)typing=null;moreEl.style.opacity='.5';cb&&cb();}
  },42);
  typing=t;
}
function skipType(){
  if(!typing)return false;
  clearInterval(typing.id);txtEl.textContent=typing.full;moreEl.style.opacity='.5';
  var cb=typing.cb;typing=null;cb&&cb();return true;
}

/* ===================== 场景推进 ===================== */
var curScene=null,curAct=null,beatIx=0,busy=false,auto=false,waitClick=null,curForce=null,started=false;
function sceneBg(sc){
  if(sc.bg)return sc.bg;
  if(sc.bgRef&&P.scenes[sc.bgRef])return P.scenes[sc.bgRef].bg;
  return P.meta.titleBg;
}
function gotoScene(id){
  var sc=P.scenes[id];
  if(!sc){theEnd('(剧本断头:场景 '+id+' 不存在)');return;}
  curScene=id;beatIx=0;
  $('choices').classList.remove('on');
  var newBgFile=sceneBg(sc);
  var bgChanged=newBgFile!==curBgFile;
  var actChanged=sc.act&&sc.act!==curAct;
  if(sc.amb!=null)startAmb(sc.amb);
  if(sc.bgm!=null)startBgm(sc.bgm);
  if(sc.fx!=null)setFx(sc.fx);
  if(bgChanged||actChanged||sc.clear){clearChars();focusChar(null);}
  setBg(newBgFile,sc.filter!=null?sc.filter:curFilter,bgChanged);
  if(actChanged){
    curAct=sc.act;
    var act=null;P.acts.forEach(function(a){if(a.id===sc.act)act=a;});
    dlg.classList.add('hide');
    busy=true;
    chapEl.textContent=act?act.name:'';
    chapEl.classList.add('on');sfxGong();
    setTimeout(function(){chapEl.classList.remove('on');},2100);
    setTimeout(function(){busy=false;runBeat();},2700);
    return;
  }
  runBeat();
}
function endingCard(sc){
  dlg.classList.add('hide');focusChar(null);
  var tier=sc.tier||'普通';
  $('endTier').textContent=tier;
  $('endTier').style.color=TIER_COLOR[tier]||'#7c8b96';
  $('endTier').style.borderColor=TIER_COLOR[tier]||'#7c8b96';
  $('endName').textContent=sc.name;
  $('endEpi').textContent=sc.epi?('「'+sc.epi+'」'):'';
  $('endCard').classList.add('on');
  document.body.classList.remove('theater');
  startBgm('none');
}
function runBeat(){
  var sc=P.scenes[curScene];
  if(beatIx>=sc.beats.length){ /* 场景末尾 */
    if(sc.ending){endingCard(sc);return;}
    if(sc.choice){showChoice(sc.choice);return;}
    if(sc.next){gotoScene(sc.next);return;}
    theEnd('');return;
  }
  var b=sc.beats[beatIx++];
  if(b.exit){removeChar(b.exit);runBeat();return;}
  busy=true;
  var isNarr=b.who==='旁白';
  var kind=isNarr?'narr':(P.chars[b.who]?P.chars[b.who].voice:'narr');
  var entered=false;
  if(!isNarr){
    var on=charsOn[b.who];
    if(!on){
      var x=b.x!=null?b.x:(Object.keys(charsOn).length?(Object.keys(charsOn).length%2?72:28):50);
      addChar(b.who,b.pose||'默认',x,x<50?'left':'right');entered=true;
    }else{
      if(b.pose)setPose(b.who,b.pose);
      if(b.x!=null&&!b.move)moveChar(b.who,b.x);
    }
    if(b.move!=null)moveChar(b.who,b.move);
  }
  dlg.classList.remove('hide');
  whoEl.textContent=b.who;
  whoEl.className=isNarr?'narr':(kind==='f'?'f':'');
  focusChar(isNarr?null:b.who);
  if(b.cam)camAct(b.cam);
  var tDone=false,vDone=false;
  function maybeNext(){
    if(!tDone||!vDone)return;
    busy=false;curForce=null;
    if(auto){waitClick=setTimeout(function(){waitClick=null;runBeat();},isNarr?1100:750);}
  }
  setTimeout(function(){
    typeText(b.text,function(){tDone=true;maybeNext();});
    curForce=speak(b.text,kind,function(){vDone=true;maybeNext();});
  },entered?650:(b.move!=null?400:0));
}
function showChoice(ch){
  busy=true;focusChar(null);
  var box=$('choices');box.innerHTML='';
  if(ch.q){var q=document.createElement('div');q.className='chq';q.textContent=ch.q;box.appendChild(q);}
  ch.opts.forEach(function(o){
    var btn=document.createElement('button');btn.className='chopt';btn.textContent=o.t;
    btn.onclick=function(e){
      e.stopPropagation();box.classList.remove('on');busy=false;
      plink(880,.18,.05,0);
      gotoScene(o.to);
    };
    box.appendChild(btn);
  });
  box.classList.add('on');
}
function theEnd(msg){
  dlg.classList.add('hide');clearChars();focusChar(null);
  var t=$('title');
  t.querySelector('h1').textContent=msg||'剧 终';
  t.querySelector('p').textContent=P.meta.subtitle||'';
  $('goPlay').textContent='再看一遍';
  t.classList.remove('gone');
  document.body.classList.remove('theater');
  startAmb('none');startBgm('none');
}
function advance(){
  if(!started||$('endCard').classList.contains('on')||$('choices').classList.contains('on'))return;
  if(waitClick){clearTimeout(waitClick);waitClick=null;runBeat();return;}
  if(typing){skipType();return;}
  if(busy){
    if(curForce){var f=curForce;curForce=null;f();if(!busy&&!waitClick)runBeat();}
    return;
  }
  runBeat();
}

/* ===================== 控制 ===================== */
function setBtn(id,on){$(id).classList.toggle('off',!on);}
function toggleAuto(v){auto=v===undefined?!auto:v;setBtn('bAuto',auto);
  if(auto&&started&&!busy&&!typing&&!waitClick)runBeat();}
function toggleVoice(){voiceOn=!voiceOn;setBtn('bVoice',voiceOn);
  if(!voiceOn&&window.speechSynthesis)try{speechSynthesis.cancel();}catch(e){}}
function toggleAmb(){
  ambOn=!ambOn;bgmOn=ambOn;setBtn('bAmb',ambOn);
  if(!ambOn){var a=curAmb,b=curBgm;stopAmb();stopBgm();stopLightning();curAmb=a;curBgm=b;}
  else{var a2=curAmb,b2=curBgm;curAmb='__r';curBgm='__r';startAmb(a2);startBgm(b2);}
}
function toggleTheater(v){
  var on=v===undefined?!document.body.classList.contains('theater'):v;
  document.body.classList.toggle('theater',on);
  if(on)toggleAuto(true);
}
$('bAuto').onclick=function(e){e.stopPropagation();toggleAuto();};
$('bVoice').onclick=function(e){e.stopPropagation();toggleVoice();};
$('bAmb').onclick=function(e){e.stopPropagation();toggleAmb();};
$('bTheater').onclick=function(e){e.stopPropagation();toggleTheater();};
dlg.addEventListener('click',advance);
stage.addEventListener('click',function(e){
  if(e.target.closest('#ctrl')||e.target.closest('#choices')||e.target.closest('#endCard')||e.target.closest('#title'))return;
  advance();
});
document.addEventListener('keydown',function(e){
  if(e.code==='Space'||e.code==='Enter'){e.preventDefault();advance();}
  else if(e.key==='a'||e.key==='A')toggleAuto();
  else if(e.key==='t'||e.key==='T')toggleTheater();
  else if(e.key==='v'||e.key==='V')toggleVoice();
  else if(e.key==='m'||e.key==='M')toggleAmb();
});

/* ===================== 启动 ===================== */
function firstScene(){return window.PREVIEW_SCENE&&P.scenes[window.PREVIEW_SCENE]?window.PREVIEW_SCENE:P.order[0];}
function start(theater,fromScene){
  ac();if(AC.state==='suspended')AC.resume();
  loadVoices();
  if(window.speechSynthesis){try{var u=new SpeechSynthesisUtterance(' ');speechSynthesis.speak(u);}catch(e){}}
  $('title').classList.add('gone');$('endCard').classList.remove('on');
  clearChars();curAct=null;curBgFile=null;started=true;
  if(theater)toggleTheater(true);
  setTimeout(function(){gotoScene(fromScene||firstScene());},350);
}
$('goPlay').onclick=function(e){e.stopPropagation();start(false);};
$('goRec').onclick=function(e){e.stopPropagation();start(true);};
$('endRe').onclick=function(e){e.stopPropagation();start(false,firstScene());};
$('endHome').onclick=function(e){e.stopPropagation();$('endCard').classList.remove('on');theEnd('');};
/* 扉页底图 */
(function(){
  var img=$('bgA').querySelector('img');
  img.src=A(P.meta.titleBg);curBgFile=P.meta.titleBg;
  $('bgA').classList.add('on');
  if(img.animate)kbAnims[0]=img.animate([{transform:'scale(1.07)'},{transform:'scale(1.15) translate(1.4%,-.8%)'}],{duration:26000,direction:'alternate',iterations:Infinity,easing:'ease-in-out'});
  fxResize();
})();
/* 预览模式:一次点击授权音频后直达场景 */
if(window.PREVIEW_SCENE){
  $('title').classList.add('gone');
  var gate=document.createElement('div');gate.id='pvGate';
  gate.innerHTML='<span>▶ 从「'+(P.scenes[window.PREVIEW_SCENE]?P.scenes[window.PREVIEW_SCENE].name:window.PREVIEW_SCENE)+'」预览</span>';
  stage.appendChild(gate);
  gate.onclick=function(){gate.remove();start(false,firstScene());};
}
})();
