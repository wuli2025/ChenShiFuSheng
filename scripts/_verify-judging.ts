// 评判机制端到端验证(无浏览器):模拟三条主线的多条通关路径,
// 校验 场景图可达 / 属性夹取 / 评分卡 / 结局裁定 / 复盘画像 / 命运岔口 全链路不崩。
import { muskGame } from "../src/game/games/musk";
import { karlGame } from "../src/game/games/karl";
import { zhuyuanzhangGame } from "../src/game/games/zhuyuanzhang";
import { buildProfile, fateFork, scoreCard } from "../src/game/assess";
import type { GameDef, Stats } from "../src/game/engine";

function clampApply(target: Stats, delta?: Stats) {
  if (!delta) return;
  for (const k of Object.keys(delta)) {
    if (k in target) target[k] = Math.max(0, Math.min(100, target[k] + (delta[k] || 0)));
  }
}

function run(def: GameDef, pickStrategy: "first" | "last", label: string) {
  const stats: Stats = { ...def.initialStats };
  const caps: Stats = {};
  for (const c of def.caps || []) caps[c.key] = def.initialCaps?.[c.key] ?? 10;
  const tagCounts: Record<string, number> = {};
  let id = def.start;
  let steps = 0;
  let scorecards = 0;
  const visited: string[] = [];
  while (steps++ < 200) {
    const s = def.scenes[id];
    if (!s) throw new Error(`${label}: 场景缺失 ${id}`);
    visited.push(id);
    if (s.event) {
      clampApply(stats, s.event.effects);
      clampApply(caps, s.event.caps);
    }
    if (s.scorecard) {
      const r = scoreCard(s.scorecard, stats);
      if (!Number.isFinite(r.total)) throw new Error(`${label}: 评分卡非有限 ${id}`);
      scorecards++;
    }
    if (s.choices && s.choices.length) {
      const c = pickStrategy === "first" ? s.choices[0] : s.choices[s.choices.length - 1];
      clampApply(stats, c.effects);
      clampApply(caps, c.caps);
      for (const t of c.tags || []) tagCounts[t] = (tagCounts[t] || 0) + 1;
      if (c.next === "__end__") break;
      id = c.next;
    } else if (s.next) {
      if (s.next === "__end__") break;
      id = s.next;
    } else break;
  }
  const ending = def.judge(stats);
  const profile = buildProfile(def.caps, caps);
  const fork = fateFork(def.endings, stats, ending.title);
  // 断言
  if (!ending.title) throw new Error(`${label}: 结局标题为空`);
  if (def.caps && def.caps.length) {
    if (!profile) throw new Error(`${label}: 画像为空`);
    for (const a of profile.axes)
      if (!Number.isFinite(a.value) || a.value < 0 || a.value > 100)
        throw new Error(`${label}: 能力轴越界 ${a.label}=${a.value}`);
  }
  const rec = def.recommend ? def.recommend(caps, stats) : "";
  const diag =
    def.diagnoseByCap && profile?.weakest ? def.diagnoseByCap[profile.weakest.key] : "";
  console.log(
    `\n[${label} · ${pickStrategy}] 步=${visited.length} 评分卡=${scorecards}`
  );
  console.log(`  属性: ${Object.entries(stats).map(([k, v]) => `${k}${v}`).join(" ")}`);
  console.log(`  结局: 《${ending.title}》`);
  console.log(
    `  画像: 强=${profile?.strongest?.label}(${profile?.strongest?.value}) 弱=${profile?.weakest?.label}(${profile?.weakest?.value})`
  );
  if (fork?.nearMiss) console.log(`  岔口: 距《${fork.nearMiss.title}》仅 ${fork.margin} 分`);
  if (rec) console.log(`  荐: ${rec}`);
  if (diag) console.log(`  诊: ${diag}`);
}

const games: [GameDef, string][] = [
  [muskGame, "马斯克"],
  [karlGame, "卡尔"],
  [zhuyuanzhangGame, "朱元璋"],
];
let ok = 0;
for (const [g, name] of games) {
  for (const strat of ["first", "last"] as const) {
    run(g, strat, name);
    ok++;
  }
}
console.log(`\n=== 评判机制端到端验证通过:${ok}/6 条路径全部跑通 ===`);
