<script setup lang="ts">
// 暖色氛围层 —— 纯 canvas,零依赖,铺在所有内容背后(pointer-events:none)。
// 缓慢上浮的暖色萤火/光尘 + 几枚极柔的暖光团缓缓漂移,以 lighter 叠加营造烛光氛围。
// retina 自适应;prefers-reduced-motion 时只留静态光尘不跑动效;卸载清理 rAF。
import { onBeforeUnmount, onMounted, ref } from "vue";

const canvas = ref<HTMLCanvasElement | null>(null);
let raf = 0;
let ro: ResizeObserver | null = null;

interface Ember {
  x: number;
  y: number;
  r: number;
  base: number; // 基础亮度
  tw: number; // 闪烁相位
  sp: number; // 闪烁速度
  vy: number; // 上浮速度
  sway: number; // 横向摆动相位
  swaySp: number;
  hue: number; // 暖色色相 28~46
}
interface Orb {
  x: number;
  y: number;
  r: number; // 半径(很大,柔光团)
  vx: number;
  vy: number;
  hue: number;
  alpha: number;
}

onMounted(() => {
  const cvs = canvas.value!;
  const ctx = cvs.getContext("2d")!;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let embers: Ember[] = [];
  let orbs: Orb[] = [];

  const rnd = () => Math.random();

  function mkEmber(atBottom = false): Ember {
    return {
      x: rnd() * W,
      y: atBottom ? H + rnd() * 40 : rnd() * H,
      r: rnd() * 1.6 + 0.4,
      base: rnd() * 0.45 + 0.18,
      tw: rnd() * Math.PI * 2,
      sp: rnd() * 0.02 + 0.006,
      vy: rnd() * 0.26 + 0.08,
      sway: rnd() * Math.PI * 2,
      swaySp: rnd() * 0.012 + 0.004,
      hue: rnd() * 18 + 28, // 28(橙) ~ 46(金)
    };
  }

  // 大柔光团:缓缓漂移,极低透明度,给画面纵深暖晕
  function mkOrb(): Orb {
    return {
      x: rnd() * W,
      y: rnd() * H,
      r: rnd() * 220 + 180,
      vx: (rnd() - 0.5) * 0.12,
      vy: (rnd() - 0.5) * 0.1,
      hue: rnd() * 16 + 26,
      alpha: rnd() * 0.05 + 0.03,
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = cvs.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    cvs.width = Math.round(W * dpr);
    cvs.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 光尘密度按面积,约每 11000px² 一颗
    const count = Math.round((W * H) / 11000);
    embers = Array.from({ length: count }, () => mkEmber());
    const orbCount = Math.max(4, Math.min(7, Math.round((W * H) / 280000)));
    orbs = Array.from({ length: orbCount }, () => mkOrb());
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    // ── 大柔光团(纵深暖晕) ──
    for (const o of orbs) {
      o.x += o.vx;
      o.y += o.vy;
      if (o.x < -o.r) o.x = W + o.r;
      else if (o.x > W + o.r) o.x = -o.r;
      if (o.y < -o.r) o.y = H + o.r;
      else if (o.y > H + o.r) o.y = -o.r;
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      g.addColorStop(0, `hsla(${o.hue}, 78%, 60%, ${o.alpha})`);
      g.addColorStop(1, `hsla(${o.hue}, 78%, 60%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── 暖色萤火/光尘 ──
    for (const e of embers) {
      e.tw += e.sp;
      if (!reduce) {
        e.sway += e.swaySp;
        e.y -= e.vy;
        e.x += Math.sin(e.sway) * 0.22;
        if (e.y < -6) {
          e.y = H + 6;
          e.x = rnd() * W;
        }
        if (e.x < -6) e.x = W + 6;
        else if (e.x > W + 6) e.x = -6;
      }
      const a = Math.max(0, e.base + Math.sin(e.tw) * 0.22);
      // 柔光圈
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 4);
      g.addColorStop(0, `hsla(${e.hue}, 90%, 68%, ${a})`);
      g.addColorStop(0.4, `hsla(${e.hue}, 88%, 60%, ${a * 0.4})`);
      g.addColorStop(1, `hsla(${e.hue}, 88%, 60%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 4, 0, Math.PI * 2);
      ctx.fill();
      // 亮核
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${e.hue + 8}, 95%, 82%, ${Math.min(1, a + 0.15)})`;
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
    raf = requestAnimationFrame(frame);
  }

  resize();
  ro = new ResizeObserver(resize);
  ro.observe(cvs);
  raf = requestAnimationFrame(frame);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  ro?.disconnect();
});
</script>

<template>
  <canvas ref="canvas" class="warm-aura" aria-hidden="true"></canvas>
</template>

<style scoped>
.warm-aura {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
  z-index: 0;
}
</style>
