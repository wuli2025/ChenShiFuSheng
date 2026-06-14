// 生成器：调用现有 LLM API（chat.send → claude CLI，走当前 provider）生成/续写剧情。
// 复用 src/tauri.ts 的 chat.send + listen("chat:stream")，不改任何后端契约。
import { chat, listen, type ChatStreamEvent } from "../tauri";
import type {
  GeneratedGame,
  GenScene,
  GenStat,
} from "./story-schema";

export interface CreateReq {
  genre: string; // 题材
  era: string; // 时代 / 背景
  protagonist: string; // 主角设定
  tone: string; // 基调
  length: string; // 篇幅
  requirement: string; // 额外需求（可空）
  injected: string; // 上传资料抽取的文本，直接注入（可空）
}

export type ProgressFn = (info: { chars: number; note?: string }) => void;

const ACCENTS = ["#c98b6b", "#7da08a", "#8aa2b8", "#b08fa8", "#b7a06b"];
const COVERS = [
  "radial-gradient(120% 90% at 80% 0%, rgba(44,70,97,.55), transparent 60%), radial-gradient(100% 80% at 0% 100%, rgba(90,55,50,.4), transparent 55%), #14161a",
  "radial-gradient(120% 90% at 20% 0%, rgba(60,80,70,.5), transparent 60%), #101311",
  "radial-gradient(120% 90% at 50% 0%, rgba(70,60,90,.5), transparent 60%), #0f0e14",
];

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

/** 从一段文本里抽取第一个平衡的 {...} JSON 块并解析。 */
export function extractJson(text: string): any {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("未找到 JSON 起始");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        return JSON.parse(slice);
      }
    }
  }
  throw new Error("JSON 花括号不平衡");
}

const SCHEMA_HINT = `严格只输出一个 JSON 对象（不要任何解释、不要 markdown 代码围栏），结构如下：
{
  "title": "游戏名(4-8字)",
  "subtitle": "一句副标题",
  "tag": "叙事 · 类型",
  "stats": [ {"key":"才情","label":"才情","value":50}, ... 共3-4个属性, value 0-100 ],
  "startScene": "s1",
  "scenes": {
    "s1": {
      "id":"s1",
      "title":"— 一 · 场景名 —",
      "bgPrompt":"给绘图模型的中文画面描述",
      "lines":["旁白第一句","旁白第二句"],
      "options":[
        {"text":"选项A文案","hint":"才情 +,家境 −","effects":{"才情":10,"家境":-6},"next":"s2"},
        {"text":"选项B文案","hint":"风骨 +","effects":{"风骨":8},"next":"s3"}
      ],
      "freeInput": true
    }
  },
  "endings": [
    {"id":"e1","title":"结局名","verse":"一句收束的话","weight":"风骨*2 + 心境"}
  ]
}
要求：scenes 5-6 个，构成一棵有分岔的剧情树，至少一处分岔通向不同后续；末端场景的 option.next 用 "__end__"；endings 给 3-5 个，weight 是只含属性 key 和 + - * / 数字的表达式；所有属性 key 必须在 stats 里出现；中文叙事，文风沉静。`;

function buildCreatePrompt(req: CreateReq): string {
  const opts = [
    req.genre && `题材：${req.genre}`,
    req.era && `时代 / 背景：${req.era}`,
    req.protagonist && `主角：${req.protagonist}`,
    req.tone && `基调：${req.tone}`,
    req.length && `篇幅：${req.length}`,
  ]
    .filter(Boolean)
    .join("\n");
  return `你是一个叙事游戏生成器。请按下面设定，生成一个可玩的分支叙事游戏的数据。
${opts || "题材：自由发挥"}
${req.requirement ? `【额外需求】${req.requirement}` : ""}
${
  req.injected
    ? `【参考资料（用户上传，请作为故事素材 / 人物 / 背景灵感，不要照抄原文）】\n${req.injected}`
    : ""
}

${SCHEMA_HINT}`;
}

/** 调 LLM 聚合流式输出，直到 done，返回全文。 */
function runChat(prompt: string, useKb: boolean, onProgress?: ProgressFn): Promise<string> {
  return new Promise<string>(async (resolve, reject) => {
    let buf = "";
    let myReqId: string | null = null;
    let settled = false;
    let unlisten: (() => void) | null = null;

    try {
      unlisten = await listen<ChatStreamEvent>("chat:stream", (ev) => {
        // reqId 拿到前先按 buffer 累计；拿到后只认自己的流
        if (myReqId && ev.reqId !== myReqId) return;
        if (ev.kind === "delta" && ev.text) {
          buf += ev.text;
          onProgress?.({ chars: buf.length });
        } else if (ev.kind === "error") {
          if (!settled) {
            settled = true;
            unlisten?.();
            reject(new Error(ev.text || "生成出错"));
          }
        } else if (ev.kind === "done") {
          if (!settled) {
            settled = true;
            unlisten?.();
            resolve(buf);
          }
        }
      });

      onProgress?.({ chars: 0, note: "正在调用模型…" });
      myReqId = await chat.send({
        prompt,
        permissionMode: "manual",
        useKb,
      });
    } catch (e: any) {
      if (!settled) {
        settled = true;
        unlisten?.();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }
  });
}

let _seq = 0;
function newId(prefix: string): string {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_seq}`;
}

/** 生成一个完整游戏。 */
export async function generateGame(
  req: CreateReq,
  onProgress?: ProgressFn
): Promise<GeneratedGame> {
  const text = await runChat(buildCreatePrompt(req), false, onProgress);
  onProgress?.({ chars: text.length, note: "正在解析剧情…" });
  const raw = extractJson(text);

  const stats: GenStat[] = Array.isArray(raw.stats)
    ? raw.stats.map((s: any) => ({
        key: String(s.key),
        label: String(s.label ?? s.key),
        value: clamp(Number(s.value) || 50),
      }))
    : [
        { key: "才情", label: "才情", value: 50 },
        { key: "心境", label: "心境", value: 50 },
      ];

  const scenes: Record<string, GenScene> = {};
  if (raw.scenes && typeof raw.scenes === "object") {
    for (const id of Object.keys(raw.scenes)) {
      const s = raw.scenes[id];
      scenes[id] = {
        id,
        title: String(s.title ?? id),
        bgPrompt: s.bgPrompt ? String(s.bgPrompt) : undefined,
        bg: undefined,
        bgCss: undefined,
        lines: Array.isArray(s.lines) ? s.lines.map(String) : [],
        options: Array.isArray(s.options)
          ? s.options.map((o: any) => ({
              text: String(o.text ?? "继续"),
              hint: o.hint ? String(o.hint) : undefined,
              effects: o.effects && typeof o.effects === "object" ? o.effects : undefined,
              next: String(o.next ?? "__end__"),
            }))
          : [],
        freeInput: s.freeInput !== false,
      };
    }
  }

  const startScene =
    raw.startScene && scenes[raw.startScene]
      ? String(raw.startScene)
      : Object.keys(scenes)[0] || "s1";

  const seed = (raw.title || req.genre || "x").length;
  const game: GeneratedGame = {
    id: newId("g"),
    title: String(raw.title || req.genre || "无名故事"),
    subtitle: String(
      raw.subtitle || req.requirement.slice(0, 24) || `${req.era || ""}${req.genre || "一段生成的人生"}`
    ),
    tag: String(raw.tag || `叙事 · ${req.genre || "生成"}`),
    cover: pick(COVERS, seed),
    accent: pick(ACCENTS, seed),
    stats,
    startScene,
    scenes,
    endings: Array.isArray(raw.endings)
      ? raw.endings.map((e: any, i: number) => ({
          id: String(e.id ?? `e${i}`),
          title: String(e.title ?? "终"),
          verse: String(e.verse ?? ""),
          weight: String(e.weight ?? "0"),
        }))
      : [],
    createdAt: Date.now(),
    source: [req.genre, req.era, req.injected ? "含上传资料" : ""]
      .filter(Boolean)
      .join(" · "),
  };
  return game;
}

/** 自由输入续写：玩家在对话框里输入动作，LLM 生成接下来的一个新场景（催生支线）。 */
export async function continueScene(
  game: GeneratedGame,
  current: GenScene,
  statsMap: Record<string, number>,
  action: string
): Promise<GenScene> {
  const prompt = `这是叙事游戏《${game.title}》。玩家当前所在场景：
标题：${current.title}
旁白：${current.lines.join(" ")}
玩家当前属性：${JSON.stringify(statsMap)}
玩家不选预设选项，而是自由输入了一个动作：「${action}」

请承接这个动作，生成"接下来发生的一个新场景"。严格只输出一个 JSON（无解释、无代码围栏）：
{
  "id":"新场景id",
  "title":"— 场景名 —",
  "bgPrompt":"画面描述",
  "lines":["旁白1","旁白2"],
  "options":[{"text":"选项","hint":"","effects":{"属性key":数值},"next":"__end__"}],
  "freeInput": true,
  "effects": {"属性key": 数值}
}
其中顶层 effects 表示玩家这个动作本身带来的属性变化；属性 key 必须是：${Object.keys(
    statsMap
  ).join("、")}。`;

  const text = await runChat(prompt, false);
  const raw = extractJson(text);
  const id = String(raw.id || newId("free"));
  const scene: GenScene = {
    id,
    title: String(raw.title ?? "— 支线 —"),
    bgPrompt: raw.bgPrompt ? String(raw.bgPrompt) : undefined,
    lines: Array.isArray(raw.lines) ? raw.lines.map(String) : [],
    options: Array.isArray(raw.options)
      ? raw.options.map((o: any) => ({
          text: String(o.text ?? "继续"),
          hint: o.hint ? String(o.hint) : undefined,
          effects: o.effects && typeof o.effects === "object" ? o.effects : undefined,
          next: String(o.next ?? "__end__"),
        }))
      : [{ text: "继续", next: "__end__" }],
    freeInput: raw.freeInput !== false,
  };
  // 顶层 effects 挂到场景上，供调用方应用
  (scene as any).__effects =
    raw.effects && typeof raw.effects === "object" ? raw.effects : {};
  return scene;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}
