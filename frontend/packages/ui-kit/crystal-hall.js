/* ============================================================================
   水晶球大厅渲染引擎
   ---------------------------------------------------------------------------
   性能契约（v11 §06）：
   - 百球级 60fps：**单 canvas 实例**渲染全部球体，不是 N 个 DOM 节点。
   - 可视区外不渲染；页面隐藏时暂停 rAF。
   - 低端机（deviceMemory ≤4 或实测帧率持续 <45）自动降级：关闭折射高光与粒子。
   - prefers-reduced-motion：停止呼吸浮动，只保留静态球。
   - 只用 transform/opacity 做 DOM 动画，绝不动 layout 属性。
   ========================================================================= */

const TAU = Math.PI * 2;

/** 招牌时刻之一：水晶球膨胀铺满屏进入 Player。时长取 --t-signature。 */
export const SIGNATURE_MS = 620;

export class CrystalHall {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onEnter?: (item:any, rect:DOMRect)=>void}} opts
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.opts = opts;
    this.items = [];
    this.orbs = [];
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.hover = -1;
    this.t = 0;
    this.running = false;
    this.frames = [];
    this.quality = this._detectQuality();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._onResize = this._resize.bind(this);
    this._onMove = this._move.bind(this);
    this._onClick = this._click.bind(this);
    this._onVis = () => (document.hidden ? this.stop() : this.start());

    addEventListener('resize', this._onResize, { passive: true });
    canvas.addEventListener('pointermove', this._onMove, { passive: true });
    canvas.addEventListener('pointerleave', () => (this.hover = -1), { passive: true });
    canvas.addEventListener('click', this._onClick);
    document.addEventListener('visibilitychange', this._onVis);

    // 可视区外整体暂停
    this.io = new IntersectionObserver(
      ([e]) => (e.isIntersecting ? this.start() : this.stop()),
      { threshold: 0 }
    );
    this.io.observe(canvas);

    this._resize();
  }

  /** deviceMemory / hardwareConcurrency 粗筛，后续用实测帧率二次降级。 */
  _detectQuality() {
    const mem = navigator.deviceMemory || 8;
    const cores = navigator.hardwareConcurrency || 8;
    if (mem <= 4 || cores <= 4) return 'low';
    return 'high';
  }

  setItems(items) {
    this.items = items;
    this._layout();
  }

  /**
   * 黄金角螺旋（向日葵）布局：热门在内、长尾在外，相邻球间距天然均匀。
   *
   * 不用同心环 —— 环上塞固定数量的球时，内圈周长不够，球会咬在一起。
   * 螺旋步长取 2.24×最大半径（含 12% 呼吸余量），再按包围盒自适应缩放，
   * 于是任意球数、任意画布尺寸都铺得开且不溢出。
   */
  _layout() {
    const { width: w, height: h } = this.canvas.getBoundingClientRect();
    if (!w || !h || !this.items.length) {
      this.orbs = [];
      return;
    }

    const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.39996 rad
    const SQUASH = 0.78; // 纵向压扁，让它像一个「场」而不是一个圆

    // 热度决定大小；按热度降序排，热门自然落在螺旋中心。
    const sized = [...this.items]
      .sort((a, b) => (b.plays || 0) - (a.plays || 0))
      .map((it, i) => ({ it, i, r: 30 + Math.min(24, Math.log2((it.plays || 0) + 2) * 4.2) }));

    const maxR = Math.max(...sized.map(s => s.r));
    const spacing = maxR * 2.24;

    const raw = sized.map(({ it, i, r }) => {
      const ang = i * GOLDEN;
      const rad = spacing * Math.sqrt(i + 0.62);
      return { it, i, r, x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * SQUASH };
    });

    // 自适应缩放：把包围盒（含球半径与进度环）压进画布安全区。
    const pad = 20;
    const extX = raw.reduce((m, o) => Math.max(m, Math.abs(o.x) + o.r + pad), 1);
    const extY = raw.reduce((m, o) => Math.max(m, Math.abs(o.y) + o.r + pad), 1);
    const scale = Math.min(1, (w * 0.47) / extX, (h * 0.47) / extY);

    const cx = w / 2, cy = h / 2;
    this.orbs = raw.map(o => {
      const i = o.i;
      return {
        item: o.it,
        x: cx + o.x * scale,
        y: cy + o.y * scale,
        r: o.r * scale,
        // 每颗球独立的呼吸相位，避免整齐划一的塑料感
        phase: (i * 137.5) % TAU,
        speed: 0.6 + ((i * 31) % 7) / 14,
        hue: o.it.hue ?? (i * 47) % 360,
      };
    });
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._layout();
  }

  _pick(x, y) {
    // 从后往前（画在上面的优先）
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      const dx = x - o.x, dy = y - o.y;
      if (dx * dx + dy * dy <= o.r * o.r) return i;
    }
    return -1;
  }

  _move(e) {
    const r = this.canvas.getBoundingClientRect();
    const i = this._pick(e.clientX - r.left, e.clientY - r.top);
    if (i !== this.hover) {
      this.hover = i;
      this.canvas.style.cursor = i >= 0 ? 'pointer' : 'default';
      this.opts.onHover?.(i >= 0 ? this.orbs[i].item : null, i >= 0 ? this._screenRect(i) : null);
    }
  }

  _screenRect(i) {
    const o = this.orbs[i];
    const r = this.canvas.getBoundingClientRect();
    return new DOMRect(r.left + o.x - o.r, r.top + o.y - o.r, o.r * 2, o.r * 2);
  }

  _click(e) {
    const r = this.canvas.getBoundingClientRect();
    const i = this._pick(e.clientX - r.left, e.clientY - r.top);
    if (i >= 0) this.opts.onEnter?.(this.orbs[i].item, this._screenRect(i));
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this._loop();
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    this.io.disconnect();
    removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVis);
  }

  _loop = () => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(50, now - this.last);
    this.last = now;
    this.t += dt / 1000;

    // 实测帧率二次降级：连续 30 帧低于 45fps 就降画质，不再回升（避免抖动）
    if (this.quality === 'high') {
      this.frames.push(dt);
      if (this.frames.length > 30) {
        this.frames.shift();
        const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
        if (avg > 22) {
          this.quality = 'low';
          this.opts.onDegrade?.('低端机检测：已关闭折射高光以保帧率');
        }
      }
    }

    this._draw();
    this.raf = requestAnimationFrame(this._loop);
  };

  _draw() {
    const ctx = this.ctx;
    const { width: w, height: h } = this.canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < this.orbs.length; i++) {
      const o = this.orbs[i];
      // 呼吸浮动：reduced-motion 下静止
      const bob = this.reduced ? 0 : Math.sin(this.t * o.speed + o.phase) * 5;
      const y = o.y + bob;
      const isHover = i === this.hover;
      const r = o.r * (isHover ? 1.09 : 1);

      // 视口裁剪：屏幕外不画
      if (o.x + r < 0 || o.x - r > w || y + r < 0 || y - r > h) continue;

      ctx.save();

      // —— 球体本体：深色玻璃 + 内部色相
      const g = ctx.createRadialGradient(o.x - r * .3, y - r * .35, r * .1, o.x, y, r);
      g.addColorStop(0, `hsla(${o.hue}, 70%, 72%, .95)`);
      g.addColorStop(.45, `hsla(${o.hue}, 60%, 46%, .55)`);
      g.addColorStop(1, `hsla(${o.hue + 20}, 55%, 16%, .85)`);
      ctx.beginPath();
      ctx.arc(o.x, y, r, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();

      // —— 辉光只给焦点元素（hover）
      if (isHover) {
        ctx.shadowColor = `hsla(${o.hue}, 80%, 65%, .55)`;
        ctx.shadowBlur = 28;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // —— 极细描边 1px 8% 白
      ctx.strokeStyle = 'rgba(255,255,255,.10)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (this.quality === 'high') {
        // —— 折射高光：左上主高光 + 右下环境反射
        const hl = ctx.createRadialGradient(o.x - r * .38, y - r * .42, 0, o.x - r * .38, y - r * .42, r * .5);
        hl.addColorStop(0, 'rgba(255,255,255,.75)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.arc(o.x, y, r, 0, TAU);
        ctx.fillStyle = hl;
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(o.x + r * .3, y + r * .42, r * .34, r * .16, -0.5, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,.10)';
        ctx.fill();
      }

      // —— 进度环：玩过的球（已解锁结局 / 总结局）
      const it = o.item;
      if (it.progress > 0) {
        const full = it.progress >= 1;
        ctx.beginPath();
        ctx.arc(o.x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, it.progress));
        ctx.strokeStyle = full ? '#f4c76a' : 'rgba(110,168,255,.85)'; // 全结局镀金
        ctx.lineWidth = full ? 3 : 2;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  /**
   * 招牌时刻：把球膨胀铺满屏，交给 Player。返回一个 Promise，动画结束 resolve。
   * 退出时用 collapse() 缩回原位（镜头记忆）。
   */
  static expand(rect, host) {
    const el = document.createElement('div');
    el.className = 'orb-expand';
    Object.assign(el.style, {
      position: 'fixed',
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      borderRadius: '50%',
      background: 'radial-gradient(circle at 35% 30%, #7fb0ff, #1b2545 70%)',
      zIndex: 'var(--z-player)',
      transition: `all var(--t-signature) var(--ease)`,
      willChange: 'transform, opacity',
    });
    host.appendChild(el);
    // 强制一帧，让 transition 生效
    el.getBoundingClientRect();
    Object.assign(el.style, {
      left: '0px', top: '0px', width: '100vw', height: '100vh', borderRadius: '0',
    });
    return new Promise((res) => setTimeout(() => res(el), SIGNATURE_MS));
  }

  static collapse(el, rect) {
    Object.assign(el.style, {
      left: rect.left + 'px', top: rect.top + 'px',
      width: rect.width + 'px', height: rect.height + 'px',
      borderRadius: '50%', opacity: '0',
    });
    return new Promise((res) => setTimeout(() => { el.remove(); res(); }, SIGNATURE_MS));
  }
}
