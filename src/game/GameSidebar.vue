<script setup lang="ts">
// 左侧统一导航栏：所有功能（大厅/生成/资料库/图谱/设置）收于此，点图标切换。
import { computed, ref } from "vue";
import {
  platform,
  backToLobby,
  goCreate,
  goLibrary,
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
  graph: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M10.5 6.8 6.4 16M13.5 6.8 17.6 16M7 18h10"/></svg>`,
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
  background: linear-gradient(180deg, #14171c, #0c0d10);
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0 16px;
  position: relative;
  z-index: 40;
  overflow: hidden;
  transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
/* 收起态：缩成一条窄边，只留印章作展开把手 */
.rail.collapsed {
  width: 30px;
  padding: 16px 0 16px;
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
  color: #cfc8ba;
  background: rgba(255, 255, 255, 0.04);
}
.navbtn.on {
  color: #ece3d0;
  background: rgba(44, 70, 97, 0.4);
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
