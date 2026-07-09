/* ============================================================
 * vivid-engine.js · 尘世浮生统一播放内核 (PRD v4 §02 / v7 §03)
 * = 灵动引擎演出层(beats/立绘/打字机/氛围声/天气/镜头/滤镜)
 * + v12.1 数值机制(六维/软上限/骰子/门槛/隐藏线/结局裁定/快照回滚)
 * 零依赖,单文件。用法:
 *   VividEngine.mount(el, project, {start})
 * project 结构见 public/demo/project.json。
 * ============================================================ */
(function (global) {
  "use strict";

  /* ── 工具 ─────────────────────────────────────────────── */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const d10 = () => 1 + Math.floor(Math.random() * 10);

  /* ── 样式注入(一次) ──────────────────────────────────── */
  const CSS = `
.ve-root{position:relative;width:100%;height:100%;overflow:hidden;background:#0a0c12;
  font-family:'Microsoft YaHei','PingFang SC',sans-serif;user-select:none}
.ve-stage{position:absolute;inset:0;transition:transform 1.2s cubic-bezier(.4,0,.2,1),filter .8s ease}
.ve-bg{position:absolute;inset:-4%;background-size:cover;background-position:center;
  transition:opacity .9s ease;opacity:0}
.ve-bg.on{opacity:1}
.ve-chars{position:absolute;inset:0;pointer-events:none}
.ve-char{position:absolute;bottom:0;height:86%;transform:translateX(-50%);
  transition:left 1s cubic-bezier(.4,0,.2,1),opacity .7s ease,filter .5s ease,transform 1s cubic-bezier(.4,0,.2,1)}
.ve-char img{height:100%;display:block;filter:drop-shadow(0 18px 30px rgba(0,0,0,.5))}
.ve-char.dim{filter:brightness(.55) saturate(.7)}
.ve-char.talk{animation:veBreathTalk 2.2s ease-in-out infinite}
.ve-char:not(.talk){animation:veBreath 4.5s ease-in-out infinite}
@keyframes veBreath{0%,100%{transform:translateX(-50%) scale(1)}50%{transform:translateX(-50%) scale(1.006)}}
@keyframes veBreathTalk{0%,100%{transform:translateX(-50%) scale(1)}50%{transform:translateX(-50%) scale(1.014)}}
.ve-char.enter-left{animation:veInL .8s cubic-bezier(.4,0,.2,1)}
.ve-char.enter-right{animation:veInR .8s cubic-bezier(.4,0,.2,1)}
.ve-char.enter-fade{animation:veInF 1s ease}
.ve-char.enter-drop{animation:veInD .7s cubic-bezier(.3,1.4,.5,1)}
@keyframes veInL{from{opacity:0;left:-15%!important}}
@keyframes veInR{from{opacity:0;left:115%!important}}
@keyframes veInF{from{opacity:0}}
@keyframes veInD{from{opacity:0;transform:translateX(-50%) translateY(-40px)}}
.ve-weather{position:absolute;inset:0;pointer-events:none;z-index:4}
.ve-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:9;transition:opacity .18s}
.ve-vign{position:absolute;inset:0;pointer-events:none;z-index:5;
  background:radial-gradient(ellipse at center,transparent 58%,rgba(0,0,0,.42) 100%)}
.ve-hud{position:absolute;top:14px;left:14px;display:flex;gap:8px;flex-wrap:wrap;z-index:12;max-width:70%}
.ve-stat{background:rgba(10,14,22,.55);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.14);
  color:#dfe6f0;font-size:12px;padding:3px 11px;border-radius:20px;letter-spacing:.5px;transition:.3s}
.ve-stat b{color:#f2cf6e;font-weight:600;margin-left:5px}
.ve-stat.up{border-color:#5fce7b;box-shadow:0 0 12px -2px rgba(95,206,123,.7)}
.ve-stat.down{border-color:#ef7373;box-shadow:0 0 12px -2px rgba(239,115,115,.7)}
.ve-dialog{position:absolute;left:50%;bottom:4.5%;transform:translateX(-50%);width:min(880px,92%);
  background:linear-gradient(180deg,rgba(12,16,26,.78),rgba(9,12,20,.9));backdrop-filter:blur(14px);
  border:1px solid rgba(255,255,255,.13);border-radius:18px;padding:18px 26px 20px;z-index:11;
  box-shadow:0 18px 50px -18px rgba(0,0,0,.8);cursor:pointer;min-height:110px}
.ve-who{color:#f2cf6e;font-size:15px;font-weight:700;letter-spacing:1px;margin-bottom:6px}
.ve-text{color:#e9eef6;font-size:16.5px;line-height:1.85;min-height:60px}
.ve-next{position:absolute;right:18px;bottom:12px;color:#8fa0b8;font-size:12px;animation:veBlink 1.4s infinite}
@keyframes veBlink{0%,100%{opacity:.25}50%{opacity:1}}
.ve-choices{position:absolute;left:50%;bottom:26%;transform:translateX(-50%);display:flex;flex-direction:column;
  gap:12px;z-index:13;width:min(560px,88%)}
.ve-opt{background:rgba(14,19,30,.82);backdrop-filter:blur(12px);border:1px solid rgba(242,207,110,.4);
  color:#eef2f8;font-size:15.5px;padding:13px 22px;border-radius:14px;cursor:pointer;text-align:center;
  transition:.18s;position:relative}
.ve-opt:hover:not(.lock){border-color:#f2cf6e;background:rgba(242,207,110,.14);transform:translateY(-2px)}
.ve-opt.lock{opacity:.45;cursor:not-allowed;border-color:rgba(255,255,255,.15)}
.ve-opt .req{display:block;font-size:11.5px;color:#c98f8f;margin-top:3px}
.ve-opt .dice{font-size:11.5px;color:#9fb9d8;margin-left:8px}
.ve-toast{position:absolute;top:16%;left:50%;transform:translateX(-50%);z-index:14;
  background:rgba(10,14,22,.85);border:1px solid rgba(242,207,110,.5);color:#f2cf6e;font-size:14px;
  padding:8px 22px;border-radius:24px;opacity:0;transition:.35s;pointer-events:none;white-space:nowrap}
.ve-toast.on{opacity:1}
.ve-ending{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;
  justify-content:center;background:rgba(6,8,13,.94);opacity:0;transition:opacity 1.2s ease;text-align:center;padding:30px}
.ve-ending.on{opacity:1}
.ve-ending .tier{font-size:13px;letter-spacing:6px;margin-bottom:18px;padding:4px 18px;border:1px solid;border-radius:20px}
.ve-ending h1{color:#f0f3f8;font-size:34px;letter-spacing:6px;margin-bottom:22px}
.ve-ending p{color:#a9b4c6;font-size:15.5px;max-width:620px;line-height:2}
.ve-ending .ve-restart{margin-top:36px;background:linear-gradient(135deg,#f2cf6e,#cf9d2e);color:#241a05;
  font-size:15px;font-weight:700;padding:12px 44px;border-radius:26px;cursor:pointer;border:none;letter-spacing:2px}
.ve-title{position:absolute;inset:0;z-index:25;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:#0a0c12;transition:opacity .9s ease;cursor:pointer}
.ve-title.off{opacity:0;pointer-events:none}
.ve-title .cover{width:min(46vh,340px);height:min(46vh,340px);border-radius:50%;background-size:cover;background-position:center;
  box-shadow:0 0 90px -18px rgba(242,207,110,.45),inset 0 0 60px rgba(0,0,0,.35);animation:veGlow 3.5s ease-in-out infinite}
@keyframes veGlow{0%,100%{box-shadow:0 0 90px -18px rgba(242,207,110,.4)}50%{box-shadow:0 0 120px -12px rgba(242,207,110,.65)}}
.ve-title h1{color:#eef2f8;font-size:30px;letter-spacing:10px;margin:34px 0 10px}
.ve-title span{color:#8fa0b8;font-size:13.5px;letter-spacing:3px;animation:veBlink 2s infinite}
.ve-stage.f-sepia{filter:sepia(.55) brightness(.92)}
.ve-stage.f-gray{filter:grayscale(1) brightness(.85)}
.ve-stage.f-dream{filter:blur(1.6px) saturate(1.25) brightness(1.06)}
.ve-stage.f-blood{filter:saturate(1.3) contrast(1.12)}
.ve-stage.f-blood~.ve-vign{background:radial-gradient(ellipse at center,transparent 44%,rgba(120,10,10,.55) 100%)}
@media (prefers-reduced-motion: reduce){.ve-char{animation:none!important}}
`;

  /* ── 天气粒子(canvas) ─────────────────────────────────── */
  const WEATHERS = {
    rain:   { n: 130, mk: () => ({ vx: -2.2, vy: 15 + Math.random() * 9, l: 12 + Math.random() * 12, w: 1, c: "rgba(170,195,230,.5)" }) },
    snow:   { n: 90,  mk: () => ({ vx: (Math.random() - .5) * 1.1, vy: .8 + Math.random() * 1.4, r: 1.2 + Math.random() * 2.4, c: "rgba(240,245,255,.85)" }) },
    petal:  { n: 46,  mk: () => ({ vx: -.9 - Math.random() * 1.2, vy: .9 + Math.random() * 1.3, r: 2.4 + Math.random() * 3, c: "rgba(245,190,205,.8)", sway: Math.random() * 6.28 }) },
    firefly:{ n: 34,  mk: () => ({ vx: (Math.random() - .5) * .5, vy: (Math.random() - .5) * .5, r: 1.4 + Math.random() * 1.6, c: "rgba(230,255,160,.9)", ph: Math.random() * 6.28 }) },
    dust:   { n: 40,  mk: () => ({ vx: .12 + Math.random() * .2, vy: -.06 - Math.random() * .12, r: 1 + Math.random() * 1.8, c: "rgba(255,240,205,.4)", ph: Math.random() * 6.28 }) },
  };

  function weatherLayer(canvas) {
    const ctx = canvas.getContext("2d");
    let kind = null, ps = [], raf = 0, t = 0;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    new ResizeObserver(resize).observe(canvas); resize();
    function loop() {
      t += 0.016;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width, H = canvas.height;
      for (const p of ps) {
        p.x += p.vx; p.y += p.vy;
        if (p.sway != null) p.x += Math.sin(t * 2 + p.sway) * .5;
        if (p.x < -20) p.x = W + 10; if (p.x > W + 20) p.x = -10;
        if (p.y > H + 20) { p.y = -10; p.x = Math.random() * W; }
        if (p.y < -20) p.y = H + 10;
        const a = p.ph != null ? (Math.sin(t * 1.8 + p.ph) * .5 + .5) : 1;
        ctx.globalAlpha = a;
        if (p.l) { // 雨线
          ctx.strokeStyle = p.c; ctx.lineWidth = p.w;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx, p.y + p.l); ctx.stroke();
        } else {
          ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    }
    return {
      set(k) {
        if (k === kind) return; kind = k;
        cancelAnimationFrame(raf); ps = [];
        if (!k || !WEATHERS[k]) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
        const spec = WEATHERS[k];
        for (let i = 0; i < spec.n; i++) {
          const p = spec.mk(); p.x = Math.random() * canvas.width; p.y = Math.random() * canvas.height; ps.push(p);
        }
        loop();
      },
      stop() { cancelAnimationFrame(raf); },
    };
  }

  /* ── 音频(BGM 交叉淡入 / 一次性音效 / 环境声) ────────── */
  function audioBox(assets) {
    let bgmA = null, ambA = null, enabled = false;
    const url = (k) => (k && assets[k]) || k;
    const fade = (a, to, ms) => {
      if (!a) return; const from = a.volume, t0 = performance.now();
      const step = (t) => {
        const r = clamp((t - t0) / ms, 0, 1);
        a.volume = from + (to - from) * r;
        if (r < 1) requestAnimationFrame(step); else if (to === 0) { a.pause(); }
      }; requestAnimationFrame(step);
    };
    const play = (src, loop, vol) => {
      const a = new Audio(url(src)); a.loop = !!loop; a.volume = 0;
      a.play().then(() => fade(a, vol, 700)).catch(() => {});
      return a;
    };
    return {
      unlock() { enabled = true; },
      bgm(k) { if (!enabled) return; fade(bgmA, 0, 700); bgmA = k ? play(k, true, .55) : null; },
      amb(k) { if (!enabled) return; fade(ambA, 0, 500); ambA = k ? play(k, true, .35) : null; },
      sfx(k) { if (!enabled || !k) return; play(k, false, .8); },
      stopAll() { fade(bgmA, 0, 400); fade(ambA, 0, 400); },
    };
  }

  /* ── 数值机制(v12.1 提炼) ────────────────────────────── */
  function mechanics(project) {
    const defs = project.stats || [];
    const st = {}; defs.forEach((d) => (st[d.id] = d.init != null ? d.init : 8));
    const hl = new Set(); // 隐藏线触达
    let rerolls = project.rerolls != null ? project.rerolls : 2;
    const softGain = (cur, delta, max) => {
      if (delta <= 0) return delta;                        // 负面原样(低值保护在 apply 里)
      const ratio = cur / max;
      let d = ratio > 0.85 ? Math.ceil(delta * 0.4) : ratio > 0.65 ? Math.ceil(delta * 0.7) : delta;
      return Math.max(1, d);                               // 未满值保底 +1
    };
    return {
      st, hl,
      def: (id) => defs.find((d) => d.id === id),
      apply(fx) {                                          // fx: {statId: delta,...}
        const changed = {};
        for (const [k, dRaw] of Object.entries(fx || {})) {
          const def = this.def(k); if (!def) continue;
          let d = dRaw;
          if (d > 0) d = softGain(st[k], d, def.max || 20);
          if (d < 0 && st[k] < 8) d = Math.ceil(d / 2);    // 低值保护:负面减半
          st[k] = clamp(st[k] + d, 0, def.max || 20);
          changed[k] = d;
        }
        return changed;
      },
      meet: (req) => Object.entries(req || {}).every(([k, v]) => (st[k] || 0) >= v),
      reqText: (req) => Object.entries(req || {})
        .map(([k, v]) => { const d = defs.find((x) => x.id === k); return `${d ? d.name : k}≥${v} · 当前${st[k] || 0}`; }).join("  "),
      roll(dice) {                                          // dice:{diff,bonus:statId}
        const r = d10();
        const bonus = dice.bonus ? Math.floor((st[dice.bonus] || 0) / 4) : 0;
        return { r, bonus, total: r + bonus, ok: r + bonus >= (dice.diff || 6) };
      },
      dead: () => (st.health != null && st.health <= 0) ? "health"
              : (st.mind   != null && st.mind   <= 0) ? "mind" : null,
      useReroll: () => (rerolls > 0 ? (--rerolls, true) : false),
      get rerolls() { return rerolls; },
    };
  }

  /* ── 引擎主体 ─────────────────────────────────────────── */
  function mount(root, project, opts = {}) {
    if (!document.getElementById("ve-style")) {
      const s = el("style"); s.id = "ve-style"; s.textContent = CSS; document.head.appendChild(s);
    }
    root.innerHTML = "";
    root.classList.add("ve-root");
    const assets = project.assets || {};
    const A = (k) => (k && assets[k]) || k || "";

    /* DOM 骨架 */
    const stage = el("div", "ve-stage");
    const bgA = el("div", "ve-bg"), bgB = el("div", "ve-bg");
    const chars = el("div", "ve-chars");
    const wCanvas = el("canvas", "ve-weather");
    stage.append(bgA, bgB, chars, wCanvas);
    const vign = el("div", "ve-vign");
    const flash = el("div", "ve-flash");
    const hud = el("div", "ve-hud");
    const dialog = el("div", "ve-dialog");
    const whoEl = el("div", "ve-who"), textEl = el("div", "ve-text"), nextEl = el("div", "ve-next", "▼ 点击继续");
    dialog.append(whoEl, textEl, nextEl);
    const choicesEl = el("div", "ve-choices");
    const toast = el("div", "ve-toast");
    root.append(stage, vign, flash, hud, dialog, choicesEl, toast);

    const weather = weatherLayer(wCanvas);
    const audio = audioBox(assets);
    const mech = mechanics(project);

    /* HUD */
    function renderHUD(changed) {
      hud.innerHTML = "";
      (project.stats || []).forEach((d) => {
        const c = el("div", "ve-stat", `${d.name}<b>${mech.st[d.id]}</b>`);
        if (changed && changed[d.id] > 0) c.classList.add("up");
        if (changed && changed[d.id] < 0) c.classList.add("down");
        hud.appendChild(c);
      });
    }
    function say(msg) {
      toast.textContent = msg; toast.classList.add("on");
      clearTimeout(say._t); say._t = setTimeout(() => toast.classList.remove("on"), 2200);
    }

    /* 背景双缓冲 */
    let bgFront = bgA;
    function setBg(key) {
      if (!key) return;
      const back = bgFront === bgA ? bgB : bgA;
      back.style.backgroundImage = `url("${A(key)}")`;
      back.classList.add("on"); bgFront.classList.remove("on"); bgFront = back;
    }

    /* 立绘管理 */
    const charEls = {};
    function syncChars(list, talkingId) {
      const want = new Set((list || []).map((c) => c.id));
      for (const id of Object.keys(charEls)) {
        if (!want.has(id)) { charEls[id].style.opacity = 0; setTimeout(((n) => () => n.remove())(charEls[id]), 700); delete charEls[id]; }
      }
      (list || []).forEach((c) => {
        let node = charEls[id => id] && null;
        node = charEls[c.id];
        if (!node) {
          node = el("div", "ve-char"); node.style.opacity = 0;
          const img = el("img"); node.appendChild(img); chars.appendChild(node);
          charEls[c.id] = node;
          if (c.enter) node.classList.add("enter-" + c.enter);
          setTimeout(() => { node.style.opacity = 1; }, 30);
        }
        if (c.img) node.querySelector("img").src = A(c.img);
        if (c.x != null) node.style.left = c.x + "%";
        node.classList.toggle("talk", c.id === talkingId);
        node.classList.toggle("dim", talkingId != null && c.id !== talkingId);
        setTimeout(() => node.classList.remove("enter-left", "enter-right", "enter-fade", "enter-drop"), 900);
      });
    }

    /* 镜头 / 滤镜 */
    function setCam(cam) {
      if (!cam) { stage.style.transform = ""; return; }
      if (cam.shake) {
        const amp = { light: 4, mid: 9, heavy: 16 }[cam.shake] || 9;
        let i = 0; const iv = setInterval(() => {
          stage.style.transform = `translate(${(Math.random() - .5) * amp}px,${(Math.random() - .5) * amp}px)`;
          if (++i > 14) { clearInterval(iv); stage.style.transform = ""; }
        }, 34);
        return;
      }
      const z = cam.zoom || 1, px = cam.panX || 0, py = cam.panY || 0;
      stage.style.transform = `scale(${z}) translate(${px}%,${py}%)`;
    }
    function setFilter(f) {
      stage.className = "ve-stage" + (f ? " f-" + f : "");
      if (f === "flashwhite") { flash.style.opacity = .95; setTimeout(() => (flash.style.opacity = 0), 160); stage.className = "ve-stage"; }
    }

    /* 打字机 */
    let typing = null;
    function typeText(t, done) {
      textEl.textContent = ""; nextEl.style.visibility = "hidden";
      let i = 0; clearInterval(typing);
      typing = setInterval(() => {
        textEl.textContent = t.slice(0, ++i);
        if (i >= t.length) { clearInterval(typing); typing = null; nextEl.style.visibility = "visible"; done && done(); }
      }, 28);
      typeText.skip = () => { clearInterval(typing); typing = null; textEl.textContent = t; nextEl.style.visibility = "visible"; };
    }

    /* 剧情推进 */
    let sceneId = null, beatIdx = 0, snapshot = null, ended = false;
    const scenes = project.scenes || {};

    function saveSnapshot() { snapshot = { sceneId, st: { ...mech.st } }; }
    function rollback() {
      if (!snapshot || !mech.useReroll()) return false;
      Object.assign(mech.st, snapshot.st); renderHUD();
      say(`时光倒流 · 剩余重掷 ${mech.rerolls} 次`);
      gotoScene(snapshot.sceneId); return true;
    }

    function gotoScene(id) {
      const sc = scenes[id];
      if (!sc) { console.warn("[vivid] 场景缺失:", id); return; }
      sceneId = id; beatIdx = 0;
      if (sc.snapshot !== false) saveSnapshot();
      if (sc.bg) setBg(sc.bg);
      if (sc.weather !== undefined) weather.set(sc.weather);
      if (sc.filter !== undefined) setFilter(sc.filter);
      if (sc.bgm !== undefined) audio.bgm(sc.bgm);
      if (sc.amb !== undefined) audio.amb(sc.amb);
      nextBeat();
    }

    function nextBeat() {
      if (ended) return;
      const sc = scenes[sceneId];
      const beats = sc.beats || [];
      if (beatIdx < beats.length) {
        const b = beats[beatIdx++];
        if (b.hl) { mech.hl.add(b.hl); say("✦ 触达隐藏线"); }
        if (b.fx) { const ch = mech.apply(b.fx); renderHUD(ch); }
        if (b.cam !== undefined) setCam(b.cam);
        if (b.filter !== undefined) setFilter(b.filter);
        if (b.weather !== undefined) weather.set(b.weather);
        if (b.bgm !== undefined) audio.bgm(b.bgm);
        if (b.sfx) audio.sfx(b.sfx);
        syncChars(b.chars, b.spr);
        whoEl.textContent = b.who || "";
        typeText(b.text || "…");
        const death = mech.dead();
        if (death) { onDeath(death); return; }
        return;
      }
      // beats 播完 → 选择 / 跳转 / 结局
      if (sc.choice) return showChoices(sc.choice);
      if (sc.ending) return showEnding(sc.ending);
      if (sc.next) return gotoScene(sc.next);
      showEnding(Object.keys(project.endings || {})[0]);
    }

    function showChoices(choice) {
      dialog.style.display = "none";
      choicesEl.innerHTML = "";
      (choice.opts || []).forEach((o) => {
        const ok = mech.meet(o.req);
        const btn = el("div", "ve-opt" + (ok ? "" : " lock"));
        btn.innerHTML = o.t + (o.dice ? `<span class="dice">🎲 d10+${o.dice.bonus ? (mech.def(o.dice.bonus) || {}).name : ""} ≥${o.dice.diff || 6}</span>` : "");
        if (!ok) btn.innerHTML += `<span class="req">🔒 ${mech.reqText(o.req)}</span>`;
        btn.onclick = () => {
          if (!ok) return;
          choicesEl.innerHTML = ""; dialog.style.display = "";
          if (o.fx) { const ch = mech.apply(o.fx); renderHUD(ch); }
          if (o.hl) { mech.hl.add(o.hl); say("✦ 触达隐藏线"); }
          const death = mech.dead(); if (death) return onDeath(death);
          if (o.dice) {
            const res = mech.roll(o.dice);
            say(`🎲 掷出 ${res.r} + 加成 ${res.bonus} = ${res.total} · ${res.ok ? "成功" : "失败"}`);
            setTimeout(() => gotoScene(res.ok ? o.dice.okTo : o.dice.koTo), 900);
          } else {
            gotoScene(o.to);
          }
        };
        choicesEl.appendChild(btn);
      });
    }

    function onDeath(kind) {
      const msg = kind === "health" ? "健康归零,生命走到了尽头…" : "心态崩溃,你再也撑不下去了…";
      if (mech.rerolls > 0) {
        say(msg + " 点击回滚");
        dialog.onclick = () => { dialog.onclick = advance; rollback(); };
      } else {
        showEnding(project.deathEnding || Object.keys(project.endings || {})[0]);
      }
    }

    function showEnding(id) {
      ended = true;
      const e = (project.endings || {})[id] || { tier: "normal", title: "人生落幕", text: "" };
      audio.stopAll(); weather.set(null);
      const tierC = { legend: "#f2cf6e", rare: "#b492f0", normal: "#8fa0b8", dim: "#6b6357" }[e.tier] || "#8fa0b8";
      const tierT = { legend: "传奇结局", rare: "稀有结局", normal: "普通结局", dim: "暗淡结局" }[e.tier] || "结局";
      const box = el("div", "ve-ending");
      box.innerHTML = `<div class="tier" style="color:${tierC};border-color:${tierC}">${tierT}</div>
        <h1>${e.title}</h1><p>${e.text || ""}</p>
        <p style="margin-top:14px;font-size:12.5px;color:#5f6b7d">隐藏线触达 ${mech.hl.size} 处</p>
        <button class="ve-restart">再活一次</button>`;
      root.appendChild(box);
      requestAnimationFrame(() => box.classList.add("on"));
      box.querySelector(".ve-restart").onclick = () => { root.dispatchEvent(new CustomEvent("ve:restart")); mount(root, project, opts); };
      root.dispatchEvent(new CustomEvent("ve:ending", { detail: { id, tier: e.tier } }));
    }

    /* 推进交互 */
    function advance() {
      if (typing) { typeText.skip(); return; }
      nextBeat();
    }
    dialog.onclick = advance;
    root.tabIndex = 0;
    root.addEventListener("keydown", (ev) => {
      if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); advance(); }
    });

    /* 标题幕(封面 + 点击开始 → 解锁音频) */
    const title = el("div", "ve-title");
    title.innerHTML = `<div class="cover" style="background-image:url('${A(project.meta && project.meta.cover)}')"></div>
      <h1>${(project.meta && project.meta.title) || "人生"}</h1><span>— 点击,开始这段人生 —</span>`;
    root.appendChild(title);
    title.onclick = () => {
      audio.unlock(); title.classList.add("off");
      setTimeout(() => title.remove(), 950);
      renderHUD();
      gotoScene(opts.start || project.start);
    };

    return {
      destroy() { ended = true; audio.stopAll(); weather.stop(); root.innerHTML = ""; },
      get state() { return { sceneId, stats: { ...mech.st }, hl: [...mech.hl] }; },
    };
  }

  global.VividEngine = { mount, version: "1.0.0" };
})(window);
