/* =====================================================================
 * vn/compile.ts · 灵动剧本 script.md → project.js 编译器（TS 移植版）
 * 与 灵动剧本说明(spec.ts) 是同一格式契约,改格式必须同步改两处。
 * 产物: window.VN_PROJECT(灵动引擎用) + window.GAME_PROJECT(图谱兼容)
 * ===================================================================== */

export interface VNBeat { who?: string; text?: string; pose?: string; x?: number; move?: number; cam?: string; exit?: string }
export interface VNChoiceOpt { t: string; to: string }
export interface VNScene {
  name: string; act: string | null; beats: VNBeat[];
  bg?: string; bgRef?: string | null; imgPrompt?: string; bgManual?: boolean;
  amb?: string; fx?: string; filter?: string; bgm?: string; clear?: boolean;
  next?: string; choice?: { q: string; opts: VNChoiceOpt[] };
  ending?: boolean; tier?: string; epi?: string;
}
export interface VNProject {
  meta: { title: string; theme: string; subtitle: string; titleBg: string; mode: 'vn'; styleHint: string; sprHint: string };
  chars: Record<string, { desc: string; voice: string; poses: Record<string, string> }>;
  acts: { id: string; name: string; scenes: string[] }[];
  scenes: Record<string, VNScene>;
  order: string[];
  sprites: { file: string; char: string; pose: string; prompt: string }[];
}
export interface CompileIssue { line?: number; msg: string }
export interface CompileResult {
  ok: boolean; errors: CompileIssue[]; warnings: CompileIssue[];
  stats?: { scenes: number; endings: number; choices: number; beats: number; chars: number; minutes: number };
  js?: string; project?: VNProject; gp?: any;
}

const AMBS: Record<string, string> = { 雨: 'rain', 花园: 'garden', 海: 'sea', 城市: 'city', 夜: 'night', 风: 'wind', 静: 'none', 无: 'none' };
const FXS: Record<string, string> = { 雨: 'rain', 光尘: 'motes', 余烬: 'embers', 萤火: 'fireflies', 雪: 'snow', 花瓣: 'petals', 无: 'none' };
const FILTS: Record<string, string> = { 夜: 'night', 旧照: 'sepia', 迷雾: 'mist', 黑白: 'gray', 无: 'none' };
const BGMS: Record<string, string> = { 静谧: 'calm', 温暖: 'warm', 紧张: 'tense', 壮阔: 'epic', 无: 'none' };
const CAMS: Record<string, string> = { 震动: 'shake', 推近: 'punch', 闪白: 'flashw', 闪黑: 'flashb' };
const VOICES: Record<string, string> = { 男声: 'm', 女声: 'f', 旁白: 'narr', 童声: 'f', 老者: 'm' };
const POSRE = /^(左|中|右|x\d{1,2})$/;
const TIERS = ['传奇', '隐藏', '悲喜', '普通'];

function posX(p: string): number {
  if (p === '左') return 26; if (p === '中') return 50; if (p === '右') return 72;
  const m = /^x(\d{1,2})$/.exec(p); return m ? parseInt(m[1], 10) : 50;
}

interface Ast {
  meta: { title: string; subtitle: string; style: string; sprStyle: string };
  chars: Record<string, { desc: string; voice: string; poses: Record<string, string> }>;
  acts: { id: string; name: string; scenes: string[] }[];
  scenes: Record<string, any>; order: string[];
  errors: CompileIssue[]; warnings: CompileIssue[];
}

export function parse(text: string): Ast {
  const errors: CompileIssue[] = [], warnings: CompileIssue[] = [];
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const meta = { title: '', subtitle: '', style: '', sprStyle: '' };
  const chars: Ast['chars'] = {};
  const acts: Ast['acts'] = [];
  const scenes: Record<string, any> = {};
  const order: string[] = [];
  let curAct: Ast['acts'][0] | null = null, curSc: any = null, mode = '';

  const err = (i: number, msg: string) => errors.push({ line: i + 1, msg });
  const warn = (i: number, msg: string) => warnings.push({ line: i + 1, msg });

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || /^<!--/.test(t)) continue;
    let m: RegExpExecArray | null;
    if ((m = /^#\s+(.+)$/.exec(t)) && !/^##/.test(t)) { meta.title = m[1].trim(); mode = ''; continue; }
    if ((m = /^##\s*幕\s+(\S+)\s*·\s*(.+)$/.exec(t))) {
      curAct = { id: m[1], name: m[2].trim(), scenes: [] }; acts.push(curAct); curSc = null; mode = ''; continue;
    }
    if ((m = /^###\s+(\S+)\s+(.+)$/.exec(t))) {
      const scId = m[1]; let scName = m[2].trim(); let tier: string | null = null;
      const tm = /\[结局\s*[:：]\s*([^\]]+)\]/.exec(scName);
      if (tm) {
        tier = tm[1].trim(); scName = scName.replace(tm[0], '').trim();
        if (TIERS.indexOf(tier) < 0) { warn(i, scId + ' 结局档位「' + tier + '」未知,按「普通」'); tier = '普通'; }
      }
      if (scenes[scId]) err(i, '场景 id 重复: ' + scId);
      curSc = { id: scId, name: scName, tier, img: '', inherit: false, amb: null, fx: null,
        filter: null, bgm: null, clear: false, beats: [], next: null, choice: null, epi: null,
        ending: /^E_/.test(scId), act: curAct ? curAct.id : null };
      if (curSc.ending && !tier) { warn(i, scId + ' 是结局但未标 [结局:档位],按「普通」'); curSc.tier = '普通'; }
      scenes[scId] = curSc; order.push(scId);
      if (curAct) curAct.scenes.push(scId); else err(i, scId + ' 出现在任何「## 幕」之前');
      mode = ''; continue;
    }
    /* -- 头部 -- */
    if (!curAct && !curSc) {
      if ((m = /^(副标题|画风|立绘画风)\s*[:：]\s*(.+)$/.exec(t))) {
        if (m[1] === '副标题') meta.subtitle = m[2].trim();
        else if (m[1] === '画风') meta.style = m[2].trim();
        else meta.sprStyle = m[2].trim();
        continue;
      }
      if ((m = /^角色\s*[:：]\s*(\S+)\s*=\s*(.+)$/.exec(t))) {
        const cname = m[1].trim(); let rest = m[2].trim(); let voice = 'm';
        const vm = /\[([^\]]+)\]\s*$/.exec(rest);
        if (vm) { voice = VOICES[vm[1].trim()] || 'm'; rest = rest.replace(vm[0], '').trim(); }
        else warn(i, '角色 ' + cname + ' 未标声线([男声]/[女声]),默认男声');
        chars[cname] = { desc: rest, voice, poses: { 默认: '' } };
        continue;
      }
      if ((m = /^姿势\s*[:：]\s*(\S+)\s*=\s*(.+)$/.exec(t))) {
        const pc = m[1].trim();
        if (!chars[pc]) { err(i, '姿势行引用了未定义的角色: ' + pc); continue; }
        const pRe = /([^\s,，(（]+)\s*[(（]([^)）]*)[)）]/g; let pm: RegExpExecArray | null; let hit = 0;
        while ((pm = pRe.exec(m[2]))) { chars[pc].poses[pm[1]] = pm[2]; hit++; }
        if (!hit) warn(i, '姿势行没有解析出任何「姿势名(描述)」: ' + m[2].trim());
        continue;
      }
      continue;
    }
    if (!curSc) continue;
    /* -- 场景字段 -- */
    if ((m = /^背景\s*[:：]\s*(.+)$/.exec(t))) {
      const bg = m[1].trim();
      if (bg === '同上') curSc.inherit = true; else curSc.img = bg;
      continue;
    }
    if ((m = /^环境音\s*[:：]\s*(.+)$/.exec(t))) {
      const a = m[1].trim();
      if (!(a in AMBS)) warn(i, curSc.id + ' 环境音「' + a + '」未知(可用:' + Object.keys(AMBS).join('/') + '),按「静」');
      curSc.amb = AMBS[a] || 'none'; continue;
    }
    if ((m = /^粒子\s*[:：]\s*(.+)$/.exec(t))) {
      const f = m[1].trim();
      if (!(f in FXS)) warn(i, curSc.id + ' 粒子「' + f + '」未知(可用:' + Object.keys(FXS).join('/') + '),按「无」');
      curSc.fx = FXS[f] || 'none'; continue;
    }
    if ((m = /^滤镜\s*[:：]\s*(.+)$/.exec(t))) { curSc.filter = FILTS[m[1].trim()] || 'none'; continue; }
    if ((m = /^音乐\s*[:：]\s*(.+)$/.exec(t))) {
      const b = m[1].trim();
      if (!(b in BGMS)) warn(i, curSc.id + ' 音乐「' + b + '」未知(可用:' + Object.keys(BGMS).join('/') + '),按「静谧」');
      curSc.bgm = BGMS[b] || 'calm'; continue;
    }
    if (/^清场\s*[:：]/.test(t)) { curSc.clear = /是|清/.test(t); continue; }
    if (/^台词\s*[:：]\s*$/.test(t)) { mode = 'lines'; continue; }
    if ((m = /^镜头\s*[:：]\s*(.+)$/.exec(t))) {
      const cam = CAMS[m[1].trim()];
      if (!cam) { warn(i, curSc.id + ' 镜头「' + m[1].trim() + '」未知(可用:震动/推近/闪白/闪黑)'); continue; }
      const lastBeat = curSc.beats[curSc.beats.length - 1];
      if (lastBeat) lastBeat.cam = cam; else warn(i, curSc.id + ' 镜头行前面没有台词行,忽略');
      continue;
    }
    if ((m = /^下一步\s*[:：]\s*(\S+)$/.exec(t))) { curSc.next = m[1]; mode = ''; continue; }
    if ((m = /^抉择\s*[:：]\s*(.*)$/.exec(t))) { curSc.choice = { q: m[1].trim(), opts: [] }; mode = 'choice'; continue; }
    if ((m = /^结语\s*[:：]\s*(.+)$/.exec(t))) { curSc.epi = m[1].trim().replace(/^「|」$/g, ''); continue; }

    if (mode === 'choice' && (m = /^-\s*(.+?)\s*→\s*(\S+)\s*$/.exec(t))) {
      curSc.choice.opts.push({ t: m[1].trim(), to: m[2].trim() }); continue;
    }
    /* -- 台词行 -- */
    if (mode === 'lines' || /^-\s/.test(t)) {
      if ((m = /^-\s*(\S+?)\s+退场\s*$/.exec(t))) {
        const cx = m[1];
        if (cx !== '旁白' && !chars[cx]) { err(i, curSc.id + ' 退场行引用未定义角色: ' + cx); continue; }
        curSc.beats.push({ exit: cx }); continue;
      }
      if ((m = /^-\s*([^:：]+?)\s*[:：]\s*(.+)$/.exec(t))) {
        let head = m[1].trim(); const body = m[2].trim();
        const beat: VNBeat = { text: body };
        const mv = /^(\S+?)\s*→\s*(\S+)$/.exec(head);
        if (mv) { head = mv[1]; if (POSRE.test(mv[2])) beat.move = posX(mv[2]); else warn(i, curSc.id + ' 移动目标「' + mv[2] + '」格式应为 左/中/右/xNN'); }
        const pm2 = /^([^(（@]+)(?:[(（]([^)）]+)[)）])?(?:@(\S+))?$/.exec(head);
        if (!pm2) { err(i, curSc.id + ' 台词行说话人格式无法解析: ' + head); continue; }
        beat.who = pm2[1].trim();
        if (pm2[2]) beat.pose = pm2[2].trim();
        if (pm2[3]) { if (POSRE.test(pm2[3])) beat.x = posX(pm2[3]); else warn(i, curSc.id + ' 位置「@' + pm2[3] + '」格式应为 左/中/右/xNN'); }
        if (beat.who !== '旁白') {
          if (!chars[beat.who!]) { err(i, curSc.id + ' 台词引用未定义角色「' + beat.who + '」(角色要在头部用「角色: 名 = 描述 [声线]」定义)'); continue; }
          if (beat.pose && !(beat.pose in chars[beat.who!].poses)) { warn(i, curSc.id + ' 角色 ' + beat.who + ' 姿势「' + beat.pose + '」未在头部「姿势:」里定义,按默认'); beat.pose = undefined; }
        }
        curSc.beats.push(beat); continue;
      }
      warn(i, curSc.id + ' 无法识别的台词行: ' + t.slice(0, 40));
      continue;
    }
  }
  return { meta, chars, acts, scenes, order, errors, warnings };
}

function validate(ast: Ast) {
  const errors: CompileIssue[] = [], warnings: CompileIssue[] = [];
  const ids = ast.order;
  if (!ast.meta.title) errors.push({ line: 1, msg: '缺少「# 标题」' });
  if (!ids.length) errors.push({ line: 1, msg: '没有任何场景' });
  if (!Object.keys(ast.chars).length) warnings.push({ line: 1, msg: '头部没有定义任何「角色:」,整部将只有旁白' });
  let chars = 0, choices = 0, beatsN = 0;
  const reach: Record<string, 1> = {}; const endings: string[] = [];
  ids.forEach(id => {
    const sc = ast.scenes[id];
    if (sc.ending) endings.push(id);
    beatsN += sc.beats.length;
    sc.beats.forEach((b: VNBeat) => { chars += (b.text || '').length; });
    if (sc.choice) {
      choices++;
      if (!sc.choice.opts.length) errors.push({ msg: id + ' 的抉择没有任何选项' });
      sc.choice.opts.forEach((o: VNChoiceOpt) => {
        if (!ast.scenes[o.to]) errors.push({ msg: id + ' 选项「' + o.t + '」跳转到不存在的场景: ' + o.to });
        else reach[o.to] = 1;
      });
      if (sc.next) warnings.push({ msg: id + ' 同时有「抉择」和「下一步」,抉择优先,下一步忽略' });
    } else if (sc.next) {
      if (!ast.scenes[sc.next]) errors.push({ msg: id + ' 「下一步」指向不存在的场景: ' + sc.next });
      else reach[sc.next] = 1;
    } else if (!sc.ending) {
      errors.push({ msg: id + ' 不是结局(E_ 前缀)却没有「下一步」或「抉择」,剧情会断头' });
    }
    if (!sc.ending && !sc.beats.length) warnings.push({ msg: id + ' 没有任何台词' });
    if (sc.inherit && ids.indexOf(id) === 0) errors.push({ msg: id + ' 是第一个场景,背景不能写「同上」' });
    if (!sc.inherit && !sc.img && !sc.ending) warnings.push({ msg: id + ' 没有「背景:」(将沿用上一场景)' });
  });
  ids.forEach((id, ix) => {
    if (ix > 0 && !reach[id] && !ast.scenes[id].ending) warnings.push({ msg: id + ' 没有任何入口(不可达场景)' });
  });
  if (!endings.length) errors.push({ msg: '没有任何结局场景(E_ 前缀)' });
  const minutes = Math.round((chars * 0.34 + beatsN * 1.6 + choices * 8) / 60);
  return { errors, warnings, stats: { scenes: ids.length, endings: endings.length, choices, beats: beatsN, chars, minutes } };
}

function build(ast: Ast, prev?: { project?: VNProject; gp?: any }) {
  const oldScenes: Record<string, any> = (prev && prev.project && prev.project.scenes) || {};
  const project: VNProject = {
    meta: {
      title: ast.meta.title, theme: ast.meta.subtitle || ast.meta.title, subtitle: ast.meta.subtitle,
      titleBg: 'bg_title.jpg', mode: 'vn',
      styleHint: ast.meta.style || '电影级概念场景,情绪化布光,水墨与现代融合,画面中不出现任何文字',
      sprHint: ast.meta.sprStyle || '2D anime visual-novel standing sprite, East-Asian ink-wash fused with modern anime cel style, clean ink outlines, muted elegant palette, soft cinematic rim light',
    },
    chars: {}, acts: [], scenes: {}, order: ast.order.slice(), sprites: [],
  };
  Object.keys(ast.chars).forEach(cn => {
    const c = ast.chars[cn];
    project.chars[cn] = { desc: c.desc, voice: c.voice, poses: {} };
    Object.keys(c.poses).forEach(pn => {
      const file = 'spr_' + cn + '_' + pn + '.png';
      project.chars[cn].poses[pn] = file;
      project.sprites.push({ file, char: cn, pose: pn, prompt: c.desc + (c.poses[pn] ? ',' + c.poses[pn] : '') });
    });
  });
  project.acts = ast.acts.map(a => ({ id: a.id, name: a.name, scenes: a.scenes.slice() }));
  let lastBgScene: string | null = null;
  ast.order.forEach(id => {
    const s = ast.scenes[id];
    const sc: VNScene = { name: s.name, act: s.act, beats: s.beats, ending: s.ending || undefined, tier: s.tier || undefined };
    if (s.img) { sc.bg = 'bg_' + id + '.jpg'; sc.imgPrompt = s.img; lastBgScene = id; }
    else { sc.bgRef = lastBgScene; if (!lastBgScene) sc.bg = 'bg_title.jpg'; }
    if (s.amb != null) sc.amb = s.amb;
    if (s.fx != null) sc.fx = s.fx;
    if (s.filter != null) sc.filter = s.filter;
    if (s.bgm != null) sc.bgm = s.bgm;
    if (s.clear) sc.clear = true;
    if (s.choice) sc.choice = s.choice; else if (s.next) sc.next = s.next;
    if (s.epi) sc.epi = s.epi;
    const old = oldScenes[id];
    if (old && old.bgManual) { sc.bg = old.bg; sc.bgManual = true; }
    project.scenes[id] = sc;
  });
  /* GAME_PROJECT 兼容层(图谱等) */
  const gp: any = {
    meta: { title: project.meta.title, theme: project.meta.theme, subtitle: project.meta.subtitle,
      titleBg: project.meta.titleBg, styleHint: project.meta.styleHint, mode: 'vn' },
    chapters: project.acts.map(a => ({ id: a.id, name: a.name, scenes: a.scenes.slice() })),
    scenes: {}, graph: (prev && prev.gp && prev.gp.graph) || {},
  };
  ast.order.forEach(id => {
    const sc = project.scenes[id];
    const g: any = { name: sc.name, ch: sc.act };
    if (sc.bg) { g.bg = sc.bg; if (sc.imgPrompt) g.imgPrompt = sc.imgPrompt; if (sc.bgManual) g.bgManual = true; }
    if (sc.ending) { g.ending = true; g.tier = sc.tier; }
    if (sc.choice) g.choice = { q: sc.choice.q, opts: sc.choice.opts.map(o => ({ t: o.t, to: o.to })) };
    else if (sc.next) g.next = sc.next;
    gp.scenes[id] = g;
  });
  return { project, gp };
}

export function serialize(built: { project: VNProject; gp: any }): string {
  return '/* 由 vn/compile.ts 从 script.md 编译生成 · 请改 script.md 而不是直接改本文件 */\n'
    + 'window.VN_PROJECT=' + JSON.stringify(built.project) + ';\n'
    + 'window.GAME_PROJECT=' + JSON.stringify(built.gp) + ';\n';
}

export function compile(text: string, prev?: { project?: VNProject; gp?: any }): CompileResult {
  const ast = parse(text);
  if (ast.errors.length) return { ok: false, errors: ast.errors, warnings: ast.warnings };
  const v = validate(ast);
  if (v.errors.length) return { ok: false, errors: v.errors, warnings: ast.warnings.concat(v.warnings), stats: v.stats };
  const built = build(ast, prev);
  return { ok: true, errors: [], warnings: ast.warnings.concat(v.warnings), stats: v.stats, js: serialize(built), project: built.project, gp: built.gp };
}
