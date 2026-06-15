// 共享水墨美术库 —— 通用历史场景配图,供各「真实人物」剧情游戏复用。
// 风格:墨蓝水墨,远山 + 留白 + 单一暖色点缀(朱砂/灯火),零图片依赖、随包内联。
// 用法:在 GameDef.art 里 `import { inkArt } from "./ink-art"; art: inkArt`,
//       场景 art 字段填下列 key 之一即可。绝不用 emoji。

const W = 960;
const H = 600;

function wrap(defs: string, body: string): string {
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
}

// 伪随机墨点/星子(山雾、雪、星空通用)
function speckle(seed: number, n: number, area: number, fill: string): string {
  let s = "";
  let v = seed;
  const rnd = () => ((v = (v * 9301 + 49297) % 233280), v / 233280);
  for (let i = 0; i < n; i++) {
    const x = rnd() * W;
    const y = rnd() * area;
    const r = rnd() * 1.4 + 0.3;
    const o = (rnd() * 0.5 + 0.18).toFixed(2);
    s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="${fill}" opacity="${o}"/>`;
  }
  return s;
}

// 一层远山剪影
function ridge(y: number, amp: number, color: string, opacity = 1): string {
  return `<path d="M0,${y} Q160,${y - amp} 320,${y} T640,${y} T960,${y - amp * 0.6} V600 H0 Z" fill="${color}" opacity="${opacity}"/>`;
}

const SKY_INK = `<linearGradient id="skyInk" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#0f1d2e"/><stop offset="0.6" stop-color="#1d3247"/><stop offset="1" stop-color="#2c4661"/>
</linearGradient>`;

const ART: Record<string, string> = {
  // 山水 —— 远山叠嶂、薄雾
  shanshui: wrap(
    SKY_INK,
    `<rect width="${W}" height="${H}" fill="url(#skyInk)"/>
     ${speckle(7, 30, 240, "#cdd9e6")}
     <circle cx="740" cy="130" r="46" fill="#e6ecf2" opacity="0.5"/>
     ${ridge(360, 120, "#21384f", 0.7)}
     ${ridge(430, 90, "#1a2c40", 0.85)}
     ${ridge(500, 60, "#142233", 1)}
     <path d="M0,470 H960" stroke="#3a5a78" stroke-width="1" opacity="0.4"/>
     <ellipse cx="480" cy="430" rx="520" ry="40" fill="#2c4661" opacity="0.25"/>`
  ),

  // 江/河 —— 一江烟水,孤舟
  river: wrap(
    SKY_INK,
    `<rect width="${W}" height="${H}" fill="url(#skyInk)"/>
     ${ridge(300, 90, "#1d3247", 0.6)}
     ${ridge(360, 60, "#16263a", 0.8)}
     <rect x="0" y="380" width="${W}" height="220" fill="#0f1f30"/>
     <g stroke="#3a5a78" stroke-width="1" opacity="0.35">
       <line x1="60" y1="430" x2="300" y2="430"/><line x1="420" y1="470" x2="700" y2="470"/>
       <line x1="120" y1="510" x2="520" y2="510"/><line x1="600" y1="540" x2="900" y2="540"/>
     </g>
     <g transform="translate(560,440)">
       <path d="M-46,0 q46,22 92,0 q-10,18 -46,18 q-36,0 -46,-18 z" fill="#0a141f"/>
       <line x1="0" y1="0" x2="0" y2="-34" stroke="#0a141f" stroke-width="2"/>
       <path d="M0,-34 q24,8 18,28 z" fill="#243a52" opacity="0.7"/>
     </g>
     <circle cx="200" cy="150" r="40" fill="#e6ecf2" opacity="0.45"/>`
  ),

  // 朝堂/宫阙 —— 重檐、丹陛
  court: wrap(
    SKY_INK,
    `<rect width="${W}" height="${H}" fill="url(#skyInk)"/>
     ${speckle(19, 20, 200, "#cdd9e6")}
     <g fill="#10202f">
       <rect x="120" y="300" width="720" height="260"/>
       <polygon points="90,300 480,180 870,300"/>
       <polygon points="150,210 480,120 810,210" opacity="0.9"/>
     </g>
     <g fill="#7a2e2e">
       <rect x="300" y="330" width="36" height="230"/><rect x="450" y="330" width="36" height="230"/>
       <rect x="600" y="330" width="36" height="230"/>
     </g>
     <g fill="#caa15a" opacity="0.85">
       <rect x="150" y="296" width="660" height="10"/><rect x="150" y="206" width="660" height="8"/>
     </g>
     <polygon points="455,560 505,560 530,470 430,470" fill="#caa15a" opacity="0.5"/>
     <circle cx="780" cy="120" r="34" fill="#f0d8a8" opacity="0.5"/>`
  ),

  // 书房/灯下 —— 案、卷、孤灯
  study: wrap(
    `<radialGradient id="lamp" cx="0.42" cy="0.42" r="0.6">
       <stop offset="0" stop-color="#2a3a4e"/><stop offset="1" stop-color="#080e16"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#lamp)"/>
     <circle cx="360" cy="220" r="20" fill="#ffe6b0" opacity="0.95"/>
     <polygon points="360,232 280,440 440,440" fill="#ffe6b0" opacity="0.10"/>
     <g fill="#101c2a">
       <rect x="180" y="430" width="560" height="20"/>
       <rect x="220" y="450" width="18" height="120"/><rect x="700" y="450" width="18" height="120"/>
     </g>
     <g fill="#1d3144">
       <rect x="430" y="388" width="160" height="44" rx="3"/>
       <rect x="300" y="404" width="90" height="26" rx="3"/>
     </g>
     <g stroke="#3a5a78" stroke-width="1" opacity="0.5">
       <line x1="446" y1="400" x2="574" y2="400"/><line x1="446" y1="412" x2="574" y2="412"/>
       <line x1="446" y1="424" x2="540" y2="424"/>
     </g>`
  ),

  // 贬所/江村茅屋 —— 烟雨、孤庐
  exile: wrap(
    `<linearGradient id="exSky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#1a2a3a"/><stop offset="1" stop-color="#33454f"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#exSky)"/>
     <g stroke="#5a6e78" stroke-width="1" opacity="0.25">
       ${Array.from({ length: 20 }, (_, i) => `<line x1="${i * 50 + 10}" y1="0" x2="${i * 50 - 30}" y2="${H}"/>`).join("")}
     </g>
     ${ridge(340, 70, "#22343f", 0.6)}
     <rect x="0" y="470" width="${W}" height="130" fill="#16242e"/>
     <g transform="translate(560,470)" fill="#0d171f">
       <rect x="-70" y="-70" width="140" height="70"/>
       <polygon points="-90,-70 0,-118 90,-70"/>
       <rect x="-18" y="-44" width="36" height="44" fill="#2a3a30"/>
     </g>
     <path d="M150,470 l-4,-44 l-3,44 z" fill="#0d171f"/>
     <path d="M142,430 q-26,-10 -42,2 q26,2 42,10 q18,-10 44,-4 q-18,-16 -44,-10 z" fill="#0d171f"/>`
  ),

  // 沙场/旌旗 —— 烽烟、戈戟
  battle: wrap(
    `<linearGradient id="btSky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#2a1c1c"/><stop offset="0.6" stop-color="#3a2a2a"/><stop offset="1" stop-color="#5a3a2a"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#btSky)"/>
     ${speckle(41, 36, 320, "#d8b89a")}
     <circle cx="700" cy="160" r="50" fill="#e8a85a" opacity="0.55"/>
     ${ridge(420, 80, "#3a2520", 0.85)}
     <rect x="0" y="500" width="${W}" height="100" fill="#2a1c16"/>
     <g stroke="#0d0a08" stroke-width="6">
       <line x1="200" y1="500" x2="180" y2="300"/><line x1="320" y1="500" x2="330" y2="280"/>
       <line x1="640" y1="500" x2="660" y2="300"/><line x1="760" y1="500" x2="740" y2="290"/>
     </g>
     <g fill="#7a2e2e">
       <path d="M180,300 l60,12 l-60,18 z"/><path d="M660,300 l-60,12 l60,18 z"/>
     </g>`
  ),

  // 大漠/西域 —— 沙丘、孤烟、商队
  desert: wrap(
    `<linearGradient id="dsSky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#1c2740"/><stop offset="0.55" stop-color="#6a5236"/><stop offset="1" stop-color="#c79a5a"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#dsSky)"/>
     ${speckle(53, 30, 220, "#e8e0c8")}
     <circle cx="500" cy="250" r="40" fill="#f4e2b0" opacity="0.7"/>
     <path d="M0,420 Q260,360 520,420 T960,400 V600 H0 Z" fill="#a8784a"/>
     <path d="M0,480 Q300,430 640,486 T960,470 V600 H0 Z" fill="#8a5e36"/>
     <line x1="700" y1="430" x2="700" y2="300" stroke="#3a2a1a" stroke-width="3" opacity="0.5"/>
     <g fill="#2a1c10" transform="translate(360,430)">
       <path d="M0,0 q10,-26 26,-26 q4,-14 14,-14 q10,0 12,14 q16,2 16,26 z"/>
       <rect x="6" y="0" width="6" height="20"/><rect x="56" y="0" width="6" height="20"/>
     </g>`
  ),

  // 沧海/航船 —— 远帆、波涛
  sea: wrap(
    SKY_INK,
    `<rect width="${W}" height="${H}" fill="url(#skyInk)"/>
     ${speckle(61, 24, 220, "#cdd9e6")}
     <circle cx="220" cy="150" r="44" fill="#e6ecf2" opacity="0.5"/>
     <rect x="0" y="380" width="${W}" height="220" fill="#0d1c2c"/>
     <g stroke="#2f4f6e" stroke-width="2" opacity="0.4" fill="none">
       <path d="M0,440 q60,-14 120,0 t120,0 t120,0 t120,0 t120,0 t120,0 t120,0"/>
       <path d="M0,500 q60,-14 120,0 t120,0 t120,0 t120,0 t120,0 t120,0 t120,0"/>
     </g>
     <g transform="translate(620,360)">
       <path d="M-60,40 q60,26 120,0 l-16,30 q-44,16 -88,0 z" fill="#0a141f"/>
       <line x1="0" y1="40" x2="0" y2="-70" stroke="#0a141f" stroke-width="3"/>
       <path d="M2,-70 q40,20 30,80 l-30,-6 z" fill="#243a52" opacity="0.8"/>
       <path d="M-2,-40 q-36,16 -28,60 l28,-4 z" fill="#1d3046" opacity="0.7"/>
     </g>`
  ),

  // 雪夜 —— 寒林、风雪
  snow: wrap(
    `<linearGradient id="snSky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#0e1826"/><stop offset="1" stop-color="#24323f"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#snSky)"/>
     ${speckle(71, 120, H, "#e8eef4")}
     ${ridge(380, 70, "#1a2733", 0.7)}
     <rect x="0" y="460" width="${W}" height="140" fill="#1c2a36"/>
     <path d="M0,460 Q240,442 480,460 T960,452 V470 H0 Z" fill="#cdd9e6" opacity="0.3"/>
     <g stroke="#0c1620" stroke-width="4">
       <line x1="240" y1="460" x2="240" y2="330"/><line x1="240" y1="380" x2="200" y2="350"/><line x1="240" y1="400" x2="284" y2="372"/>
       <line x1="720" y1="460" x2="720" y2="350"/><line x1="720" y1="390" x2="686" y2="364"/>
     </g>`
  ),

  // 古寺/禅 —— 山门、古钟、松
  temple: wrap(
    SKY_INK,
    `<rect width="${W}" height="${H}" fill="url(#skyInk)"/>
     ${ridge(330, 100, "#1d3247", 0.6)}
     ${ridge(400, 70, "#152536", 0.85)}
     <g fill="#10202f">
       <rect x="380" y="320" width="200" height="160"/>
       <polygon points="350,320 480,250 610,320"/>
       <rect x="455" y="380" width="50" height="100" fill="#06101a"/>
     </g>
     <g fill="#caa15a" opacity="0.8"><rect x="368" y="316" width="224" height="8"/></g>
     <g stroke="#0a141f" stroke-width="5">
       <line x1="180" y1="480" x2="180" y2="300"/><line x1="180" y1="340" x2="140" y2="312"/><line x1="180" y1="360" x2="222" y2="332"/>
     </g>
     <circle cx="760" cy="150" r="36" fill="#e6ecf2" opacity="0.45"/>`
  ),

  // 月夜 —— 一轮孤月,云影
  moon: wrap(
    `<radialGradient id="mnSky" cx="0.7" cy="0.28" r="0.8">
       <stop offset="0" stop-color="#2a3c54"/><stop offset="1" stop-color="#0a121e"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#mnSky)"/>
     ${speckle(89, 60, H, "#dfe7f0")}
     <circle cx="680" cy="170" r="70" fill="#f2ecd8" opacity="0.92"/>
     <circle cx="660" cy="156" r="70" fill="#2a3c54" opacity="0.5"/>
     <g fill="#162636" opacity="0.7">
       <path d="M0,250 q120,-20 260,6 q120,22 220,-4 q-80,40 -240,30 q-140,-8 -240,-32 z"/>
     </g>
     ${ridge(500, 50, "#101e2c", 1)}`
  ),

  // 烟雨 —— 细雨、长亭、柳
  rain: wrap(
    `<linearGradient id="rnSky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#243440"/><stop offset="1" stop-color="#3e505a"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#rnSky)"/>
     <g stroke="#7a8e98" stroke-width="1" opacity="0.3">
       ${Array.from({ length: 28 }, (_, i) => `<line x1="${i * 36 + 6}" y1="0" x2="${i * 36 - 24}" y2="${H}"/>`).join("")}
     </g>
     ${ridge(360, 60, "#26363f", 0.5)}
     <rect x="0" y="470" width="${W}" height="130" fill="#1c2a30"/>
     <g fill="#0e1a20">
       <rect x="420" y="360" width="120" height="110"/>
       <polygon points="396,360 480,308 564,360"/>
       <rect x="436" y="380" width="20" height="90" fill="#23332a"/><rect x="504" y="380" width="20" height="90" fill="#23332a"/>
     </g>
     <path d="M760,470 q-10,-90 10,-150 q4,60 30,80 q-20,-6 -40,70 z" fill="#1a2a20" opacity="0.8"/>`
  ),
};

export function inkArt(key: string | undefined): string {
  if (!key) return "";
  return ART[key] || "";
}
