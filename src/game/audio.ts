// 沉浸式音景引擎 —— 纯 Web Audio 程序化合成，零外部音频依赖、零版权风险。
// 为水墨叙事服务:缓慢演化的五声和声 pad + 纸面/风声底噪作 BGM，按场景"情绪"
// 切换调式与明暗(calm/tense/sorrow/hope/grand);拨弦式短音作翻页/抉择音效，
// 结局给一段收束琶音。始终安宁、不喧宾夺主。
//
// 选型:相比下载循环 mp3，合成可随情绪/场景实时变调、可复现、不占体积、无授权风险。
import { reactive, watch } from "vue";

export interface AudioCfg {
  bgm: boolean; // 背景氛围开关
  sfx: boolean; // 音效开关
  master: number; // 总音量 0..1
  bgmVol: number; // 背景音量 0..1
  sfxVol: number; // 音效音量 0..1
}

export type Mood = "calm" | "tense" | "sorrow" | "hope" | "grand";

interface MoodPreset {
  roots: number[]; // 可游走的根音(MIDI)
  intervals: number[]; // 五个声部音程(半音)
  filter: number; // 低通基准
  wind: number; // 底噪音量
  bgm: number; // 该情绪下的 pad 基准音量
}

const MOODS: Record<Mood, MoodPreset> = {
  calm: { roots: [45, 48, 43, 50], intervals: [0, 7, 12, 14, 19], filter: 1000, wind: 0.012, bgm: 0.16 },
  tense: { roots: [40, 43, 38, 41], intervals: [0, 3, 7, 10, 14], filter: 660, wind: 0.022, bgm: 0.15 },
  sorrow: { roots: [41, 43, 40, 36], intervals: [0, 3, 7, 12, 15], filter: 760, wind: 0.016, bgm: 0.15 },
  hope: { roots: [50, 52, 55, 57], intervals: [0, 4, 7, 11, 14], filter: 1300, wind: 0.01, bgm: 0.15 },
  grand: { roots: [43, 45, 48, 50], intervals: [0, 7, 12, 19, 24], filter: 1500, wind: 0.014, bgm: 0.18 },
};

const PENTA = [0, 2, 4, 7, 9];

const CFG_KEY = "polaris.audio.v1";

function loadCfg(): AudioCfg {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      return {
        bgm: o.bgm !== false,
        sfx: o.sfx !== false,
        master: num(o.master, 0.7),
        bgmVol: num(o.bgmVol, 0.6),
        sfxVol: num(o.sfxVol, 0.8),
      };
    }
  } catch {
    /* ignore */
  }
  return { bgm: true, sfx: true, master: 0.7, bgmVol: 0.6, sfxVol: 0.8 };
}
function num(v: any, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d;
}

export const audioCfg = reactive<AudioCfg>(loadCfg());

watch(
  audioCfg,
  (v) => {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
    engine.applyConfig();
  },
  { deep: true }
);

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private wind: AudioBufferSourceNode | null = null;
  private voices: { osc: OscillatorNode; gain: GainNode }[] = [];
  private lfoTimer: number | null = null;
  private started = false;
  private unlocked = false;
  private sceneIdx = 0;
  private mood: Mood = "calm";

  unlock() {
    this.ensure();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    this.unlocked = true;
  }

  private ensure() {
    if (this.ctx) return;
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = audioCfg.master;
    this.master.connect(this.ctx.destination);
  }

  private preset(): MoodPreset {
    return MOODS[this.mood] || MOODS.calm;
  }

  applyConfig() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(audioCfg.master, t, 0.1);
    if (!audioCfg.bgm) {
      this.stopBgm();
    } else {
      if (this.unlocked && !this.started) this.startBgm();
      const p = this.preset();
      this.bgmGain?.gain.setTargetAtTime(p.bgm * audioCfg.bgmVol, t, 0.4);
      this.windGain?.gain.setTargetAtTime(p.wind * audioCfg.bgmVol, t, 0.4);
    }
  }

  startBgm() {
    this.ensure();
    if (!this.ctx || !this.master || this.started || !audioCfg.bgm) return;
    this.started = true;
    const ctx = this.ctx;
    const p = this.preset();

    this.bgmFilter = ctx.createBiquadFilter();
    this.bgmFilter.type = "lowpass";
    this.bgmFilter.frequency.value = p.filter;
    this.bgmFilter.Q.value = 0.6;

    this.bgmGain = ctx.createGain();
    this.bgmGain.gain.value = 0;
    this.bgmFilter.connect(this.bgmGain);
    this.bgmGain.connect(this.master);
    this.bgmGain.gain.setTargetAtTime(p.bgm * audioCfg.bgmVol, ctx.currentTime, 1.2);

    const root = p.roots[this.sceneIdx % p.roots.length];
    p.intervals.forEach((iv, i) => {
      const osc = ctx.createOscillator();
      osc.type = i < 2 ? "sine" : "triangle";
      osc.frequency.value = midiToFreq(root + iv);
      osc.detune.value = (i - 2) * 3;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      osc.connect(g);
      g.connect(this.bgmFilter!);
      osc.start();
      this.voices.push({ osc, gain: g });
    });

    const noise = this.makeNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 620;
    bp.Q.value = 0.5;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = p.wind * audioCfg.bgmVol;
    noise.connect(bp);
    bp.connect(this.windGain);
    this.windGain.connect(this.master);
    noise.start();
    this.wind = noise;

    let tick = 0;
    this.lfoTimer = window.setInterval(() => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      tick++;
      this.voices.forEach((v, i) => {
        const phase = (tick + i * 1.7) % 12;
        const target = 0.04 + 0.09 * (0.5 + 0.5 * Math.sin((phase / 12) * Math.PI * 2));
        v.gain.gain.setTargetAtTime(target, t, 2.5);
      });
      const base = this.preset().filter;
      const fc = base + base * 0.28 * Math.sin((tick / 9) * Math.PI * 2);
      this.bgmFilter?.frequency.setTargetAtTime(fc, t, 3);
    }, 3000);
  }

  private makeNoise(ctx: AudioContext): AudioBufferSourceNode {
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099;
      b1 = 0.963 * b1 + white * 0.2965;
      b2 = 0.57 * b2 + white * 1.0526;
      d[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  }

  stopBgm() {
    if (this.lfoTimer) {
      clearInterval(this.lfoTimer);
      this.lfoTimer = null;
    }
    if (this.ctx && this.bgmGain) {
      const now = this.ctx.currentTime;
      this.bgmGain.gain.setTargetAtTime(0, now, 0.6);
      this.windGain?.gain.setTargetAtTime(0, now, 0.6);
      const voices = this.voices;
      const wind = this.wind;
      window.setTimeout(() => {
        voices.forEach((v) => {
          try {
            v.osc.stop();
          } catch {
            /* ignore */
          }
        });
        try {
          wind?.stop();
        } catch {
          /* ignore */
        }
      }, 1500);
    }
    this.voices = [];
    this.wind = null;
    this.started = false;
  }

  /** 切换情绪:重调式 + 改明暗 + 改底噪。 */
  setMood(mood: Mood) {
    if (!mood || this.mood === mood) return;
    this.mood = mood;
    if (!this.ctx || !this.started) return;
    this.retune(2.4);
    const t = this.ctx.currentTime;
    const p = this.preset();
    this.bgmGain?.gain.setTargetAtTime(p.bgm * audioCfg.bgmVol, t, 1.5);
    this.windGain?.gain.setTargetAtTime(p.wind * audioCfg.bgmVol, t, 1.5);
  }

  /** 场景推进:在当前情绪的根音里游走，做缓慢滑音。 */
  setScene(index: number) {
    this.sceneIdx = index;
    if (!this.ctx || !this.started) return;
    this.retune(2.0);
  }

  private retune(glide: number) {
    if (!this.ctx) return;
    const p = this.preset();
    const root = p.roots[this.sceneIdx % p.roots.length];
    const t = this.ctx.currentTime;
    this.voices.forEach((v, i) => {
      const f = midiToFreq(root + (p.intervals[i] ?? 0));
      v.osc.frequency.setTargetAtTime(f, t, glide);
    });
  }

  private pluck(freq: number, when: number, dur = 0.6, gain = 0.18, type: OscillatorType = "triangle") {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const vol = Math.max(0.0001, gain * audioCfg.sfxVol);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  sfx(name: "advance" | "choice" | "ending" | "back") {
    if (!audioCfg.sfx) return;
    this.ensure();
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const p = this.preset();
    const root = p.roots[this.sceneIdx % p.roots.length] + 24;
    const note = (deg: number) => midiToFreq(root + PENTA[((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5));
    if (name === "advance") {
      this.pluck(note(2), t, 0.5, 0.1);
    } else if (name === "choice") {
      this.pluck(note(0), t, 0.5, 0.13);
      this.pluck(note(2), t + 0.07, 0.6, 0.11);
    } else if (name === "back") {
      this.pluck(note(1), t, 0.45, 0.09);
    } else if (name === "ending") {
      [0, 2, 4, 5].forEach((d, i) => this.pluck(note(d), t + i * 0.18, 1.6, 0.15));
      this.pluck(midiToFreq(p.roots[this.sceneIdx % p.roots.length]), t, 2.4, 0.11, "sine");
    }
  }
}

export const engine = new AudioEngine();
