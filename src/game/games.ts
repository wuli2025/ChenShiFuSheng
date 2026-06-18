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
    id: "zhugeliang",
    title: "出师未捷",
    subtitle: "从隆中草庐 · 到五丈原的秋风",
    tag: "史传 · 治国抉择",
    glyph: "卧",
    cover:
      "radial-gradient(120% 90% at 80% 6%, rgba(44,70,97,.6), transparent 58%), radial-gradient(90% 70% at 10% 98%, rgba(201,168,107,.34), transparent 55%), #0c1422",
    accent: "#c9a86b",
    playable: true,
  },
  {
    id: "sushi",
    title: "一蓑烟雨",
    subtitle: "宦海十年浮沉 · 一蓑烟雨任平生",
    tag: "史传 · 宦游漫游",
    glyph: "坡",
    cover:
      "radial-gradient(120% 90% at 78% 6%, rgba(44,70,97,.6), transparent 58%), radial-gradient(90% 70% at 10% 98%, rgba(154,143,176,.32), transparent 55%), #0d141f",
    accent: "#9a8fb0",
    playable: true,
  },
  {
    id: "wuzetian",
    title: "日月当空",
    subtitle: "从掖庭才人 · 到无字碑前的女皇",
    tag: "史传 · 权谋权衡",
    glyph: "曌",
    cover:
      "radial-gradient(120% 90% at 80% 4%, rgba(44,70,97,.6), transparent 58%), radial-gradient(90% 70% at 8% 98%, rgba(201,168,107,.36), transparent 55%), #100c16",
    accent: "#c9a86b",
    playable: true,
  },
  {
    id: "zhangqian",
    title: "凿空",
    subtitle: "持汉节十三年 · 万里凿空西域",
    tag: "史传 · 远征资源",
    glyph: "凿",
    cover:
      "radial-gradient(120% 90% at 78% 8%, rgba(44,70,97,.55), transparent 58%), radial-gradient(90% 70% at 12% 98%, rgba(199,154,90,.4), transparent 55%), #14110c",
    accent: "#c98b6b",
    playable: true,
  },
  {
    id: "wangyangming",
    title: "知行合一",
    subtitle: "格竹龙场悟道 · 此心光明亦复何言",
    tag: "史传 · 历练顿悟",
    glyph: "明",
    cover:
      "radial-gradient(120% 90% at 80% 6%, rgba(44,70,97,.6), transparent 58%), radial-gradient(90% 70% at 10% 98%, rgba(183,194,168,.32), transparent 55%), #0c1414",
    accent: "#b7c2a8",
    playable: true,
  },
  {
    id: "liqingzhao",
    title: "漱玉",
    subtitle: "赌书泼茶到物是人非 · 千古第一才女",
    tag: "史传 · 情缘离乱",
    glyph: "易",
    cover:
      "radial-gradient(120% 90% at 78% 6%, rgba(44,70,97,.6), transparent 58%), radial-gradient(90% 70% at 10% 98%, rgba(201,139,107,.34), transparent 55%), #0e1118",
    accent: "#c98b6b",
    playable: true,
  },
  {
    id: "zhenghe",
    title: "七下西洋",
    subtitle: "宝船蔽海 · 万里怀远柔夷",
    tag: "史传 · 远洋邦交",
    glyph: "舟",
    cover:
      "radial-gradient(120% 90% at 80% 6%, rgba(44,70,97,.62), transparent 58%), radial-gradient(90% 70% at 8% 98%, rgba(111,179,201,.3), transparent 55%), #0b1420",
    accent: "#8aa2b8",
    playable: true,
  },
  {
    id: "yingzheng",
    title: "六合",
    subtitle: "扫灭六国称皇帝 · 千古一帝的功罪",
    tag: "史传 · 帝国治理",
    glyph: "嬴",
    cover:
      "radial-gradient(120% 90% at 78% 4%, rgba(44,70,97,.6), transparent 58%), radial-gradient(90% 70% at 10% 98%, rgba(201,168,107,.36), transparent 55%), #110d0c",
    accent: "#c9a86b",
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
