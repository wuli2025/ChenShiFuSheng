<script setup lang="ts">
// 我的项目(PRD v6 §01/§02)—— 只列「你自己生成的剧本工程」,与大厅(混内置/外部)分开。
// 每张项目卡强制展示封面,承 v6 封面制度;卡上三件事:▶试玩 · ✎编辑 · ⤴发布。
// 数据源:gamesStore(localStorage 生成库);发布走服务端 /v1/projects/:id/publish,
// 桌面未连云端时优雅降级为提示(不谎报成功)。
import { computed } from "vue";
import { enterGame, goStudio } from "./platform";
import { listGames, removeGame } from "./gamesStore";
import { hasRun, unlockedCount } from "./saves";
import { toast } from "../composables/useToast";

const projects = computed(() => listGames());

function play(id: string) {
  enterGame(id);
}

function edit(_id: string) {
  // v6 三态:编辑态入口。当前统一进创作工坊(画布引擎工作台)继续改这条剧本。
  goStudio();
}

function publish(title: string) {
  // 发布 = 装配单文件快照上架泡泡深空大厅,需服务端 + 登录态(/v1/projects/:id/publish)。
  // 桌面离线模式没有云端会话,这里不静默、不谎报,直说前置条件。
  toast.info(`「${title}」发布需连接云端并登录(服务端 /v1/hall 大厅)。桌面离线暂不可发布。`);
}

function onRemove(id: string, e: Event) {
  e.stopPropagation();
  removeGame(id);
  toast.info("已删除该项目");
}
</script>

<template>
  <div class="proj-root">
    <div class="scroll">
      <header class="head">
        <div class="kicker">MY PROJECTS · 我的项目</div>
        <h1>我的项目</h1>
        <p class="sub">
          你亲手生成的每一卷人生都收在这里。点<b>试玩</b>整局体验、点<b>编辑</b>回工坊继续改稿、
          点<b>发布</b>把定稿快照送进泡泡深空大厅供人游玩。
        </p>
      </header>

      <!-- 空态:引导去生成 -->
      <div v-if="projects.length === 0" class="empty">
        <div class="empty-glyph">卷</div>
        <p class="empty-t">还没有项目</p>
        <p class="empty-d">去「生成」用一句话意图起一卷新的人生,它就会出现在这里。</p>
        <button class="empty-btn" @click="goStudio">去生成 →</button>
      </div>

      <!-- 项目卡墙 -->
      <section v-else class="wall">
        <article
          v-for="p in projects"
          :key="p.id"
          class="card"
          :style="{ '--accent': p.accent }"
        >
          <div class="cover" :style="{ background: p.cover }" @click="play(p.id)">
            <span class="glyph">{{ p.title.slice(0, 1) }}</span>
            <span v-if="hasRun(p.id)" class="run-badge">续</span>
            <span v-if="unlockedCount(p.id)" class="end-badge">阅 {{ unlockedCount(p.id) }} 结局</span>
            <span class="del" title="删除项目" @click="onRemove(p.id, $event)">×</span>
          </div>
          <div class="meta">
            <div class="tag">{{ p.tag }}</div>
            <div class="name">{{ p.title }}</div>
            <div class="desc">{{ p.subtitle }}</div>
            <div class="stat-line">
              {{ Object.keys(p.scenes || {}).length }} 场景 · {{ (p.endings || []).length }} 结局
            </div>
          </div>
          <div class="acts">
            <button class="act primary" @click="play(p.id)">▶ 试玩</button>
            <button class="act" @click="edit(p.id)">✎ 编辑</button>
            <button class="act" @click="publish(p.title)">⤴ 发布</button>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>

<style scoped>
.proj-root {
  height: 100vh;
  overflow: hidden;
  color: #d8d2c4;
  font-family: var(--f-sans, "PingFang SC", "Microsoft YaHei", sans-serif);
  padding-top: 44px;
}
.scroll {
  height: 100%;
  overflow-y: auto;
  max-width: 1080px;
  margin: 0 auto;
  padding: 12px 40px 80px;
}
.head { border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 20px; margin-bottom: 26px; }
.kicker { color: #9a7b3f; font-size: 12px; letter-spacing: 0.35em; }
.head h1 {
  font-family: var(--f-serif, "Songti SC", serif);
  font-size: 28px; color: #ece3d0; letter-spacing: 0.18em; margin: 8px 0 10px;
}
.sub { color: #b0a998; font-size: 14px; line-height: 1.9; margin: 0; max-width: 760px; }
.sub b { color: #e0c4b3; font-weight: 600; }

/* —— 空态 —— */
.empty { text-align: center; padding: 80px 20px; }
.empty-glyph {
  font-family: var(--f-serif, "Songti SC", serif);
  font-size: 68px; color: rgba(227, 179, 65, 0.5);
  text-shadow: 0 4px 30px rgba(227, 179, 65, 0.28);
}
.empty-t { font-size: 18px; color: #e6dcc7; margin: 14px 0 6px; letter-spacing: 0.1em; }
.empty-d { font-size: 13px; color: #8a8f98; margin: 0 0 22px; }
.empty-btn {
  border: 1px solid var(--accent-deep, rgba(227, 179, 65, 0.5));
  background: rgba(227, 179, 65, 0.16);
  color: #ece3d0; border-radius: 999px; padding: 9px 26px; font-size: 13.5px; cursor: pointer;
  letter-spacing: 0.08em; transition: transform 0.2s ease, background 0.2s ease;
}
.empty-btn:hover { background: rgba(227, 179, 65, 0.26); transform: translateY(-1px); }

/* —— 卡墙 —— */
.wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 24px;
}
.card {
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.1));
  background: var(--glass-soft, rgba(30, 42, 62, 0.4));
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  backdrop-filter: blur(20px) saturate(150%);
  border-radius: var(--r-lg, 16px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--edge-hi), var(--shadow-sm, 0 8px 24px rgba(0, 0, 0, 0.3));
  transition: transform 0.32s var(--ease, ease), box-shadow 0.32s var(--ease, ease),
    border-color 0.32s var(--ease, ease);
}
.card:hover {
  transform: translateY(-5px);
  border-color: var(--hairline-strong, rgba(255, 255, 255, 0.22));
  box-shadow: 0 26px 60px rgba(0, 0, 0, 0.5), 0 0 48px -12px var(--accent, #c98b6b);
}
.cover {
  position: relative;
  aspect-ratio: 16 / 10;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.glyph {
  font-family: var(--f-serif, "Songti SC", serif);
  font-size: 64px; color: rgba(236, 227, 208, 0.9);
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
}
.run-badge {
  position: absolute; bottom: 10px; left: 10px;
  font-size: 11px; letter-spacing: 0.2em; color: #10141c;
  background: rgba(227, 179, 65, 0.85); padding: 3px 10px; border-radius: 999px;
}
.end-badge {
  position: absolute; bottom: 10px; right: 10px;
  font-size: 11px; letter-spacing: 0.12em; color: #e9c05e;
  border: 1px solid rgba(227, 179, 65, 0.42); background: rgba(9, 14, 24, 0.42);
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
  padding: 3px 10px; border-radius: 999px;
}
.del {
  position: absolute; top: 10px; right: 12px;
  width: 24px; height: 24px; line-height: 22px; text-align: center; border-radius: 50%;
  background: rgba(20, 13, 9, 0.5);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  border: 1px solid var(--hairline, rgba(255, 255, 255, 0.12));
  color: #cfc8ba; font-size: 15px; cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}
.del:hover { background: rgba(180, 60, 50, 0.6); color: #fff; }
.meta { padding: 15px 18px 8px; flex: 1; }
.tag { font-size: 11px; letter-spacing: 0.18em; color: var(--accent, #e0a96d); margin-bottom: 8px; }
.name { font-family: var(--f-serif, "Songti SC", serif); font-size: 20px; letter-spacing: 0.1em; color: #f0e9da; }
.desc { margin-top: 7px; font-size: 12.5px; line-height: 1.65; color: #a9a291;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.stat-line { margin-top: 9px; font-size: 11.5px; color: #6c727c; letter-spacing: 0.04em; }
.acts { display: flex; gap: 8px; padding: 12px 18px 16px; }
.act {
  flex: 1;
  border: 1px solid var(--hairline-strong, rgba(255, 255, 255, 0.18));
  background: transparent; color: #cfc8ba;
  border-radius: 999px; padding: 7px 4px; font-size: 12.5px; cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease, transform 0.15s ease;
}
.act:hover { border-color: var(--accent, #c98b6b); color: #ece3d0; transform: translateY(-1px); }
.act:active { transform: scale(0.96); }
.act.primary {
  border-color: var(--accent-deep, rgba(201, 139, 107, 0.6));
  background: rgba(201, 139, 107, 0.18); color: #ece3d0;
}
</style>
