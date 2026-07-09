<script setup lang="ts">
// 左侧功能分区导航(PRD v6 五分区):大厅 / 生成 / 我的项目 / 模板库 / 设置。
import { computed, ref } from "vue";
import {
  platform,
  backToLobby,
  goStudio,
  goProjects,
  goTemplates,
  goSettings,
} from "./platform";

// 收缩态：点「浮生阁」印章在 收起 / 展开 之间切换，记忆到本地。
const collapsed = ref(localStorage.getItem("rail.collapsed") === "1");
function toggleCollapse() {
  collapsed.value = !collapsed.value;
  localStorage.setItem("rail.collapsed", collapsed.value ? "1" : "0");
}

interface NavItem {
  key: string;
  label: string;
  active: () => boolean;
  go: () => void;
}

// 内联 SVG 图标（stroke=currentColor，零依赖）
const ICONS: Record<string, string> = {
  lobby: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-5h5v5"/></svg>`,
  studio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="M14.5 5.5 18.5 9.5"/></svg>`,
  library: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h10a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2z"/><path d="M5 4v16"/><path d="M17 20h2V6"/></svg>`,
  gallery: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 14.6 9l6 .5-4.6 4 1.5 5.9L12 16.6 6.5 19.4 8 13.5 3.4 9.5l6-.5z"/></svg>`,
  graph: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M10.5 6.8 6.4 16M13.5 6.8 17.6 16M7 18h10"/></svg>`,
  templates: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="7" height="7" rx="1.2"/><rect x="13.5" y="4" width="7" height="4" rx="1.2"/><rect x="13.5" y="11" width="7" height="9" rx="1.2"/><rect x="3.5" y="14" width="7" height="6" rx="1.2"/></svg>`,
  projects: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.2h7A1.5 1.5 0 0 1 19 9.7"/><rect x="3" y="8.5" width="18" height="11.5" rx="1.8"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>`,
  vnstudio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="13" rx="2"/><path d="M8 21h8M12 17.5V21"/><path d="M6.5 13.5c1.2-2 2.4-3 3.5-3s2 1.5 3 1.5 2.2-1.8 4.5-2.5"/><circle cx="8" cy="8.4" r="1.1"/></svg>`,
};

const items = computed<NavItem[]>(() => [
  {
    key: "lobby",
    label: "大厅",
    active: () =>
      platform.screen === "lobby" ||
      platform.screen === "play" ||
      platform.screen === "external",
    go: backToLobby,
  },
  {
    key: "studio",
    label: "生成",
    active: () =>
      platform.screen === "studio" || platform.screen === "vnstudio",
    go: goStudio,
  },
  {
    key: "projects",
    label: "我的项目",
    active: () => platform.screen === "projects",
    go: goProjects,
  },
  {
    key: "templates",
    label: "模板库",
    active: () => platform.screen === "templates",
    go: goTemplates,
  },
  {
    key: "settings",
    label: "设置",
    active: () => platform.screen === "settings",
    go: goSettings,
  },
]);
</script>

<template>
  <nav class="rail" :class="{ collapsed }">
    <!-- 印章 logo：点击在 收起/展开 间切换左栏 -->
    <button
      class="seal"
      :title="collapsed ? '展开浮生阁' : '收起浮生阁'"
      @click="toggleCollapse"
    >
      <span class="seal-char">浮<br />生</span>
      <span class="chev" aria-hidden="true">{{ collapsed ? "›" : "‹" }}</span>
    </button>

    <div class="nav">
      <button
        v-for="it in items"
        :key="it.key"
        class="navbtn"
        :class="{ on: it.active() }"
        :title="it.label"
        @click="it.go()"
      >
        <span class="ico" v-html="ICONS[it.key]"></span>
        <span class="lbl">{{ it.label }}</span>
      </button>
    </div>

    <div class="foot">尘世<br />浮生</div>
  </nav>
</template>

<style scoped>
/* 悬浮玻璃坞:导航不再是"贴墙的一条",而是一枚悬在暖光里的琉璃岛 */
.rail {
  width: 104px;
  height: 100vh;
  flex: none;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 顶部留出 44px 避让拖拽条与 macOS 红绿灯 */
  padding: 48px 0 18px 14px;
  position: relative;
  z-index: 40;
  overflow: hidden;
  transition: width var(--dur) var(--ease), padding var(--dur) var(--ease);
}
/* 收起态：缩成一条窄边，只留印章作展开把手 */
.rail.collapsed {
  width: 34px;
  padding: 48px 0 18px 6px;
}
.rail.collapsed .nav,
.rail.collapsed .foot {
  opacity: 0;
  pointer-events: none;
}
.rail.collapsed .seal {
  width: 24px;
  height: 24px;
  margin-bottom: 0;
  border-radius: 8px;
}
.rail.collapsed .seal-char {
  display: none;
}
.rail.collapsed .chev {
  position: static;
  font-size: 15px;
}
.seal {
  position: relative;
  width: 52px;
  height: 52px;
  border: 1px solid rgba(227, 179, 65, 0.5);
  border-radius: 14px;
  background: rgba(227, 179, 65, 0.12);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  backdrop-filter: blur(18px) saturate(150%);
  box-shadow: var(--edge-hi), 0 6px 22px rgba(0, 0, 0, 0.3);
  color: #e9c05e;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease),
    background var(--dur) var(--ease);
}
.seal:hover {
  background: rgba(227, 179, 65, 0.2);
  box-shadow: var(--edge-hi), 0 8px 28px rgba(0, 0, 0, 0.34), 0 0 22px var(--accent-glow);
  transform: translateY(-1px);
}
.seal:active {
  transform: scale(0.96);
}
.seal-char {
  font-family: var(--f-serif);
  font-size: 16px;
  line-height: 1.05;
  letter-spacing: 0.04em;
  font-weight: 600;
}
.chev {
  position: absolute;
  right: 3px;
  bottom: 2px;
  font-size: 12px;
  line-height: 1;
  color: #e9c05e;
  opacity: 0.7;
}
/* 玻璃岛本体:一整块竖向琉璃,承载全部导航 */
.nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  padding: 10px 8px;
  border-radius: var(--r-lg);
  background: var(--glass);
  -webkit-backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
  backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
  border: 1px solid var(--hairline);
  box-shadow: var(--edge-hi), var(--shadow-md);
  transition: opacity var(--dur) var(--ease);
}
.navbtn {
  width: 68px;
  padding: 10px 0 8px;
  border: none;
  background: transparent;
  border-radius: var(--r-md);
  color: #7e8ea3;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  transition: color var(--dur) var(--ease), background var(--dur) var(--ease),
    transform var(--dur) var(--ease);
  position: relative;
}
.navbtn:hover {
  color: var(--text-hi);
  background: rgba(226, 238, 252, 0.06);
}
.navbtn:active {
  transform: scale(0.95);
}
.navbtn.on {
  color: var(--text-hi);
  background: linear-gradient(180deg, rgba(227, 179, 65, 0.22), rgba(227, 179, 65, 0.1));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 2px 10px rgba(0, 0, 0, 0.25);
}
.ico {
  width: 21px;
  height: 21px;
  display: block;
}
.ico :deep(svg) {
  width: 21px;
  height: 21px;
}
.lbl {
  font-size: 10.5px;
  letter-spacing: 0.05em;
}
.foot {
  margin-top: auto;
  font-family: var(--f-serif);
  font-size: 12px;
  line-height: 1.3;
  letter-spacing: 0.12em;
  color: rgba(147, 165, 187, 0.32);
  text-align: center;
  transition: opacity var(--dur) var(--ease);
}
</style>
