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

// 马斯克 / 卡尔 已转为内置精修剧本(games/musk.ts、games/karl.ts),
// 旧的外部 HTML 占位(文件本不存在)全部下线。保留空表与类型,以兼容大厅引用。
export const EXTERNAL_GAMES: ExternalGame[] = [];

export function getExternalGame(id: string | null): ExternalGame | null {
  if (!id) return null;
  return EXTERNAL_GAMES.find((g) => g.id === id) || null;
}
