// 《钢铁之路》场景配图 —— 全部为手绘矢量 SVG(墨蓝科技风),零图片依赖、随包内联。
// 风格:深靛蓝夜底 + 单一暖/冷点缀色,呼应平台「墨蓝水墨」基调,绝不用 emoji。
// 用法:def.art(key) 返回完整 <svg> 字符串,GameStage 以 v-html 铺在剧情区背后。

const W = 960;
const H = 600;

function wrap(id: string, defs: string, body: string): string {
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
}

// 通用星空
function stars(seed: number, n = 60, area = H): string {
  let s = "";
  let v = seed;
  const rnd = () => {
    v = (v * 9301 + 49297) % 233280;
    return v / 233280;
  };
  for (let i = 0; i < n; i++) {
    const x = rnd() * W;
    const y = rnd() * area;
    const r = rnd() * 1.3 + 0.3;
    const o = (rnd() * 0.6 + 0.2).toFixed(2);
    s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="#dfe7f0" opacity="${o}"/>`;
  }
  return s;
}

const ART: Record<string, string> = {
  // 1. 南非旷野的黎明 —— 少年仰望
  veld: wrap(
    "veld",
    `<linearGradient id="veldSky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#15233a"/>
       <stop offset="0.55" stop-color="#3a3a54"/>
       <stop offset="0.78" stop-color="#9c6a4e"/>
       <stop offset="1" stop-color="#e0a36b"/>
     </linearGradient>
     <radialGradient id="veldSun" cx="0.7" cy="0.82" r="0.32">
       <stop offset="0" stop-color="#ffe6b8"/><stop offset="1" stop-color="#e0a36b" stop-opacity="0"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#veldSky)"/>
     ${stars(7, 40, 260)}
     <rect width="${W}" height="${H}" fill="url(#veldSun)"/>
     <circle cx="672" cy="492" r="44" fill="#ffdca6"/>
     <path d="M0,470 Q240,430 480,468 T960,452 V600 H0 Z" fill="#23314a" opacity="0.9"/>
     <path d="M0,520 Q300,486 620,520 T960,512 V600 H0 Z" fill="#15203200"/>
     <path d="M0,520 Q300,486 620,520 T960,512 V600 H0 Z" fill="#16243a"/>
     <g fill="#0e1626">
       <path d="M150,470 l-6,-70 l-3,70 z"/>
       <path d="M141,402 q-34,-12 -52,4 q34,2 52,10 q24,-10 54,-2 q-22,-20 -54,-12 z"/>
     </g>`
  ),

  // 2. 终端微光 —— 12 岁写下第一行代码
  terminal: wrap(
    "terminal",
    `<radialGradient id="termGlow" cx="0.5" cy="0.45" r="0.6">
       <stop offset="0" stop-color="#16384a"/><stop offset="1" stop-color="#070d14"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#termGlow)"/>
     <rect x="330" y="150" width="300" height="220" rx="10" fill="#08131a" stroke="#1d4a52" stroke-width="3"/>
     <rect x="350" y="172" width="260" height="176" rx="4" fill="#06181a"/>
     <g fill="#5ef0b0" font-family="monospace" font-size="13" opacity="0.92">
       <text x="362" y="196">10 PRINT "BLASTAR"</text>
       <text x="362" y="218">20 LET SHIP = 1</text>
       <text x="362" y="240">30 IF HIT THEN SCORE</text>
       <text x="362" y="262">40 GOTO 20</text>
       <text x="362" y="300">RUN_</text>
     </g>
     <rect x="430" y="370" width="100" height="14" fill="#0c1c26"/>
     <rect x="380" y="384" width="200" height="10" rx="3" fill="#10242e"/>
     <circle cx="480" cy="470" r="120" fill="#1e6f5c" opacity="0.10"/>`
  ),

  // 3. 校园 —— 物理与商科的双主修
  campus: wrap(
    "campus",
    `<linearGradient id="campSky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#101d33"/><stop offset="1" stop-color="#2b3350"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#campSky)"/>
     ${stars(19, 50, 300)}
     <circle cx="180" cy="120" r="38" fill="#e8eef6" opacity="0.85"/>
     <g fill="#16233a">
       <rect x="280" y="300" width="400" height="240"/>
       <polygon points="280,300 480,210 680,300"/>
       <rect x="455" y="330" width="50" height="210" fill="#0d1626"/>
       <rect x="330" y="350" width="34" height="48" fill="#2a3c5a"/>
       <rect x="400" y="350" width="34" height="48" fill="#2a3c5a"/>
       <rect x="540" y="350" width="34" height="48" fill="#2a3c5a"/>
       <rect x="610" y="350" width="34" height="48" fill="#2a3c5a"/>
     </g>
     <rect x="0" y="538" width="${W}" height="62" fill="#0c1424"/>
     <g stroke="#c98b6b" stroke-width="3" opacity="0.8">
       <line x1="150" y1="470" x2="150" y2="540"/><line x1="810" y1="470" x2="810" y2="540"/>
     </g>
     <circle cx="150" cy="466" r="6" fill="#ffce96"/><circle cx="810" cy="466" r="6" fill="#ffce96"/>`
  ),

  // 4. 硅谷之夜 —— 互联网淘金
  valley: wrap(
    "valley",
    `<linearGradient id="valSky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#0a1326"/><stop offset="1" stop-color="#243a55"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#valSky)"/>
     ${stars(33, 55, 320)}
     <circle cx="770" cy="130" r="50" fill="#dfe7f2" opacity="0.9"/>
     <g fill="#0e1c30">
       <rect x="60" y="360" width="80" height="200"/><rect x="160" y="300" width="70" height="260"/>
       <rect x="250" y="390" width="90" height="170"/><rect x="360" y="250" width="80" height="310"/>
       <rect x="460" y="340" width="70" height="220"/><rect x="550" y="300" width="100" height="260"/>
       <rect x="670" y="380" width="80" height="180"/><rect x="770" y="320" width="90" height="240"/>
       <rect x="870" y="360" width="70" height="200"/>
     </g>
     <g fill="#ffd98a" opacity="0.85">
       <rect x="180" y="320" width="8" height="10"/><rect x="200" y="350" width="8" height="10"/>
       <rect x="380" y="280" width="8" height="10"/><rect x="400" y="330" width="8" height="10"/>
       <rect x="575" y="330" width="8" height="10"/><rect x="600" y="380" width="8" height="10"/>
       <rect x="790" y="350" width="8" height="10"/><rect x="810" y="400" width="8" height="10"/>
     </g>
     <rect x="0" y="556" width="${W}" height="44" fill="#070e1c"/>`
  ),

  // 5. 车库创业 —— 睡在公司,白手起家
  garage: wrap(
    "garage",
    `<radialGradient id="garLamp" cx="0.35" cy="0.3" r="0.65">
       <stop offset="0" stop-color="#37405a"/>
       <stop offset="1" stop-color="#0a0f1a"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#garLamp)"/>
     <line x1="300" y1="0" x2="300" y2="120" stroke="#222b3d" stroke-width="3"/>
     <circle cx="300" cy="140" r="26" fill="#ffe7b0" opacity="0.95"/>
     <polygon points="300,150 220,360 380,360" fill="#ffe7b0" opacity="0.10"/>
     <g fill="#10182a">
       <rect x="180" y="360" width="600" height="20"/>
       <rect x="210" y="380" width="20" height="150"/><rect x="730" y="380" width="20" height="150"/>
       <rect x="250" y="300" width="120" height="60" rx="4"/>
       <rect x="400" y="300" width="120" height="60" rx="4"/>
     </g>
     <rect x="258" y="308" width="104" height="44" fill="#1d5a52"/>
     <rect x="408" y="308" width="104" height="44" fill="#1d4a5a"/>
     <rect x="560" y="338" width="70" height="22" rx="3" fill="#7a2e2e"/>
     <text x="566" y="354" fill="#e9c08a" font-family="monospace" font-size="11">PIZZA</text>
     <path d="M600,520 q40,-40 100,-30 q30,10 40,40 z" fill="#243250"/>`
  ),

  // 6. X.com —— 互联网银行
  xcom: wrap(
    "xcom",
    `<linearGradient id="xSky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#0c1a30"/><stop offset="1" stop-color="#13233f"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#xSky)"/>
     <g stroke="#1f3a5c" stroke-width="1" opacity="0.5">
       ${Array.from({ length: 13 }, (_, i) => `<line x1="${i * 80}" y1="0" x2="${i * 80}" y2="${H}"/>`).join("")}
       ${Array.from({ length: 9 }, (_, i) => `<line x1="0" y1="${i * 75}" x2="${W}" y2="${i * 75}"/>`).join("")}
     </g>
     <text x="480" y="330" fill="#cfe0f2" font-family="Georgia, serif" font-size="200" text-anchor="middle" opacity="0.92">X</text>
     <g fill="#6fe0a0" font-family="monospace" font-size="22" opacity="0.85">
       <text x="160" y="200">$</text><text x="740" y="240">$</text>
       <text x="240" y="430">$</text><text x="680" y="420">$</text>
     </g>
     <rect x="330" y="372" width="300" height="6" rx="3" fill="#2f5c8a"/>`
  ),

  // 7. 发射台 —— 夸贾林环礁上的猎鹰一号
  pad: wrap(
    "pad",
    `<linearGradient id="padSky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#0e1d3a"/><stop offset="0.7" stop-color="#274a6e"/>
       <stop offset="1" stop-color="#3f6f86"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#padSky)"/>
     ${stars(51, 35, 220)}
     <rect x="0" y="470" width="${W}" height="130" fill="#1d4658"/>
     <path d="M0,470 q120,-14 240,0 t240,0 t240,0 t240,0 V490 H0 Z" fill="#2b5e72" opacity="0.6"/>
     <ellipse cx="480" cy="470" rx="${W}" ry="16" fill="#3a7186" opacity="0.4"/>
     <g fill="#0c1422">
       <rect x="470" y="200" width="20" height="270"/>
       <polygon points="470,200 480,176 490,200"/>
       <rect x="476" y="186" width="8" height="20"/>
       <rect x="500" y="250" width="14" height="220"/>
       <line x1="500" y1="280" x2="490" y2="280" stroke="#0c1422" stroke-width="6"/>
       <line x1="500" y1="340" x2="490" y2="340" stroke="#0c1422" stroke-width="6"/>
     </g>
     <g fill="#0c1422"><path d="M150,470 l-5,-40 l-3,40 z"/>
       <path d="M142,432 q-26,-8 -40,4 q26,2 40,8 q18,-8 42,-2 q-18,-14 -42,-10 z"/></g>`
  ),

  // 8. 升空 —— 火焰刺破夜幕
  launch: wrap(
    "launch",
    `<linearGradient id="lnSky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#060a16"/><stop offset="1" stop-color="#15243f"/>
     </linearGradient>
     <linearGradient id="lnFlame" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#fff2c0"/><stop offset="0.5" stop-color="#ffb24d"/>
       <stop offset="1" stop-color="#e65a2a" stop-opacity="0"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#lnSky)"/>
     ${stars(67, 80, H)}
     <g transform="translate(480,0)">
       <rect x="-12" y="120" width="24" height="200" rx="6" fill="#e6ecf4"/>
       <polygon points="-12,120 0,82 12,120" fill="#cdd6e2"/>
       <rect x="-12" y="250" width="24" height="14" fill="#2a3c5a"/>
       <polygon points="-12,320 -34,360 12,320" fill="#9fb0c4"/>
       <polygon points="12,320 34,360 -12,320" fill="#c2cedd"/>
       <path d="M-14,322 q-14,90 0,250 q14,-160 14,-250 q-2,30 -14,0 z" fill="url(#lnFlame)"/>
       <ellipse cx="0" cy="360" rx="40" ry="18" fill="#ffd98a" opacity="0.6"/>
     </g>
     <ellipse cx="480" cy="585" rx="260" ry="50" fill="#34507a" opacity="0.45"/>`
  ),

  // 9. 轨道 —— 第一次入轨,地球弧线
  orbit: wrap(
    "orbit",
    `<radialGradient id="obSpace" cx="0.5" cy="0.4" r="0.8">
       <stop offset="0" stop-color="#0c182e"/><stop offset="1" stop-color="#04070f"/>
     </radialGradient>
     <linearGradient id="obEarth" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#2e6f9e"/><stop offset="1" stop-color="#123a5c"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#obSpace)"/>
     ${stars(83, 110, H)}
     <path d="M0,640 Q480,420 960,640 V600 Z" fill="url(#obEarth)"/>
     <path d="M0,640 Q480,420 960,640" fill="none" stroke="#7fd0ff" stroke-width="3" opacity="0.7"/>
     <path d="M0,650 Q480,430 960,650" fill="none" stroke="#bfeaff" stroke-width="10" opacity="0.18"/>
     <g transform="translate(640,210) rotate(28)">
       <rect x="-8" y="-26" width="16" height="52" rx="4" fill="#e6ecf4"/>
       <polygon points="-8,-26 0,-44 8,-26" fill="#cdd6e2"/>
       <rect x="-26" y="-6" width="14" height="18" fill="#2a6f8a"/>
       <rect x="12" y="-6" width="14" height="18" fill="#2a6f8a"/>
     </g>`
  ),

  // 10. 工厂 —— 第一台电动跑车下线
  factory: wrap(
    "factory",
    `<linearGradient id="facBg" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#101a2c"/><stop offset="1" stop-color="#1a2740"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#facBg)"/>
     <g stroke="#2a3c5a" stroke-width="2" opacity="0.6">
       <line x1="0" y1="90" x2="${W}" y2="60"/><line x1="0" y1="160" x2="${W}" y2="130"/>
     </g>
     <g fill="#0e1626">
       <polygon points="0,80 120,40 240,80 360,40 480,80 600,40 720,80 840,40 960,80 960,160 0,160"/>
     </g>
     <g fill="#ffe6a8" opacity="0.85">
       <ellipse cx="240" cy="120" rx="50" ry="8"/><ellipse cx="480" cy="120" rx="50" ry="8"/>
       <ellipse cx="720" cy="120" rx="50" ry="8"/>
     </g>
     <polygon points="240,130 480,130 360,300 120,300" fill="#ffe6a8" opacity="0.06"/>
     <g transform="translate(480,430)">
       <path d="M-150,0 q40,-70 150,-70 q110,0 150,70 z" fill="#7a1f1f"/>
       <path d="M-110,-8 q40,-48 110,-48 q70,0 110,48 z" fill="#1a2334"/>
       <rect x="-150" y="-2" width="300" height="34" rx="14" fill="#9c2a2a"/>
       <circle cx="-92" cy="34" r="34" fill="#0a0e16"/><circle cx="-92" cy="34" r="14" fill="#2a3346"/>
       <circle cx="92" cy="34" r="34" fill="#0a0e16"/><circle cx="92" cy="34" r="14" fill="#2a3346"/>
       <path d="M-150,2 q150,-26 300,0" fill="none" stroke="#ffd0a0" stroke-width="2" opacity="0.6"/>
     </g>`
  ),

  // 11. 熔炉 2008 —— 至暗时刻
  crucible: wrap(
    "crucible",
    `<radialGradient id="crBg" cx="0.5" cy="0.3" r="0.9">
       <stop offset="0" stop-color="#1b2236"/><stop offset="1" stop-color="#05070d"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#crBg)"/>
     <path d="M520,40 L470,300 L520,300 L450,560 L600,250 L540,250 Z" fill="#9fb6d6" opacity="0.5"/>
     <path d="M180,60 L150,260 L190,260 L140,460" fill="none" stroke="#6f86aa" stroke-width="3" opacity="0.3"/>
     <g fill="#06090f">
       <path d="M0,470 Q200,440 380,470 T760,468 T960,470 V600 H0 Z"/>
     </g>
     <g transform="translate(480,470)">
       <ellipse cx="0" cy="6" rx="40" ry="8" fill="#000" opacity="0.5"/>
       <path d="M-9,0 q-3,-44 9,-70 q12,26 9,70 z" fill="#0c111c"/>
       <circle cx="0" cy="-78" r="11" fill="#0c111c"/>
     </g>
     <line x1="0" y1="470" x2="960" y2="470" stroke="#1a2438" stroke-width="1" opacity="0.6"/>`
  ),

  // 12. 纳斯达克 —— 敲钟上市
  nasdaq: wrap(
    "nasdaq",
    `<linearGradient id="ndBg" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#08131f"/><stop offset="1" stop-color="#0f2233"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#ndBg)"/>
     <rect x="60" y="60" width="840" height="300" rx="10" fill="#040b12" stroke="#16384a" stroke-width="2"/>
     <g stroke="#123040" stroke-width="1" opacity="0.7">
       ${Array.from({ length: 8 }, (_, i) => `<line x1="60" y1="${90 + i * 35}" x2="900" y2="${90 + i * 35}"/>`).join("")}
     </g>
     <polyline points="90,300 200,280 300,300 420,230 540,250 660,170 780,190 880,110" fill="none" stroke="#3ee08a" stroke-width="4"/>
     <polygon points="880,110 858,128 880,90 902,128" fill="#3ee08a"/>
     <g fill="#3ee08a" font-family="monospace" font-size="26">
       <text x="96" y="140">TSLA</text><text x="240" y="140">+ ▲</text>
     </g>
     <g fill="#cfe0f2" font-family="monospace" font-size="15" opacity="0.7">
       <text x="96" y="345">2010 · 6 · 29   NASDAQ</text>
     </g>
     <rect x="0" y="540" width="${W}" height="60" fill="#0a1622"/>
     <g fill="#1a3346"><rect x="180" y="400" width="120" height="140" rx="6"/><rect x="660" y="400" width="120" height="140" rx="6"/></g>`
  ),

  // 13. 火星 —— 远方的承诺
  mars: wrap(
    "mars",
    `<linearGradient id="mrSky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#1a0f12"/><stop offset="0.6" stop-color="#5a2a22"/>
       <stop offset="1" stop-color="#b15c34"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#mrSky)"/>
     ${stars(97, 50, 240)}
     <circle cx="760" cy="140" r="26" fill="#f0d2b0" opacity="0.7"/>
     <circle cx="180" cy="110" r="10" fill="#d8b89a" opacity="0.5"/>
     <path d="M0,430 Q240,392 480,424 T960,408 V600 H0 Z" fill="#8a3f26"/>
     <path d="M0,470 Q300,440 620,472 T960,460 V600 H0 Z" fill="#6e3020"/>
     <g fill="#3a1a12" opacity="0.85">
       <ellipse cx="300" cy="470" rx="70" ry="22"/><ellipse cx="640" cy="486" rx="90" ry="26"/>
     </g>
     <g transform="translate(480,430)" fill="none" stroke="#e8d2b0" stroke-width="2" opacity="0.7">
       <path d="M-40,0 a40,40 0 0 1 80,0 z" fill="#1f2740" stroke="#9fb0c4"/>
       <line x1="0" y1="-40" x2="0" y2="-70"/>
     </g>`
  ),

  // 14. 深夜书桌 —— 持续燃烧
  desk: wrap(
    "desk",
    `<radialGradient id="dkBg" cx="0.4" cy="0.5" r="0.7">
       <stop offset="0" stop-color="#16243a"/><stop offset="1" stop-color="#070c16"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#dkBg)"/>
     <rect x="640" y="60" width="240" height="300" rx="6" fill="#0c1a2c" stroke="#1d3850" stroke-width="2"/>
     ${stars(113, 24, 360)
       .replace(/cx="(\d+)"/g, (_m, x) => `cx="${640 + (Number(x) % 240)}"`)}
     <g fill="#13202f">
       <rect x="150" y="380" width="520" height="16"/>
       <rect x="300" y="270" width="220" height="120" rx="8"/>
     </g>
     <rect x="312" y="282" width="196" height="96" rx="4" fill="#1d4a5a"/>
     <g fill="#7fd6e6" font-family="monospace" font-size="11" opacity="0.85">
       <text x="324" y="306">build --target=mars</text>
       <text x="324" y="326">build --target=earth</text>
       <text x="324" y="360">> all systems go_</text>
     </g>
     <polygon points="410,378 360,378 380,270 430,270" fill="#7fd6e6" opacity="0.06"/>`
  ),
};

export function muskArt(key: string | undefined): string {
  if (!key) return "";
  return ART[key] || "";
}
