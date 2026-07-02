<script setup lang="ts">
// 左侧统一导航栏：所有功能（大厅/生成/资料库/图谱/设置）收于此，点图标切换。
import { computed, ref } from "vue";
import {
  platform,
  backToLobby,
  goCreate,
  goLibrary,
  goGallery,
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
  create: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18"/><path d="M18.5 5.5 19 7l1.5.5L19 8l-.5 1.5L18 8l-1.5-.5L18 7z"/></svg>`,
  library: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h10a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2z"/><path d="M5 4v16"/><path d="M17 20h2V6"/></svg>`,
  gallery: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 14.6 9l6 .5-4.6 4 1.5 5.9L12 16.6 6.5 19.4 8 13.5 3.4 9.5l6-.5z"/></svg>`,
  graph: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M10.5 6.8 6.4 16M13.5 6.8 17.6 16M7 18h10"/></svg>`,
  templates: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="7" height="7" rx="1.2"/><rect x="13.5" y="4" width="7" height="4" rx="1.2"/><rect x="13.5" y="11" width="7" height="9" rx="1.2"/><rect x="3.5" y="14" width="7" height="6" rx="1.2"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>`,
};

const items = computed<NavItem[]>(() => [
  {
    key: "lobby",
    label: "浮生阁",
    active: () =>
      platform.screen === "lobby" ||
      platform.screen === "play" ||
      platform.screen === "external",
    go: backToLobby,
  },
  {
    key: "create",
    label: "生成",
    active: () => platform.screen === "create",
    go: goCreate,
  },
  {
    key: "library",
    label: "资料库",
    active: () => platform.screen === "library",
    go: goLibrary,
  },
  {
    key: "gallery",
    label: "结局图鉴",
    active: () => platform.screen === "gallery",
    go: goGallery,
  },
  {
    key: "templates",
    label: "故事线模板",
    active: () => platform.screen === "templates",
    go: goTemplates,
  },
  {
    key: "settings",
    label: "设置 · API",
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
.rail {
  width: 88px;
  height: 100vh;
  flex: none;
  /* 无边框:从左侧暖褐极淡地渐隐到透明,与主区暖底无缝相融,萤火隐隐透过 */
  background: linear-gradient(
    90deg,
    rgba(36, 23, 16, 0.55) 0%,
    rgba(30, 19, 13, 0.32) 60%,
    rgba(30, 19, 13, 0) 100%
  );
  border-right: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 顶部留出 44px 避让拖拽条与 macOS 红绿灯 */
  padding: 44px 0 16px;
  position: relative;
  z-index: 40;
  overflow: hidden;
  transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
/* 收起态：缩成一条窄边，只留印章作展开把手 */
.rail.collapsed {
  width: 30px;
  padding: 44px 0 16px;
}
.rail.collapsed .nav,
.rail.collapsed .foot {
  opacity: 0;
  pointer-events: none;
}
.rail.collapsed .seal {
  width: 22px;
  height: 22px;
  margin-bottom: 0;
  border-radius: 6px;
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
  border: 1.5px solid #b5654a;
  border-radius: 8px;
  background: rgba(181, 101, 74, 0.12);
  color: #cf8466;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 28px;
  transition: 0.2s;
}
.seal:hover {
  background: rgba(181, 101, 74, 0.22);
  box-shadow: 0 0 18px rgba(181, 101, 74, 0.35);
}
.seal-char {
  font-family: "Songti SC", "SimSun", serif;
  font-size: 16px;
  line-height: 1.05;
  letter-spacing: 0.04em;
  font-weight: 600;
}
.chev {
  position: absolute;
  right: -2px;
  bottom: -1px;
  font-size: 13px;
  line-height: 1;
  color: #cf8466;
  opacity: 0.75;
}
.nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  align-items: center;
}
.navbtn {
  width: 72px;
  padding: 11px 0 9px;
  border: none;
  background: transparent;
  border-radius: 12px;
  color: #7c828c;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  transition: 0.2s;
  position: relative;
}
.navbtn:hover {
  color: #f0e2cf;
  background: rgba(224, 150, 88, 0.08);
}
.navbtn.on {
  color: #f6ecd8;
  background: rgba(201, 120, 79, 0.18);
}
.navbtn.on::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 22px;
  border-radius: 2px;
  background: #c98b6b;
}
.ico {
  width: 22px;
  height: 22px;
  display: block;
}
.ico :deep(svg) {
  width: 22px;
  height: 22px;
}
.lbl {
  font-size: 10.5px;
  letter-spacing: 0.05em;
}
.foot {
  margin-top: auto;
  font-family: "Songti SC", "SimSun", serif;
  font-size: 12px;
  line-height: 1.3;
  letter-spacing: 0.1em;
  color: #3f444c;
  text-align: center;
}
</style>
