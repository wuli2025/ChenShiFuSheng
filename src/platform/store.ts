import { defineStore } from 'pinia';

export type WorkState = 'chat' | 'edit' | 'immerse';

export interface TodoItem {
  label: string;
  done: boolean;
}

export type TimelineEvent =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'ai'; text: string }
  | { id: number; kind: 'task'; title: string; progress: number; note: string }
  | { id: number; kind: 'diff'; title: string; summary: string; resolved: null | 'adopt' | 'revise'; todos: TodoItem[] };

interface State {
  state: WorkState;
  currentProject: { id: string; name: string; cover: string };
  timeline: TimelineEvent[];
}

// 纯前端假数据:8 条时间线(用户消息 / AI消息 / 任务进度卡 / diff待办卡)
export const usePlatformStore = defineStore('platform', {
  state: (): State => ({
    state: 'chat',
    currentProject: { id: 'p1', name: '兽医人生 · 星野副本', cover: '#d4a94f' },
    timeline: [
      { id: 1, kind: 'user', text: '帮我开一个「都市兽医成长」题材的新游戏,3 章 24 场景,6 个结局。' },
      { id: 2, kind: 'ai', text: '好的,已按机制模板配平:六维属性(医术/共情/经营/体力/声望/存款),结局配比 2 好 2 平 2 隐藏。正在生成剧本骨架……' },
      { id: 3, kind: 'task', title: 'write_script · 生成剧本骨架', progress: 100, note: '24 场景 · 6 结局 · 台词与演出行齐全' },
      { id: 4, kind: 'ai', text: '骨架已就绪。我顺手把第 2 章节奏放慢了一档,给「深夜急诊」加了一条隐藏线(共情≥7 解锁)。' },
      { id: 5, kind: 'diff', title: '第 2 章 · 节奏与隐藏线改动', summary: '3 处场景改写 + 1 条隐藏分支,建议采纳', resolved: null, todos: [
        { label: '放慢第 2 章开场节奏', done: false },
        { label: '新增「深夜急诊」隐藏线', done: false },
        { label: '共情阈值校准为 7', done: false },
      ] },
      { id: 6, kind: 'user', text: '隐藏线不错,再给结局「归乡开诊所」配一张水墨风封面。' },
      { id: 7, kind: 'task', title: 'gen_image · 结局封面 ×1', progress: 62, note: '赛博水墨 · 1024×768 · 生成中' },
      { id: 8, kind: 'ai', text: '封面在画了。你可以随时点上方图谱进入编辑态微调分支,或进画布引擎整局试玩。' },
    ],
  }),
  actions: {
    setState(s: WorkState) {
      this.state = s;
    },
    resolveDiff(id: number, how: 'adopt' | 'revise') {
      const ev = this.timeline.find((e) => e.id === id);
      if (ev && ev.kind === 'diff') {
        ev.resolved = how;
        if (how === 'adopt') ev.todos.forEach((t) => (t.done = true));
      }
    },
  },
});
