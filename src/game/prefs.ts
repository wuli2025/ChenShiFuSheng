// 玩家体验偏好(reactive + localStorage)。对标成熟 VN:文本速度/打字机/自动速度/
// 转场速度/字号/暗角/浮尘/缓动镜头 —— 全部可在设置里调。
import { reactive, watch } from "vue";

export interface Prefs {
  textSpeed: number; // 每字毫秒,越小越快(6..80)
  typewriter: boolean; // 关闭则整句瞬显
  autoSpeed: number; // 自动播放每步毫秒(400..3000)
  transition: number; // 场景淡切毫秒(0..700)
  fontScale: number; // 正文字号倍率(0.85..1.4)
  vignette: boolean; // 四角压暗
  particles: boolean; // 水墨浮尘
  kenBurns: boolean; // 背景缓动镜头
}

const KEY = "polaris.prefs.v1";

const DEFAULTS: Prefs = {
  textSpeed: 28,
  typewriter: true,
  autoSpeed: 1100,
  transition: 300,
  fontScale: 1,
  vignette: true,
  particles: true,
  kenBurns: true,
};

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      return {
        textSpeed: clampNum(o.textSpeed, 6, 80, DEFAULTS.textSpeed),
        typewriter: o.typewriter !== false,
        autoSpeed: clampNum(o.autoSpeed, 400, 3000, DEFAULTS.autoSpeed),
        transition: clampNum(o.transition, 0, 700, DEFAULTS.transition),
        fontScale: clampNum(o.fontScale, 0.85, 1.4, DEFAULTS.fontScale),
        vignette: o.vignette !== false,
        particles: o.particles !== false,
        kenBurns: o.kenBurns !== false,
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

function clampNum(v: any, lo: number, hi: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

export const prefs = reactive<Prefs>(load());

watch(
  prefs,
  (v) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
  { deep: true }
);

export function resetPrefs() {
  Object.assign(prefs, DEFAULTS);
}
