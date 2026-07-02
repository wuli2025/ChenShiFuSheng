// 大厅展示的游戏清单。playable=true 的走内置播放器,其余先占位。
export interface GameMeta {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  // 封面用纯 CSS 渐变 + 一个篆字,零图片依赖,日后可换真实立绘
  glyph: string;
  cover: string; // CSS background
  accent: string;
  playable: boolean;
}

export const GAMES: GameMeta[] = [
  {
    id: "chenshi",
    title: "尘世浮生",
    subtitle: "七年一回首 · 一生在抉择间浮沉",
    tag: "叙事 · 人生模拟",
    glyph: "浮",
    cover:
      "radial-gradient(120% 90% at 80% 0%, rgba(44,70,97,.55), transparent 60%), radial-gradient(100% 80% at 0% 100%, rgba(90,55,50,.4), transparent 55%), #14161a",
    accent: "#c98b6b",
    playable: true,
  },
  {
    id: "musk",
    title: "火星序曲",
    subtitle: "从比勒陀利亚的少年 · 到红色星球的引力",
    tag: "传记 · 科技创业",
    glyph: "马",
    cover:
      "radial-gradient(120% 90% at 78% 4%, rgba(44,70,97,.62), transparent 56%), radial-gradient(90% 70% at 14% 96%, rgba(95,168,230,.4), transparent 55%), #0b1320",
    accent: "#5fa8e6",
    playable: true,
  },
  {
    id: "karl",
    title: "无耻浮生",
    subtitle: "卡尔的选择 · 一个人能无耻到什么地步",
    tag: "寓言 · 黑色幽默",
    glyph: "耻",
    cover:
      "radial-gradient(120% 90% at 80% 0%, rgba(120,60,60,.5), transparent 60%), radial-gradient(100% 80% at 0% 100%, rgba(60,50,40,.42), transparent 55%), #15100f",
    accent: "#c97a6b",
    playable: true,
  },
  {
    id: "zhuyuanzhang",
    title: "布衣天子",
    subtitle: "从放牛娃到开国帝王 · 草根逆袭",
    tag: "史传 · 草根逆袭",
    glyph: "洪",
    cover:
      "radial-gradient(120% 90% at 80% 6%, rgba(44,70,97,.6), transparent 58%), radial-gradient(90% 70% at 10% 98%, rgba(201,108,60,.4), transparent 55%), #100c0a",
    accent: "#c98b6b",
    playable: true,
  },
  {
    id: "soon",
    title: "敬请期待",
    subtitle: "下一个世界正在落墨",
    tag: "—",
    glyph: "?",
    cover: "linear-gradient(160deg,#16161a,#0c0c0e)",
    accent: "#5a606b",
    playable: false,
  },
];
