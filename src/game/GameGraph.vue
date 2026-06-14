<script setup lang="ts">
// 图谱屏：复用现有 KnowledgeGraph 组件（自给自足，内部调 kb.graph）。
import KnowledgeGraph from "../components/KnowledgeGraph.vue";
</script>

<template>
  <div class="graph-root">
    <div class="graph-wrap">
      <KnowledgeGraph />
    </div>
  </div>
</template>

<style scoped>
.graph-root {
  position: relative;
  height: 100vh;
  background: #08090b;
}
.back {
  position: fixed;
  top: 20px;
  left: 24px;
  z-index: 20;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.4);
  color: #9aa1ab;
  padding: 7px 16px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 13px;
}
.back:hover { color: #ece3d0; }
.graph-wrap { position: absolute; inset: 0; }
</style>
