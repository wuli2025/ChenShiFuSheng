// 外部 HTML 游戏：自包含的单文件 HTML，放在 public/external-games/，用 iframe 全屏加载。
export interface ExternalGame {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  glyph: string;
  cover: string;
  accent: string;
  url: string; // 相对站点根路径
}

export const EXTERNAL_GAMES: ExternalGame[] = [
  {
    id: "ext-musk-life",
    title: "尘世浮生 · 马斯克人生分支模拟",
    subtitle: "16 次选择 · 控制权、资本、风险与长期主义的代价",
    tag: "传记 · 分支模拟",
    glyph: "马",
    cover:
      "radial-gradient(120% 90% at 78% 4%, rgba(44,70,97,.62), transparent 56%), radial-gradient(90% 70% at 14% 96%, rgba(201,108,60,.45), transparent 55%), #0b1320",
    accent: "#5fa8e6",
    url: "/external-games/musk-life/index.html",
  },
  {
    id: "ext-wuchi",
    title: "无耻浮生 · 卡尔的选择",
    subtitle: "一个人能无耻到什么地步 · 多结局抉择",
    tag: "叙事 · 黑色幽默",
    glyph: "耻",
    cover:
      "radial-gradient(120% 90% at 80% 0%, rgba(120,60,60,.5), transparent 60%), radial-gradient(100% 80% at 0% 100%, rgba(60,50,40,.4), transparent 55%), #15100f",
    accent: "#c97a6b",
    url: "/external-games/wuchi-karl.html",
  },
  {
    id: "ext-chongzhen",
    title: "重生 · 崇祯十七年",
    subtitle: "甲申国变 · 你能否扭转大明的结局",
    tag: "历史 · 策略抉择",
    glyph: "崇",
    cover:
      "radial-gradient(120% 90% at 78% 6%, rgba(90,70,40,.55), transparent 58%), radial-gradient(90% 70% at 12% 96%, rgba(120,40,40,.4), transparent 55%), #14100c",
    accent: "#c9a86b",
    url: "/external-games/chongzhen-17.html",
  },
  {
    id: "ext-mars",
    title: "火星序曲 · 马斯克模拟人生",
    subtitle: "从邮购支付到红色星球 · 一场豪赌",
    tag: "传记 · 科技创业",
    glyph: "火",
    cover:
      "radial-gradient(120% 90% at 80% 0%, rgba(140,60,40,.5), transparent 60%), radial-gradient(100% 80% at 0% 100%, rgba(44,70,97,.4), transparent 55%), #160f0c",
    accent: "#d2734a",
    url: "/external-games/mars-musk.html",
  },
];

export function getExternalGame(id: string | null): ExternalGame | null {
  if (!id) return null;
  return EXTERNAL_GAMES.find((g) => g.id === id) || null;
}
