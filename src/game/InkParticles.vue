<script setup lang="ts">
// 水墨浮尘叠层 —— canvas 缓慢上浮的尘点/墨屑，营造空气感。轻量、可关。
import { onBeforeUnmount, onMounted, ref } from "vue";

const canvas = ref<HTMLCanvasElement | null>(null);
let raf = 0;
let motes: { x: number; y: number; r: number; vy: number; vx: number; a: number; sway: number }[] = [];
let w = 0;
let h = 0;
let dpr = 1;

function resize() {
  const c = canvas.value;
  if (!c) return;
  const rect = c.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  w = rect.width;
  h = rect.height;
  c.width = Math.max(1, Math.floor(w * dpr));
  c.height = Math.max(1, Math.floor(h * dpr));
}

function seed() {
  const count = Math.max(24, Math.min(60, Math.floor((w * h) / 26000)));
  motes = Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: 0.6 + Math.random() * 1.8,
    vy: -(0.08 + Math.random() * 0.22),
    vx: (Math.random() - 0.5) * 0.12,
    a: 0.04 + Math.random() * 0.13,
    sway: Math.random() * Math.PI * 2,
  }));
}

function frame() {
  const c = canvas.value;
  const ctx = c?.getContext("2d");
  if (!c || !ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  for (const m of motes) {
    m.sway += 0.01;
    m.x += m.vx + Math.sin(m.sway) * 0.12;
    m.y += m.vy;
    if (m.y < -4) {
      m.y = h + 4;
      m.x = Math.random() * w;
    }
    if (m.x < -4) m.x = w + 4;
    else if (m.x > w + 4) m.x = -4;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(233, 226, 210, ${m.a})`;
    ctx.fill();
  }
  raf = requestAnimationFrame(frame);
}

function onResize() {
  resize();
  seed();
}

onMounted(() => {
  resize();
  seed();
  raf = requestAnimationFrame(frame);
  window.addEventListener("resize", onResize);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  window.removeEventListener("resize", onResize);
});
</script>

<template>
  <canvas ref="canvas" class="ink-particles"></canvas>
</template>

<style scoped>
.ink-particles {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 3;
}
</style>
