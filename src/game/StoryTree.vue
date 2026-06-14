<script setup lang="ts">
// 只读剧情结构树：从 startScene 出发，按 options.next 展开成树（带访问保护避免环）。
// 叶子 "__end__" 显示为「结局」。纯展示，无拖拽编辑。
import { computed, h, type VNode } from "vue";
import type { GeneratedGame } from "./story-schema";

const props = defineProps<{ game: GeneratedGame }>();

function buildNode(sceneId: string, visited: Set<string>, depth: number): VNode {
  if (sceneId === "__end__") {
    return h("li", [h("span", { class: "tn end" }, "结局")]);
  }
  const scene = props.game.scenes[sceneId];
  const label = scene ? scene.title.replace(/^[—\s]+|[—\s]+$/g, "") || sceneId : sceneId;
  const isRoot = depth === 0;
  const box = h(
    "span",
    { class: ["tn", isRoot ? "root" : ""] },
    label || sceneId
  );

  if (!scene || visited.has(sceneId) || depth > 8) {
    return h("li", [box]);
  }
  const nextVisited = new Set(visited);
  nextVisited.add(sceneId);

  const children = (scene.options || [])
    .map((o) => o.next)
    .filter((n, i, arr) => arr.indexOf(n) === i); // 去重

  if (children.length === 0) {
    return h("li", [box]);
  }
  return h("li", [
    box,
    h(
      "ul",
      children.map((c) => buildNode(c, nextVisited, depth + 1))
    ),
  ]);
}

const tree = computed(() =>
  h("ul", { class: "tree-root" }, [buildNode(props.game.startScene, new Set(), 0)])
);

const stepCount = computed(() => Object.keys(props.game.scenes).length);
const endCount = computed(() => props.game.endings.length);
</script>

<template>
  <div class="story-tree">
    <div class="tree-legend">
      <span>共 {{ stepCount }} 个场景</span>
      <span class="dot">·</span>
      <span>{{ endCount }} 种结局（加权裁定）</span>
    </div>
    <div class="tree-scroll">
      <component :is="tree" />
    </div>
  </div>
</template>

<style scoped>
.story-tree {
  color: #cfc8ba;
}
.tree-legend {
  font-size: 12px;
  letter-spacing: 0.1em;
  color: #8a8f98;
  margin-bottom: 14px;
}
.tree-legend .dot {
  margin: 0 8px;
  color: #5a606b;
}
.tree-scroll {
  overflow-x: auto;
  padding: 8px 0 4px;
}

/* 经典 CSS 树 */
.story-tree :deep(ul) {
  position: relative;
  padding-top: 22px;
  display: flex;
  justify-content: center;
  list-style: none;
  margin: 0;
  white-space: nowrap;
}
.story-tree :deep(li) {
  position: relative;
  padding: 22px 8px 0;
  text-align: center;
  list-style: none;
}
.story-tree :deep(li)::before,
.story-tree :deep(li)::after {
  content: "";
  position: absolute;
  top: 0;
  right: 50%;
  border-top: 1px solid rgba(138, 162, 184, 0.4);
  width: 50%;
  height: 22px;
}
.story-tree :deep(li)::after {
  right: auto;
  left: 50%;
  border-left: 1px solid rgba(138, 162, 184, 0.4);
}
.story-tree :deep(li)::before {
  border-right: 1px solid rgba(138, 162, 184, 0.4);
}
.story-tree :deep(li:only-child)::after,
.story-tree :deep(li:only-child)::before {
  display: none;
}
.story-tree :deep(li:only-child) {
  padding-top: 0;
}
.story-tree :deep(li:first-child)::before,
.story-tree :deep(li:last-child)::after {
  border: 0;
}
.story-tree :deep(li:last-child)::before {
  border-right: 1px solid rgba(138, 162, 184, 0.4);
  border-radius: 0 6px 0 0;
}
.story-tree :deep(li:first-child)::after {
  border-radius: 6px 0 0 0;
}
.story-tree :deep(ul ul)::before {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  border-left: 1px solid rgba(138, 162, 184, 0.4);
  width: 0;
  height: 22px;
}
.story-tree :deep(.tn) {
  display: inline-block;
  border: 1px solid rgba(138, 162, 184, 0.5);
  border-radius: 8px;
  padding: 7px 13px;
  background: rgba(255, 255, 255, 0.02);
  color: #cfc8ba;
  font-size: 12.5px;
  font-family: "Songti SC", "SimSun", serif;
  letter-spacing: 0.05em;
}
.story-tree :deep(.tn.root) {
  background: rgba(44, 70, 97, 0.5);
  border-color: #5a8;
  color: #ece3d0;
}
.story-tree :deep(.tn.end) {
  border-color: #b5654a;
  color: #cf8466;
}
</style>
