<script setup lang="ts">
import { ref } from 'vue';
import { usePlatformStore } from './store';
import ChatTimeline from './ChatTimeline.vue';
import EditView from './EditView.vue';
import ImmerseView from './ImmerseView.vue';
import GButton from '../ui/GButton.vue';
import { HallIcon, ProjectIcon, TemplateIcon, AuthIcon, GraphIcon, PlayIcon } from '../icons';

const store = usePlatformStore();
const nav = [
  { key: 'hall', label: '大厅', icon: HallIcon },
  { key: 'project', label: '我的项目', icon: ProjectIcon },
  { key: 'template', label: '模板库', icon: TemplateIcon },
  { key: 'auth', label: '授权与配额', icon: AuthIcon },
];
const activeNav = ref('project');
</script>

<template>
  <div class="shell">
    <aside v-show="store.state !== 'immerse'" class="side">
      <div class="brand">尘世浮生</div>
      <nav>
        <button
          v-for="n in nav"
          :key="n.key"
          class="nk"
          :class="{ on: activeNav === n.key }"
          @click="activeNav = n.key"
        >
          <component :is="n.icon" class="nkico" />
          {{ n.label }}
        </button>
      </nav>
      <div class="foot">奶油琉璃 · 三态工作台</div>
    </aside>

    <main class="stage">
      <header v-show="store.state !== 'immerse'" class="topbar">
        <div class="proj">
          <span class="cover" :style="{ background: store.currentProject.cover }" />
          <b>{{ store.currentProject.name }}</b>
        </div>
        <div class="acts">
          <GButton
            :variant="store.state === 'chat' ? 'primary' : 'ghost'"
            @click="store.setState('chat')"
          >对话</GButton>
          <GButton
            :variant="store.state === 'edit' ? 'primary' : 'ghost'"
            @click="store.setState('edit')"
          >
            <GraphIcon /> 编辑
          </GButton>
          <GButton variant="ghost" @click="store.setState('immerse')">
            <PlayIcon /> 试玩
          </GButton>
        </div>
      </header>

      <div class="body">
        <Transition name="state" mode="out-in">
          <div v-if="store.state === 'chat'" key="chat" class="view chat-view">
            <ChatTimeline />
          </div>
          <EditView v-else-if="store.state === 'edit'" key="edit" class="view" />
          <ImmerseView v-else key="immerse" class="view" />
        </Transition>
      </div>
    </main>
  </div>
</template>

<style scoped>
.shell { display: flex; height: 100vh; width: 100vw; background: var(--cream-0); color: var(--ink-1); overflow: hidden; }
.side {
  width: 208px; flex-shrink: 0;
  background: var(--glass); backdrop-filter: blur(var(--glass-blur));
  border-right: 1px solid var(--glass-line);
  padding: var(--sp-4) var(--sp-3); display: flex; flex-direction: column;
}
.brand { font-size: 15px; font-weight: 700; letter-spacing: 2px; padding: 0 var(--sp-2) var(--sp-4); }
nav { display: flex; flex-direction: column; gap: var(--sp-1); }
.nk {
  display: flex; align-items: center; gap: 11px;
  padding: var(--sp-2) var(--sp-3); border-radius: var(--r-sm);
  color: var(--ink-2); font-size: 13px; border: none; background: transparent;
  cursor: pointer; text-align: left; transition: 0.15s var(--ease);
}
.nk:hover { color: var(--ink-1); background: rgba(255, 255, 255, 0.55); }
.nk.on { color: var(--amber); background: linear-gradient(90deg, rgba(212, 169, 79, 0.14), transparent); }
.nkico { width: 18px; height: 18px; }
.nk.on .nkico { color: var(--amber); }
.foot { margin-top: auto; padding: var(--sp-3) var(--sp-2) 0; font-size: 11px; color: var(--ink-3); border-top: 1px solid var(--glass-line); }
.stage { flex: 1; display: flex; flex-direction: column; position: relative; min-width: 0; }
.topbar {
  height: 60px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--sp-4); border-bottom: 1px solid var(--glass-line); background: var(--glass);
}
.proj { display: flex; align-items: center; gap: var(--sp-2); }
.proj b { font-size: 14px; }
.cover { width: 22px; height: 22px; border-radius: var(--r-sm); box-shadow: var(--shadow-1); }
.acts { display: flex; gap: var(--sp-2); }
.body { flex: 1; position: relative; overflow: hidden; }
.view { position: absolute; inset: 0; overflow-y: auto; }
.chat-view { padding: var(--sp-5) var(--sp-4); }
.state-enter-active, .state-leave-active { transition: opacity 0.2s var(--ease), transform 0.2s var(--ease); }
.state-enter-from { opacity: 0; transform: translateX(14px); }
.state-leave-to { opacity: 0; transform: translateX(-14px); }
</style>
