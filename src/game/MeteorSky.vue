<script setup lang="ts">
// 纯 canvas 星空 + 流星层:零依赖,铺在所有内容背后(pointer-events:none)。
// 墨黑底上点缀微闪星点,不时划过一道带拖尾的流星。retina 自适应,
// prefers-reduced-motion 时只留静态星不跑流星,组件卸载清理 rAF。
import { onBeforeUnmount, onMounted, ref } from "vue";

const canvas = ref<HTMLCanvasElement | null>(null);
let raf = 0;
let ro: ResizeObserver | null = null;

interface Star {
  x: number;
  y: number;
  r: number;
  base: number; // 基础亮度
  tw: number; // 闪烁相位
  sp: number; // 闪烁速度
}
interface Meteor {
  x: number;
  y: number;
  len: number; // 拖尾长度
  vx: number;
  vy: number;
  life: number; // 0→1 进度
  ttl: number; // 总时长(帧)
  age: number;
  w: number; // 线宽
}

onMounted(() => {
  const cvs = canvas.value!;
  const ctx = cvs.getContext("2d")!;
  const reduce = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let stars: Star[] = [];
  const meteors: Meteor[] = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = cvs.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    cvs.width = Math.round(W * dpr);
    cvs.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 星点密度按面积来,约每 9000px² 一颗
    const count = Math.round((W * H) / 9000);
    stars = Array.from({ length: count }, () => mkStar());
  }

  // 伪随机:无 Math.random 限制问题(运行期允许),这里直接用
  const rnd = () => Math.random();

  function mkStar(): Star {
    return {
      x: rnd() * W,
      y: rnd() * H,
      r: rnd() * 1.1 + 0.25,
      base: rnd() * 0.5 + 0.2,
      tw: rnd() * Math.PI * 2,
      sp: rnd() * 0.015 + 0.004,
    };
  }

  // 流星从右上方斜向左下划入
  function spawnMeteor() {
    const startX = rnd() * W * 0.7 + W * 0.3;
    const startY = rnd() * H * 0.4 - H * 0.1;
    const speed = rnd() * 4 + 5;
    const angle = Math.PI * (0.72 + rnd() * 0.12); // 约 130°~152°,向左下
    meteors.push({
      x: startX,
      y: startY,
      len: rnd() * 120 + 90,
      vx: Math.cos(angle) * speed,
      vy: -Math.sin(angle) * speed * -1, // 向下
      life: 0,
      ttl: rnd() * 40 + 60,
      age: 0,
      w: rnd() * 1.2 + 0.8,
    });
  }

  let sinceSpawn = 0;
  let nextSpawn = 40;

  function frame() {
    ctx.clearRect(0, 0, W, H);

    // ── 星点(轻微呼吸闪烁) ──
    for (const s of stars) {
      s.tw += s.sp;
      const a = s.base + Math.sin(s.tw) * 0.18;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220,224,235,${Math.max(0, a)})`;
      ctx.fill();
    }

    if (!reduce) {
      // ── 流星调度 ──
      sinceSpawn++;
      if (sinceSpawn >= nextSpawn) {
        sinceSpawn = 0;
        nextSpawn = Math.round(rnd() * 160 + 70); // 间隔不均,显得自然
        spawnMeteor();
        if (rnd() < 0.25) spawnMeteor(); // 偶尔双流星
      }

      // ── 绘制流星 ──
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.age++;
        m.x += m.vx;
        m.y += m.vy;
        m.life = m.age / m.ttl;
        if (m.life >= 1 || m.x < -200 || m.y > H + 200) {
          meteors.splice(i, 1);
          continue;
        }
        // 头尾透明度:中段最亮,首尾淡出
        const fade = Math.sin(Math.min(1, m.life) * Math.PI);
        const tailX = m.x - m.vx * (m.len / 6);
        const tailY = m.y - m.vy * (m.len / 6);
        const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
        grad.addColorStop(0, `rgba(255,250,235,${0.9 * fade})`);
        grad.addColorStop(0.3, `rgba(201,139,107,${0.5 * fade})`);
        grad.addColorStop(1, "rgba(201,139,107,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = m.w;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
        // 流星头小光点
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.w * 1.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,252,244,${0.85 * fade})`;
        ctx.fill();
      }
    }

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
  <canvas ref="canvas" class="meteor-sky" aria-hidden="true"></canvas>
</template>

<style scoped>
.meteor-sky {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
  z-index: 0;
}
</style>
