// 《无耻浮生 · 卡尔的选择》专用美术库 —— 都市黑色寓言。
// 风格:墨蓝水墨底 + 都市霓虹冷光,玻璃幕墙、格子间、雨夜后巷。
// 冷青 #5fa8e6 为霓虹点缀,朱砂 #9e3b32 仅用于罪孽/警示,极克制。零图片依赖、随包内联。
// 用法:GameDef.art = karlArt;场景 art 字段填下列 key 之一。绝不用 emoji。

const W = 960;
const H = 600;

function wrap(defs: string, body: string): string {
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
}

// 伪随机点(雨丝、灯火、人群)
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

// 一排亮着冷光的窗格(玻璃幕墙)
function windows(x0: number, y0: number, cols: number, rows: number, gap: number, seed: number): string {
  let s = "";
  let v = seed;
  const rnd = () => ((v = (v * 9301 + 49297) % 233280), v / 233280);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rnd() > 0.55;
      const fill = lit ? "#5fa8e6" : "#11202f";
      const o = lit ? (rnd() * 0.4 + 0.35).toFixed(2) : "0.5";
      s += `<rect x="${x0 + c * gap}" y="${y0 + r * gap}" width="${gap - 4}" height="${gap - 4}" fill="${fill}" opacity="${o}"/>`;
    }
  }
  return s;
}

const CITY_INK = `<linearGradient id="cityInk" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#0c1622"/><stop offset="0.6" stop-color="#17283a"/><stop offset="1" stop-color="#22384f"/>
</linearGradient>`;

const ART: Record<string, string> = {
  // 格子间冷光 —— 日光灯下的工位
  cubicle: wrap(
    `<linearGradient id="cubLamp" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#1a2a3a"/><stop offset="1" stop-color="#0a1018"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#cubLamp)"/>
     <g fill="#5fa8e6" opacity="0.18">
       <rect x="180" y="60" width="240" height="10"/><rect x="540" y="60" width="240" height="10"/>
     </g>
     <g fill="#13212f">
       <rect x="120" y="300" width="300" height="160"/><rect x="540" y="300" width="300" height="160"/>
       <rect x="120" y="300" width="300" height="10" fill="#1c3145"/><rect x="540" y="300" width="300" height="10" fill="#1c3145"/>
     </g>
     <g fill="#1c3145"><rect x="250" y="200" width="40" height="200"/><rect x="670" y="200" width="40" height="200"/></g>
     <g fill="#5fa8e6" opacity="0.7"><rect x="190" y="330" width="70" height="44" rx="2"/><rect x="610" y="330" width="70" height="44" rx="2"/></g>
     ${speckle(13, 18, 120, "#9fb6cc")}`
  ),

  // 雨夜后巷 —— 霓虹倒影、积水
  alley: wrap(
    `<linearGradient id="alSky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#0a1320"/><stop offset="1" stop-color="#15222f"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#alSky)"/>
     <g stroke="#5f7a90" stroke-width="1" opacity="0.28">
       ${Array.from({ length: 30 }, (_, i) => `<line x1="${i * 34 + 6}" y1="0" x2="${i * 34 - 22}" y2="${H}"/>`).join("")}
     </g>
     <g fill="#0c151f"><rect x="0" y="120" width="380" height="360"/><rect x="600" y="80" width="360" height="400"/></g>
     <rect x="40" y="200" width="60" height="14" fill="#9e3b32" opacity="0.7"/>
     <rect x="760" y="160" width="70" height="14" fill="#5fa8e6" opacity="0.7"/>
     <rect x="0" y="470" width="${W}" height="130" fill="#0d1822"/>
     <g opacity="0.4"><rect x="60" y="490" width="90" height="60" fill="#9e3b32"/><rect x="770" y="500" width="90" height="50" fill="#5fa8e6"/></g>`
  ),

  // 玻璃幕墙夜景 —— 拔地的高楼、冷窗
  office_tower: wrap(
    CITY_INK,
    `<rect width="${W}" height="${H}" fill="url(#cityInk)"/>
     ${speckle(29, 22, 200, "#cdd9e6")}
     <g fill="#0e1a28">
       <rect x="120" y="120" width="180" height="440"/><rect x="380" y="60" width="200" height="500"/>
       <rect x="660" y="180" width="180" height="380"/>
     </g>
     ${windows(132, 140, 5, 10, 30, 5)}
     ${windows(392, 80, 6, 14, 30, 9)}
     ${windows(672, 200, 5, 10, 30, 17)}
     <circle cx="800" cy="110" r="30" fill="#e6ecf2" opacity="0.35"/>`
  ),

  // 酒局推杯 —— 暗厅、杯影、冷光酒柜
  bar: wrap(
    `<radialGradient id="barLamp" cx="0.5" cy="0.4" r="0.7">
       <stop offset="0" stop-color="#243a4e"/><stop offset="1" stop-color="#080e16"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#barLamp)"/>
     <g fill="#5fa8e6" opacity="0.3"><rect x="700" y="120" width="180" height="300"/></g>
     <g stroke="#1c3145" stroke-width="2" opacity="0.6">
       <line x1="700" y1="180" x2="880" y2="180"/><line x1="700" y1="260" x2="880" y2="260"/><line x1="700" y1="340" x2="880" y2="340"/>
     </g>
     <rect x="100" y="400" width="540" height="20" fill="#10202f"/>
     <g fill="#caa15a" opacity="0.8"><rect x="180" y="400" width="540" height="6"/></g>
     <g transform="translate(300,360)" fill="#5fa8e6" opacity="0.55">
       <path d="M0,0 l40,0 l-6,40 l-28,0 z"/><rect x="14" y="40" width="12" height="20"/>
     </g>
     <g transform="translate(440,360)" fill="#9e3b32" opacity="0.55">
       <path d="M0,0 l40,0 l-6,40 l-28,0 z"/><rect x="14" y="40" width="12" height="20"/>
     </g>
     ${speckle(37, 14, 100, "#caa15a")}`
  ),

  // 上司办公室阴影 —— 巨大座椅背光、压迫感
  boss_room: wrap(
    `<radialGradient id="bossBg" cx="0.6" cy="0.5" r="0.8">
       <stop offset="0" stop-color="#1d2f42"/><stop offset="1" stop-color="#070d15"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#bossBg)"/>
     <g fill="#5fa8e6" opacity="0.22"><rect x="560" y="40" width="360" height="520"/></g>
     <g stroke="#0e1a28" stroke-width="4" opacity="0.7">
       ${Array.from({ length: 6 }, (_, i) => `<line x1="${560 + i * 60}" y1="40" x2="${560 + i * 60}" y2="560"/>`).join("")}
     </g>
     <g fill="#0a1219">
       <rect x="180" y="220" width="220" height="260" rx="14"/>
       <rect x="150" y="240" width="40" height="160" rx="10"/><rect x="390" y="240" width="40" height="160" rx="10"/>
     </g>
     <rect x="60" y="470" width="500" height="20" fill="#10202f"/>
     <ellipse cx="290" cy="180" rx="60" ry="26" fill="#0a1219"/>`
  ),

  // 豪门婚礼冷艳 —— 拱廊、冷白花、聚光
  wedding: wrap(
    `<linearGradient id="wedBg" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#101c2c"/><stop offset="1" stop-color="#26384c"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#wedBg)"/>
     ${speckle(41, 26, 260, "#dce6f0")}
     <g fill="#0e1a28">
       <path d="M180,560 V300 Q180,200 280,200 Q380,200 380,300 V560 Z"/>
       <path d="M580,560 V300 Q580,200 680,200 Q780,200 780,300 V560 Z"/>
     </g>
     <g fill="#5fa8e6" opacity="0.5"><polygon points="480,80 540,560 420,560"/></g>
     <g fill="#dce6f0" opacity="0.85">
       <circle cx="280" cy="220" r="10"/><circle cx="680" cy="220" r="10"/>
       <circle cx="300" cy="250" r="8"/><circle cx="660" cy="250" r="8"/>
     </g>
     <rect x="0" y="540" width="${W}" height="60" fill="#0a1219"/>
     <g fill="#caa15a" opacity="0.6"><rect x="0" y="540" width="${W}" height="5"/></g>`
  ),

  // 空旷豪宅 —— 高窗冷月、孤影长廊
  mansion: wrap(
    `<radialGradient id="manBg" cx="0.5" cy="0.35" r="0.85">
       <stop offset="0" stop-color="#1c2e40"/><stop offset="1" stop-color="#080e16"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#manBg)"/>
     <g fill="#5fa8e6" opacity="0.2">
       <rect x="120" y="100" width="120" height="320"/><rect x="420" y="100" width="120" height="320"/><rect x="720" y="100" width="120" height="320"/>
     </g>
     <g stroke="#0c1622" stroke-width="6">
       <line x1="180" y1="100" x2="180" y2="420"/><line x1="480" y1="100" x2="480" y2="420"/><line x1="780" y1="100" x2="780" y2="420"/>
       <line x1="120" y1="260" x2="840" y2="260"/>
     </g>
     <rect x="0" y="460" width="${W}" height="140" fill="#0a141f"/>
     <g fill="#0a141f"><ellipse cx="480" cy="540" rx="40" ry="80"/><rect x="466" y="470" width="28" height="80"/><circle cx="480" cy="450" r="20"/></g>`
  ),

  // 伪善慈善晚宴 —— 聚光、空话筒、人影
  charity: wrap(
    `<radialGradient id="chBg" cx="0.5" cy="0.2" r="0.9">
       <stop offset="0" stop-color="#243a52"/><stop offset="1" stop-color="#0a1018"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#chBg)"/>
     <g fill="#caa15a" opacity="0.16"><polygon points="480,0 760,560 200,560"/></g>
     <g fill="#0d1822">
       <rect x="300" y="360" width="360" height="120"/>
       <rect x="300" y="360" width="360" height="8" fill="#caa15a" opacity="0.5"/>
     </g>
     <rect x="470" y="280" width="6" height="90" fill="#1c3145"/>
     <ellipse cx="473" cy="276" rx="16" ry="10" fill="#13212f"/>
     <g fill="#0a141f">
       <circle cx="200" cy="500" r="22"/><rect x="182" y="500" width="36" height="90"/>
       <circle cx="760" cy="500" r="22"/><rect x="742" y="500" width="36" height="90"/>
     </g>
     ${speckle(53, 16, 120, "#caa15a")}`
  ),

  // 法庭剪影 —— 高坐审判席、栏杆、冷光
  courtroom: wrap(
    `<linearGradient id="crBg" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#0e1826"/><stop offset="1" stop-color="#1d2c3c"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#crBg)"/>
     <g fill="#5fa8e6" opacity="0.16"><rect x="360" y="40" width="240" height="120"/></g>
     <g fill="#0c1622">
       <rect x="320" y="160" width="320" height="160"/>
       <polygon points="300,160 480,90 660,160"/>
     </g>
     <g fill="#9e3b32" opacity="0.7"><rect x="470" y="120" width="20" height="50"/><rect x="455" y="135" width="50" height="14"/></g>
     <g stroke="#1c3145" stroke-width="6">
       <line x1="200" y1="420" x2="760" y2="420"/>
       ${Array.from({ length: 9 }, (_, i) => `<line x1="${220 + i * 70}" y1="420" x2="${220 + i * 70}" y2="520"/>`).join("")}
     </g>
     <rect x="0" y="540" width="${W}" height="60" fill="#0a1219"/>`
  ),

  // 铁窗月光 —— 栅栏、冷月、长影
  prison: wrap(
    `<radialGradient id="prBg" cx="0.75" cy="0.25" r="0.8">
       <stop offset="0" stop-color="#2a3c54"/><stop offset="1" stop-color="#070d15"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#prBg)"/>
     <circle cx="720" cy="160" r="60" fill="#f2ecd8" opacity="0.85"/>
     <circle cx="700" cy="146" r="60" fill="#2a3c54" opacity="0.5"/>
     <g stroke="#06101a" stroke-width="14">
       ${Array.from({ length: 7 }, (_, i) => `<line x1="${160 + i * 110}" y1="0" x2="${160 + i * 110}" y2="${H}"/>`).join("")}
       <line x1="0" y1="200" x2="${W}" y2="200"/><line x1="0" y1="400" x2="${W}" y2="400"/>
     </g>
     <g stroke="#5fa8e6" stroke-width="3" opacity="0.3">
       ${Array.from({ length: 7 }, (_, i) => `<line x1="${172 + i * 110}" y1="0" x2="${172 + i * 110}" y2="${H}"/>`).join("")}
     </g>`
  ),

  // 地铁人潮孤影 —— 隧道冷光、攒动人群、一个静止的你
  subway: wrap(
    `<radialGradient id="subBg" cx="0.5" cy="0.5" r="0.9">
       <stop offset="0" stop-color="#1a2c3e"/><stop offset="1" stop-color="#070d15"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#subBg)"/>
     <g fill="#5fa8e6" opacity="0.5">
       <polygon points="480,160 540,140 540,440 480,460"/><polygon points="480,160 420,140 420,440 480,460"/>
     </g>
     <g fill="#0c1622"><polygon points="540,140 960,80 960,520 540,440"/><polygon points="420,140 0,80 0,520 420,440"/></g>
     <g fill="#0a141f" opacity="0.9">
       ${Array.from({ length: 9 }, (_, i) => `<g transform="translate(${120 + i * 80},${420})"><circle cx="0" cy="0" r="16"/><rect x="-14" y="0" width="28" height="80"/></g>`).join("")}
     </g>
     <g fill="#5fa8e6" opacity="0.85"><circle cx="480" cy="430" r="18"/><rect x="462" y="430" width="36" height="100"/></g>`
  ),

  // 葬礼白花 —— 黑幕、白菊、冷烛
  funeral: wrap(
    `<linearGradient id="fnBg" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#070d15"/><stop offset="1" stop-color="#16222e"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#fnBg)"/>
     <rect x="340" y="120" width="280" height="200" fill="#0c1622"/>
     <rect x="340" y="120" width="280" height="200" fill="none" stroke="#1c3145" stroke-width="3"/>
     <line x1="370" y1="150" x2="590" y2="290" stroke="#3a5266" stroke-width="2" opacity="0.5"/>
     <line x1="590" y1="150" x2="370" y2="290" stroke="#3a5266" stroke-width="2" opacity="0.5"/>
     <g fill="#e6ecf2" opacity="0.85">
       <circle cx="250" cy="420" r="18"/><circle cx="290" cy="400" r="14"/><circle cx="710" cy="420" r="18"/><circle cx="670" cy="400" r="14"/>
     </g>
     <g fill="#caa15a" opacity="0.7"><rect x="200" y="440" width="6" height="60"/><rect x="754" y="440" width="6" height="60"/></g>
     ${speckle(67, 12, 100, "#9fb6cc")}`
  ),

  // 镜中自照 —— 一面冷镜、对望的影
  mirror: wrap(
    `<radialGradient id="mrBg" cx="0.5" cy="0.5" r="0.8">
       <stop offset="0" stop-color="#1c2e40"/><stop offset="1" stop-color="#080e16"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#mrBg)"/>
     <rect x="340" y="80" width="280" height="440" rx="6" fill="#0c1622" stroke="#5fa8e6" stroke-width="3" opacity="0.9"/>
     <rect x="356" y="96" width="248" height="408" rx="4" fill="#10202f" opacity="0.7"/>
     <g fill="#3a5266" opacity="0.8"><circle cx="480" cy="240" r="44"/><path d="M412,520 V400 Q412,330 480,330 Q548,330 548,400 V520 Z"/></g>
     <g fill="#9e3b32" opacity="0.5"><circle cx="466" cy="234" r="6"/><circle cx="496" cy="234" r="6"/></g>
     <line x1="600" y1="120" x2="380" y2="480" stroke="#5fa8e6" stroke-width="2" opacity="0.25"/>`
  ),

  // 天台抉择 —— 城市夜空、栏杆边的孤影
  rooftop: wrap(
    CITY_INK,
    `<rect width="${W}" height="${H}" fill="url(#cityInk)"/>
     ${speckle(83, 28, 220, "#cdd9e6")}
     <circle cx="180" cy="130" r="40" fill="#e6ecf2" opacity="0.4"/>
     <g fill="#0c1622">
       <rect x="0" y="320" width="160" height="280"/><rect x="220" y="380" width="140" height="220"/>
       <rect x="620" y="350" width="150" height="250"/><rect x="820" y="300" width="140" height="300"/>
     </g>
     ${windows(20, 340, 4, 6, 30, 5)}
     ${windows(640, 370, 4, 5, 30, 11)}
     <rect x="0" y="500" width="${W}" height="100" fill="#0a141f"/>
     <g stroke="#1c3145" stroke-width="4"><line x1="0" y1="500" x2="${W}" y2="500"/></g>
     <g fill="#0a141f"><circle cx="480" cy="450" r="18"/><rect x="462" y="450" width="36" height="60"/></g>`
  ),

  // 街头起步 —— 雨灰天、写字楼脚下渺小的你
  street: wrap(
    `<linearGradient id="stBg" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#16242e"/><stop offset="1" stop-color="#2c3e48"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#stBg)"/>
     <g stroke="#5f7a90" stroke-width="1" opacity="0.2">
       ${Array.from({ length: 24 }, (_, i) => `<line x1="${i * 42 + 6}" y1="0" x2="${i * 42 - 18}" y2="${H}"/>`).join("")}
     </g>
     <g fill="#0e1a28"><rect x="60" y="60" width="160" height="420"/><rect x="380" y="20" width="200" height="460"/><rect x="740" y="100" width="160" height="380"/></g>
     ${windows(72, 80, 4, 12, 32, 7)}
     ${windows(392, 40, 5, 13, 32, 13)}
     <rect x="0" y="470" width="${W}" height="130" fill="#1a2832"/>
     <g fill="#0c1822"><circle cx="480" cy="500" r="14"/><rect x="466" y="500" width="28" height="70"/></g>`
  ),

  // 签字/交易 —— 一支笔、一纸合约、冷光
  contract: wrap(
    `<radialGradient id="ctBg" cx="0.45" cy="0.4" r="0.7">
       <stop offset="0" stop-color="#1d2f42"/><stop offset="1" stop-color="#080e16"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#ctBg)"/>
     <g transform="rotate(-6 480 360)">
       <rect x="300" y="220" width="360" height="280" fill="#1a2a38"/>
       <g stroke="#3a5266" stroke-width="2" opacity="0.5">
         ${Array.from({ length: 8 }, (_, i) => `<line x1="330" y1="${260 + i * 26}" x2="630" y2="${260 + i * 26}"/>`).join("")}
       </g>
       <rect x="540" y="430" width="80" height="40" fill="#9e3b32" opacity="0.6"/>
     </g>
     <g transform="translate(560,300) rotate(40)" fill="#5fa8e6" opacity="0.85">
       <rect x="0" y="0" width="10" height="180" rx="4"/><polygon points="0,180 10,180 5,200"/>
     </g>
     ${speckle(97, 12, 120, "#5fa8e6")}`
  ),
};

export function karlArt(key: string | undefined): string {
  if (!key) return "";
  return ART[key] || "";
}
