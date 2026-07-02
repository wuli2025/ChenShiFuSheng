// 自动生成 —— 由 scripts/pollinations/build-manifest.mjs 扫描 public/story-art 产出。
// 键: "<gameId>/<sceneId>" → 静态资源根路径。GameView/playModel 据此把真实配图/旁白挂到场景上。
// artFor/voiceFor/videoFor 经 assetUrl() 解析:设了 CDN 基址(VITE_ASSET_BASE)走 R2,否则用本地 public/。
// 三主线 musk/karl/zhuyuanzhang 为 Pollinations(Flux)真实生成配图;无对应键的场景回退到内联 SVG。
import { assetUrl } from "./assets";

export const ART: Record<string, string> = {
  "chenshi/age14": "/story-art/chenshi/age14.png",
  "chenshi/age21": "/story-art/chenshi/age21.png",
  "chenshi/age28_office": "/story-art/chenshi/age28_office.png",
  "chenshi/age28_south": "/story-art/chenshi/age28_south.png",
  "chenshi/age7": "/story-art/chenshi/age7.png",
  "karl/k_betray": "/story-art/karl/k_betray.png",
  "karl/k_betray_choice": "/story-art/karl/k_betray_choice.png",
  "karl/k_cell": "/story-art/karl/k_cell.png",
  "karl/k_charity": "/story-art/karl/k_charity.png",
  "karl/k_climb": "/story-art/karl/k_climb.png",
  "karl/k_court": "/story-art/karl/k_court.png",
  "karl/k_crisis": "/story-art/karl/k_crisis.png",
  "karl/k_expose": "/story-art/karl/k_expose.png",
  "karl/k_honeymoon": "/story-art/karl/k_honeymoon.png",
  "karl/k_loss": "/story-art/karl/k_loss.png",
  "karl/k_marry": "/story-art/karl/k_marry.png",
  "karl/k_office": "/story-art/karl/k_office.png",
  "karl/k_peak": "/story-art/karl/k_peak.png",
  "karl/k_press": "/story-art/karl/k_press.png",
  "karl/k_promo": "/story-art/karl/k_promo.png",
  "karl/k_start": "/story-art/karl/k_start.png",
  "karl/k_steal": "/story-art/karl/k_steal.png",
  "karl/k_summit": "/story-art/karl/k_summit.png",
  "karl/k_verdict": "/story-art/karl/k_verdict.png",
  "karl/k_war": "/story-art/karl/k_war.png",
  "karl/k_war_choice": "/story-art/karl/k_war_choice.png",
  "musk/m_arrival": "/story-art/musk/m_arrival.png",
  "musk/m_boy": "/story-art/musk/m_boy.png",
  "musk/m_boy2": "/story-art/musk/m_boy2.png",
  "musk/m_coup": "/story-art/musk/m_coup.png",
  "musk/m_crisis": "/story-art/musk/m_crisis.png",
  "musk/m_crossroad": "/story-art/musk/m_crossroad.png",
  "musk/m_dual": "/story-art/musk/m_dual.png",
  "musk/m_ebay": "/story-art/musk/m_ebay.png",
  "musk/m_falcon": "/story-art/musk/m_falcon.png",
  "musk/m_ipo": "/story-art/musk/m_ipo.png",
  "musk/m_kwaj": "/story-art/musk/m_kwaj.png",
  "musk/m_leave": "/story-art/musk/m_leave.png",
  "musk/m_mars_desk": "/story-art/musk/m_mars_desk.png",
  "musk/m_nasa": "/story-art/musk/m_nasa.png",
  "musk/m_paypal_merge": "/story-art/musk/m_paypal_merge.png",
  "musk/m_spacex": "/story-art/musk/m_spacex.png",
  "musk/m_tesla": "/story-art/musk/m_tesla.png",
  "musk/m_tesla_hell": "/story-art/musk/m_tesla_hell.png",
  "musk/m_upenn": "/story-art/musk/m_upenn.png",
  "musk/m_xcom": "/story-art/musk/m_xcom.png",
  "musk/m_zip2": "/story-art/musk/m_zip2.png",
  "musk/m_zip2_grow": "/story-art/musk/m_zip2_grow.png",
  "musk/m_zip2_sell": "/story-art/musk/m_zip2_sell.png",
  "zhuyuanzhang/z_beg_event": "/story-art/zhuyuanzhang/z_beg_event.png",
  "zhuyuanzhang/z_jiqing_event": "/story-art/zhuyuanzhang/z_jiqing_event.png",
  "zhuyuanzhang/z_join_in": "/story-art/zhuyuanzhang/z_join_in.png",
  "zhuyuanzhang/z_last_breath": "/story-art/zhuyuanzhang/z_last_breath.png",
  "zhuyuanzhang/z_last_in": "/story-art/zhuyuanzhang/z_last_in.png",
  "zhuyuanzhang/z_late_event": "/story-art/zhuyuanzhang/z_late_event.png",
  "zhuyuanzhang/z_marry_in": "/story-art/zhuyuanzhang/z_marry_in.png",
  "zhuyuanzhang/z_north_in": "/story-art/zhuyuanzhang/z_north_in.png",
  "zhuyuanzhang/z_north_win": "/story-art/zhuyuanzhang/z_north_win.png",
  "zhuyuanzhang/z_plague_bury": "/story-art/zhuyuanzhang/z_plague_bury.png",
  "zhuyuanzhang/z_plague_in": "/story-art/zhuyuanzhang/z_plague_in.png",
  "zhuyuanzhang/z_poyang_in": "/story-art/zhuyuanzhang/z_poyang_in.png",
  "zhuyuanzhang/z_poyang_win": "/story-art/zhuyuanzhang/z_poyang_win.png",
  "zhuyuanzhang/z_purge_in": "/story-art/zhuyuanzhang/z_purge_in.png",
  "zhuyuanzhang/z_recruit_event": "/story-art/zhuyuanzhang/z_recruit_event.png",
  "zhuyuanzhang/z_start": "/story-art/zhuyuanzhang/z_start.png",
  "zhuyuanzhang/z_temple_in": "/story-art/zhuyuanzhang/z_temple_in.png",
  "zhuyuanzhang/z_throne_in": "/story-art/zhuyuanzhang/z_throne_in.png",
  "zhuyuanzhang/z_zhang_event": "/story-art/zhuyuanzhang/z_zhang_event.png"
};

export const VOICE: Record<string, string> = {
  "chenshi/age7": "/story-voice/chenshi/age7.mp3",
  "chenshi/age14": "/story-voice/chenshi/age14.mp3"
};

export const VIDEO: Record<string, string> = {};

export function artFor(gameId: string, sceneId: string): string | undefined {
  return assetUrl(ART[gameId + "/" + sceneId]);
}
export function voiceFor(gameId: string, sceneId: string): string | undefined {
  return assetUrl(VOICE[gameId + "/" + sceneId]);
}
export function videoFor(gameId: string, sceneId: string): string | undefined {
  return assetUrl(VIDEO[gameId + "/" + sceneId]);
}
