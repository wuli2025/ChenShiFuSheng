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
    id: "musk",
    title: "钢铁之路",
    subtitle: "从比勒陀利亚的旧电脑,到纳斯达克的钟声",
    tag: "传记 · 创业抉择",
    glyph: "钢",
    cover:
      "radial-gradient(120% 90% at 78% 6%, rgba(44,70,97,.6), transparent 58%), radial-gradient(90% 70% at 12% 96%, rgba(201,108,60,.42), transparent 55%), #0c1422",
    accent: "#c9a86b",
    playable: true,
  },
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
