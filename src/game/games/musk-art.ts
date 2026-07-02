// 《火星序曲》专属美术库 —— 马斯克线场景配图。
// 风格沿用 ink-art 的克制水墨底子(墨蓝远景 + 留白 + 单一点缀),
// 但点缀色改为科技冷光(#5fa8e6 / 冷青),暖色 #e8a85a 仅作灯火与火焰节制使用。
// 零图片依赖、随包内联;每个 key 对应一段合法 SVG。绝不用 emoji。

const W = 960;
const H = 600;

function wrap(defs: string, body: string): string {
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
}

// 伪随机墨点/星子(夜空、尘屑、噪点通用)
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

// 一层远景剪影(地平线/山脊/厂房轮廓的底)
function ridge(y: number, amp: number, color: string, opacity = 1): string {
  return `<path d="M0,${y} Q160,${y - amp} 320,${y} T640,${y} T960,${y - amp * 0.6} V600 H0 Z" fill="${color}" opacity="${opacity}"/>`;
}

const SKY_INK = `<linearGradient id="mSkyInk" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#0c1826"/><stop offset="0.6" stop-color="#16283c"/><stop offset="1" stop-color="#23394f"/>
</linearGradient>`;

const COLD = `<radialGradient id="mCold" cx="0.5" cy="0.5" r="0.6">
  <stop offset="0" stop-color="#9fd0f5"/><stop offset="1" stop-color="#2c5b86" stop-opacity="0"/>
</radialGradient>`;

const ART: Record<string, string> = {
  // 比勒陀利亚 · CRT 绿光下的少年程序员
  boy_pc: wrap(
    `<radialGradient id="crt" cx="0.5" cy="0.46" r="0.6">
       <stop offset="0" stop-color="#1b3326"/><stop offset="1" stop-color="#070d0a"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#crt)"/>
     ${speckle(13, 18, 200, "#5fe6a0")}
     <g fill="#0c1612"><rect x="300" y="430" width="360" height="20"/><rect x="350" y="450" width="14" height="120"/><rect x="596" y="450" width="14" height="120"/></g>
     <g><rect x="392" y="250" width="176" height="150" rx="8" fill="#0a1c14" stroke="#19402c" stroke-width="3"/>
        <rect x="408" y="266" width="144" height="110" fill="#0d2a1c"/></g>
     <g stroke="#5fe6a0" stroke-width="1.5" opacity="0.8">
       <line x1="420" y1="284" x2="520" y2="284"/><line x1="420" y1="300" x2="540" y2="300"/>
       <line x1="420" y1="316" x2="500" y2="316"/><line x1="420" y1="332" x2="536" y2="332"/>
       <line x1="420" y1="348" x2="476" y2="348"/></g>
     <ellipse cx="480" cy="320" rx="150" ry="100" fill="#5fe6a0" opacity="0.07"/>
     <circle cx="480" cy="470" r="26" fill="#0a1410"/><rect x="468" y="470" width="24" height="40" fill="#0a1410"/>`
  ),

  // 离开南非 · 机场玻璃幕墙下的孤影
  departure: wrap(
    SKY_INK,
    `<rect width="${W}" height="${H}" fill="url(#mSkyInk)"/>
     ${speckle(23, 26, 220, "#bcd4ea")}
     <g stroke="#2f4f6e" stroke-width="1.5" opacity="0.5">
       ${Array.from({ length: 9 }, (_, i) => `<line x1="${i * 120}" y1="0" x2="${i * 120}" y2="${H}"/>`).join("")}
       <line x1="0" y1="120" x2="${W}" y2="120"/><line x1="0" y1="300" x2="${W}" y2="300"/>
     </g>
     <path d="M120,120 L260,70 L760,70 L900,120 Z" fill="#5fa8e6" opacity="0.12"/>
     <g transform="translate(560,160) rotate(-12)" fill="#1a2b3c" opacity="0.9">
       <path d="M0,0 L120,-10 L150,0 L120,10 Z"/><path d="M40,-4 L60,-46 L74,-44 L62,-2 Z"/><path d="M40,4 L60,46 L74,44 L62,2 Z"/></g>
     <rect x="0" y="430" width="${W}" height="170" fill="#0d1c2c"/>
     <g fill="#06101a"><rect x="468" y="360" width="24" height="100"/><polygon points="456,360 504,360 492,330 468,330"/></g>
     <ellipse cx="480" cy="468" rx="60" ry="10" fill="#5fa8e6" opacity="0.12"/>`
  ),

  // 宾大宿舍 · 灯下书桌,墙上三命题
  dorm: wrap(
    `<radialGradient id="mLamp" cx="0.4" cy="0.4" r="0.62">
       <stop offset="0" stop-color="#26384c"/><stop offset="1" stop-color="#070d16"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#mLamp)"/>
     <circle cx="330" cy="200" r="16" fill="#e8c98a" opacity="0.95"/>
     <polygon points="330,212 256,440 420,440" fill="#e8c98a" opacity="0.08"/>
     <g fill="#101c2a"><rect x="180" y="430" width="560" height="18"/><rect x="220" y="448" width="16" height="120"/><rect x="704" y="448" width="16" height="120"/></g>
     <g fill="#16283a" opacity="0.9"><rect x="540" y="150" width="300" height="200" rx="4"/></g>
     <g stroke="#5fa8e6" stroke-width="1.5" opacity="0.7" fill="none">
       <text x="566" y="196" fill="#7cc0f0" font-size="20" font-family="serif">多行星</text>
       <text x="566" y="252" fill="#7cc0f0" font-size="20" font-family="serif">可持续能源</text>
       <text x="566" y="308" fill="#7cc0f0" font-size="20" font-family="serif">互联网</text>
       <line x1="560" y1="170" x2="560" y2="330"/></g>
     <g fill="#1d3144"><rect x="430" y="392" width="150" height="40" rx="3"/></g>`
  ),

  // 1995 岔路 · 斯坦福校园林荫两歧
  crossroad: wrap(
    SKY_INK,
    `<rect width="${W}" height="${H}" fill="url(#mSkyInk)"/>
     ${speckle(31, 22, 220, "#bcd4ea")}
     <circle cx="740" cy="140" r="40" fill="#dfe9f2" opacity="0.4"/>
     ${ridge(330, 70, "#1a2c40", 0.6)}
     <rect x="0" y="420" width="${W}" height="180" fill="#10202f"/>
     <polygon points="480,420 360,600 240,600 440,420" fill="#16283a"/>
     <polygon points="480,420 600,600 720,600 520,420" fill="#132434"/>
     <line x1="480" y1="420" x2="300" y2="600" stroke="#3a5a78" stroke-width="1" opacity="0.4"/>
     <line x1="480" y1="420" x2="660" y2="600" stroke="#3a5a78" stroke-width="1" opacity="0.4"/>
     <g stroke="#0a141f" stroke-width="6">
       <line x1="180" y1="420" x2="180" y2="280"/><line x1="180" y1="320" x2="146" y2="296"/>
       <line x1="800" y1="420" x2="800" y2="290"/><line x1="800" y1="330" x2="834" y2="306"/></g>`
  ),

  // Zip2 车库 · 睡袋、显示器、深夜码代码
  garage: wrap(
    `<radialGradient id="mGarage" cx="0.5" cy="0.55" r="0.7">
       <stop offset="0" stop-color="#1a2738"/><stop offset="1" stop-color="#080d15"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#mGarage)"/>
     <g stroke="#23384c" stroke-width="2" opacity="0.5">
       ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${80 + i * 24}" x2="${W}" y2="${80 + i * 24}"/>`).join("")}
       <rect x="120" y="80" width="720" height="160" fill="none" stroke="#2f4f6e"/></g>
     <g><rect x="392" y="300" width="170" height="120" rx="6" fill="#0a1c2a" stroke="#1d4060" stroke-width="3"/>
        <rect x="406" y="314" width="142" height="92" fill="#0c2638"/></g>
     <g stroke="#5fa8e6" stroke-width="1.5" opacity="0.85">
       <line x1="418" y1="332" x2="510" y2="332"/><line x1="418" y1="348" x2="528" y2="348"/>
       <line x1="418" y1="364" x2="486" y2="364"/><line x1="418" y1="380" x2="520" y2="380"/></g>
     <ellipse cx="476" cy="360" rx="130" ry="90" fill="#5fa8e6" opacity="0.06"/>
     <g fill="#13202e"><rect x="360" y="420" width="240" height="14"/></g>
     <path d="M120,520 q40,-40 120,-30 q90,12 100,38 q-110,16 -220,-8 z" fill="#2a3646" opacity="0.9"/>
     <ellipse cx="200" cy="512" rx="44" ry="18" fill="#34465a" opacity="0.8"/>`
  ),

  // 玻璃会议室 · 董事会的阴影,长桌剪影
  boardroom: wrap(
    `<linearGradient id="mBoard" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#16222f"/><stop offset="1" stop-color="#0a121b"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#mBoard)"/>
     <g stroke="#2f4f6e" stroke-width="1.5" opacity="0.45">
       ${Array.from({ length: 7 }, (_, i) => `<line x1="${i * 160}" y1="0" x2="${i * 160}" y2="380"/>`).join("")}
       <line x1="0" y1="200" x2="${W}" y2="200"/></g>
     <rect x="0" y="120" width="${W}" height="120" fill="#5fa8e6" opacity="0.06"/>
     <ellipse cx="480" cy="470" rx="360" ry="60" fill="#0e1b27"/>
     <ellipse cx="480" cy="462" rx="360" ry="56" fill="#1a2a3a"/>
     <g fill="#070e16">
       <ellipse cx="240" cy="420" rx="34" ry="46"/><ellipse cx="360" cy="408" rx="34" ry="46"/>
       <ellipse cx="600" cy="408" rx="34" ry="46"/><ellipse cx="720" cy="420" rx="34" ry="46"/>
       <ellipse cx="480" cy="540" rx="40" ry="50"/></g>
     <ellipse cx="480" cy="540" rx="40" ry="50" fill="#16283a"/>`
  ),

  // X.com · 夜雨街角的霓虹招牌
  xcom: wrap(
    `<linearGradient id="mXsky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#0a1422"/><stop offset="1" stop-color="#141f2e"/>
     </linearGradient>${COLD}`,
    `<rect width="${W}" height="${H}" fill="url(#mXsky)"/>
     <g stroke="#23384c" stroke-width="1" opacity="0.4">
       ${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 30 + 4}" y1="0" x2="${i * 30 - 16}" y2="${H}"/>`).join("")}</g>
     <g fill="#0c1826"><rect x="80" y="220" width="220" height="380"/><rect x="660" y="180" width="220" height="420"/></g>
     <g fill="#5fa8e6" opacity="0.18">
       ${Array.from({ length: 16 }, (_, i) => `<rect x="${100 + (i % 4) * 50}" y="${250 + Math.floor(i / 4) * 60}" width="22" height="30"/>`).join("")}</g>
     <ellipse cx="480" cy="230" rx="180" ry="120" fill="url(#mCold)" opacity="0.5"/>
     <text x="480" y="250" fill="#9fd0f5" font-size="92" font-family="serif" text-anchor="middle" opacity="0.95">X</text>
     <text x="480" y="300" fill="#7cc0f0" font-size="34" font-family="serif" text-anchor="middle" opacity="0.8">.com</text>`
  ),

  // 机舱政变 · 高空舷窗外的云海,空座椅
  coup: wrap(
    `<linearGradient id="mCabin" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#12202f"/><stop offset="1" stop-color="#0a121b"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#mCabin)"/>
     <g fill="#0c1826"><rect x="0" y="0" width="${W}" height="${H}"/></g>
     <ellipse cx="700" cy="240" rx="120" ry="150" fill="#1d3550"/>
     <ellipse cx="700" cy="240" rx="92" ry="122" fill="#3a6a98" opacity="0.7"/>
     <path d="M620,300 q60,-30 160,0 q-50,30 -160,0 z" fill="#dfe9f2" opacity="0.5"/>
     <path d="M640,210 q50,-22 120,4 q-60,18 -120,-4 z" fill="#cfe2f2" opacity="0.4"/>
     <g fill="#101c2a"><rect x="80" y="300" width="120" height="160" rx="14"/><rect x="240" y="300" width="120" height="160" rx="14"/></g>
     <rect x="80" y="300" width="120" height="50" rx="14" fill="#16283a"/>
     <rect x="240" y="300" width="120" height="50" rx="14" fill="#16283a"/>
     <ellipse cx="480" cy="560" rx="420" ry="40" fill="#070e16" opacity="0.6"/>`
  ),

  // 深夜 · 火星与电动车的两张草图并置
  mars_desk: wrap(
    `<radialGradient id="mDesk" cx="0.5" cy="0.42" r="0.66">
       <stop offset="0" stop-color="#1c2030"/><stop offset="1" stop-color="#080a12"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#mDesk)"/>
     <circle cx="480" cy="120" r="14" fill="#e8c98a" opacity="0.9"/>
     <polygon points="480,132 380,440 580,440" fill="#e8c98a" opacity="0.06"/>
     <g><rect x="120" y="220" width="300" height="220" rx="4" fill="#10202f" stroke="#2f4f6e" stroke-width="2"/>
        <circle cx="270" cy="330" r="70" fill="#7a3a2a" opacity="0.55"/>
        <circle cx="246" cy="312" r="70" fill="#10202f" opacity="0.5"/>
        <text x="270" y="420" fill="#c98b6b" font-size="18" font-family="serif" text-anchor="middle">MARS</text></g>
     <g><rect x="540" y="220" width="300" height="220" rx="4" fill="#10202f" stroke="#2f4f6e" stroke-width="2"/>
        <path d="M580,360 q40,-50 110,-50 q70,0 110,50 z" fill="none" stroke="#5fa8e6" stroke-width="2"/>
        <circle cx="620" cy="360" r="20" fill="none" stroke="#5fa8e6" stroke-width="2"/>
        <circle cx="760" cy="360" r="20" fill="none" stroke="#5fa8e6" stroke-width="2"/>
        <text x="690" y="420" fill="#5fa8e6" font-size="18" font-family="serif" text-anchor="middle">EV</text></g>`
  ),

  // SpaceX 机库 · 火箭立架旁,亲手拧螺栓
  hangar: wrap(
    `<linearGradient id="mHangar" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#101a26"/><stop offset="1" stop-color="#0a1018"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#mHangar)"/>
     <g stroke="#23384c" stroke-width="2" opacity="0.4">
       <path d="M40,200 Q480,60 920,200" fill="none"/><path d="M40,260 Q480,130 920,260" fill="none"/>
       ${Array.from({ length: 8 }, (_, i) => `<line x1="${120 + i * 100}" y1="${200 - Math.abs(i - 3.5) * 18}" x2="${120 + i * 100}" y2="${H}"/>`).join("")}</g>
     <g><rect x="430" y="120" width="100" height="380" fill="#1a2734"/>
        <polygon points="430,120 480,40 530,120" fill="#22384c"/>
        <rect x="430" y="120" width="100" height="380" fill="none" stroke="#2f4f6e" stroke-width="1.5"/>
        <line x1="480" y1="120" x2="480" y2="500" stroke="#3a5a78" stroke-width="1" opacity="0.5"/></g>
     <circle cx="540" cy="380" r="70" fill="url(#mCold)" opacity="0.35"/>
     <g fill="#5fa8e6"><circle cx="540" cy="380" r="6"/><circle cx="552" cy="392" r="4"/></g>
     <ellipse cx="480" cy="560" rx="380" ry="40" fill="#070e16"/>`
  ),

  // Roadster · 聚光灯下的电动跑车
  roadster: wrap(
    `<radialGradient id="mStage" cx="0.5" cy="0.3" r="0.75">
       <stop offset="0" stop-color="#1e2c3c"/><stop offset="1" stop-color="#070c14"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#mStage)"/>
     <polygon points="480,40 320,460 640,460" fill="#5fa8e6" opacity="0.08"/>
     <circle cx="480" cy="60" r="20" fill="#cfe2f2" opacity="0.5"/>
     <g>
       <path d="M250,420 q40,-70 140,-78 q90,-8 150,12 q70,18 170,66 q-10,30 -60,30 l-540,0 q-44,0 -60,-30 z" fill="#142536" stroke="#2f6a9a" stroke-width="2"/>
       <path d="M360,360 q70,-26 200,-10 q40,6 60,28 l-300,0 z" fill="#1d3a54" opacity="0.8"/>
       <circle cx="350" cy="448" r="44" fill="#0a141f" stroke="#2f4f6e" stroke-width="3"/>
       <circle cx="650" cy="448" r="44" fill="#0a141f" stroke="#2f4f6e" stroke-width="3"/>
       <circle cx="350" cy="448" r="16" fill="#5fa8e6" opacity="0.5"/><circle cx="650" cy="448" r="16" fill="#5fa8e6" opacity="0.5"/></g>
     <ellipse cx="480" cy="510" rx="320" ry="30" fill="#5fa8e6" opacity="0.1"/>`
  ),

  // 两线作战 · 两座厂房,中间奔波的身影
  dual: wrap(
    SKY_INK,
    `<rect width="${W}" height="${H}" fill="url(#mSkyInk)"/>
     ${speckle(43, 18, 200, "#bcd4ea")}
     <g fill="#0e1c2a"><rect x="40" y="300" width="320" height="220"/>
        <polygon points="40,300 200,250 360,300"/>
        <text x="200" y="430" fill="#c98b6b" font-size="22" font-family="serif" text-anchor="middle" opacity="0.7">SpaceX</text></g>
     <g fill="#0e1c2a"><rect x="600" y="300" width="320" height="220"/>
        <polygon points="600,300 760,250 920,300"/>
        <text x="760" y="430" fill="#5fa8e6" font-size="22" font-family="serif" text-anchor="middle" opacity="0.7">Tesla</text></g>
     <rect x="0" y="520" width="${W}" height="80" fill="#0a141f"/>
     <path d="M360,420 C440,460 520,460 600,420" fill="none" stroke="#3a5a78" stroke-width="2" stroke-dasharray="8 8" opacity="0.6"/>
     <g fill="#06101a"><rect x="470" y="400" width="20" height="80"/><circle cx="480" cy="390" r="14"/></g>`
  ),

  // 2008 危机 · 黑暗的办公室,一盏将熄的灯
  crisis: wrap(
    `<radialGradient id="mCrisis" cx="0.46" cy="0.4" r="0.5">
       <stop offset="0" stop-color="#1c2230"/><stop offset="1" stop-color="#05080e"/>
     </radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#mCrisis)"/>
     <circle cx="430" cy="200" r="12" fill="#d8b079" opacity="0.7"/>
     <polygon points="430,210 360,440 500,440" fill="#d8b079" opacity="0.05"/>
     <g fill="#0a121c"><rect x="200" y="430" width="560" height="18"/></g>
     <g stroke="#7a2e2e" stroke-width="2" opacity="0.7" fill="none">
       <path d="M540,360 L580,330 L620,380 L660,300 L700,350 L740,290"/></g>
     <g fill="#16283a" opacity="0.8"><rect x="520" y="280" width="240" height="130" rx="3"/></g>
     <g stroke="#3a5a78" stroke-width="1" opacity="0.3">
       <line x1="240" y1="0" x2="240" y2="430"/><line x1="720" y1="0" x2="720" y2="430"/></g>
     <ellipse cx="430" cy="320" rx="160" ry="140" fill="#e8a85a" opacity="0.04"/>`
  ),

  // 2008.9.28 · 夸贾林环礁夜空,猎鹰一号升空
  falcon_night: wrap(
    `<linearGradient id="mNight" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#070d18"/><stop offset="0.7" stop-color="#0e1c2e"/><stop offset="1" stop-color="#13283c"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#mNight)"/>
     ${speckle(67, 90, 380, "#cfe2f2")}
     <rect x="0" y="500" width="${W}" height="100" fill="#0a141f"/>
     <g stroke="#2f4f6e" stroke-width="1" opacity="0.4"><line x1="0" y1="500" x2="${W}" y2="500"/></g>
     <g transform="translate(480,0)">
       <rect x="-8" y="120" width="16" height="180" fill="#cfe2f2"/>
       <polygon points="-8,120 0,90 8,120" fill="#e8eef4"/>
       <ellipse cx="0" cy="320" rx="26" ry="90" fill="#e8a85a" opacity="0.85"/>
       <ellipse cx="0" cy="420" rx="44" ry="140" fill="#e8a85a" opacity="0.35"/>
       <ellipse cx="0" cy="520" rx="70" ry="90" fill="#f4d08a" opacity="0.4"/>
       <line x1="0" y1="300" x2="0" y2="80" stroke="#5fa8e6" stroke-width="1" opacity="0.5"/></g>
     <ellipse cx="480" cy="540" rx="260" ry="50" fill="#e8a85a" opacity="0.12"/>`
  ),

  // NASA 合同 · 控制室,众屏前的欢呼剪影
  mission_control: wrap(
    `<linearGradient id="mCtrl" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#0c1622"/><stop offset="1" stop-color="#0a121c"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#mCtrl)"/>
     <g fill="#0a1c2a" stroke="#2f6a9a" stroke-width="2">
       <rect x="60" y="80" width="240" height="150" rx="4"/><rect x="360" y="60" width="240" height="170" rx="4"/><rect x="660" y="80" width="240" height="150" rx="4"/></g>
     <g stroke="#5fa8e6" stroke-width="1.5" opacity="0.7" fill="none">
       <path d="M380,180 L420,150 L460,170 L500,120 L540,150 L580,110"/>
       <line x1="80" y1="120" x2="280" y2="120"/><line x1="80" y1="150" x2="240" y2="150"/>
       <line x1="680" y1="120" x2="880" y2="120"/><line x1="680" y1="180" x2="840" y2="180"/></g>
     <rect x="0" y="360" width="${W}" height="240" fill="#0e1a26"/>
     <g fill="#06101a">
       <ellipse cx="200" cy="420" rx="30" ry="42"/><ellipse cx="340" cy="420" rx="30" ry="42"/>
       <ellipse cx="620" cy="420" rx="30" ry="42"/><ellipse cx="760" cy="420" rx="30" ry="42"/>
       <ellipse cx="480" cy="410" rx="32" ry="46"/></g>
     <ellipse cx="480" cy="360" rx="420" ry="60" fill="url(#mCold)" opacity="0.3"/>`
  ),

  // 2010.6.29 · 纳斯达克敲钟,绿色行情大屏
  ipo: wrap(
    `<linearGradient id="mIpo" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#0a141f"/><stop offset="1" stop-color="#10202f"/>
     </linearGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#mIpo)"/>
     <rect x="100" y="80" width="760" height="280" rx="6" fill="#06120a" stroke="#1d6040" stroke-width="3"/>
     ${speckle(83, 16, 80, "#5fe6a0")}
     <g stroke="#5fe6a0" stroke-width="2.5" opacity="0.85" fill="none">
       <path d="M140,300 L240,260 L320,280 L420,200 L520,230 L620,150 L720,180 L820,110"/></g>
     <g stroke="#1d6040" stroke-width="1" opacity="0.5">
       ${Array.from({ length: 6 }, (_, i) => `<line x1="120" y1="${120 + i * 40}" x2="840" y2="${120 + i * 40}"/>`).join("")}</g>
     <text x="480" y="330" fill="#7cf0b0" font-size="30" font-family="serif" text-anchor="middle" opacity="0.85">TSLA</text>
     <g fill="#06101a"><rect x="380" y="420" width="200" height="120"/><polygon points="360,420 480,360 600,420"/></g>
     <circle cx="480" cy="470" r="30" fill="#caa15a" opacity="0.85"/>
     <line x1="480" y1="470" x2="540" y2="430" stroke="#caa15a" stroke-width="6"/>
     <ellipse cx="480" cy="560" rx="300" ry="40" fill="#5fe6a0" opacity="0.06"/>`
  ),
};

export function muskArt(key: string | undefined): string {
  if (!key) return "";
  return ART[key] || "";
}
