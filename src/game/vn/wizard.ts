/* =====================================================================
 * vn/wizard.ts · 对话式创建向导 —— 一步步问清楚,拼出高质量创作简报
 * 步骤全部结构化(选项+自由输入),不烧 AI;只有「联网调研」一步走 claude CLI。
 * 产物 = brief(创作简报文本) → 交给 pipeline.writeScript 当 intent。
 * ===================================================================== */
import { invoke } from "../../tauri";

export interface WizardStep {
  key: string;
  ask: string;                 // 向导气泡文案(像人说话)
  options?: string[];          // 快捷选项(仍可自由输入)
  placeholder?: string;
  optional?: boolean;
  multi?: boolean;             // 可多选(逗号拼接)
}

export const WIZARD_STEPS: WizardStep[] = [
  {
    key: "story",
    ask: "先聊故事本身——你想讲一个什么样的故事?一两句话就好,主角是谁、发生什么、你最想让玩家感受到什么。",
    placeholder: "例:旧物修复师能听见旧物的记忆,一位纪录片编导闯进他的店…",
  },
  {
    key: "genre",
    ask: "它是什么类型、什么味道的?",
    options: ["治愈日常", "热血创业", "悬疑推理", "科幻近未来", "古风江湖", "青春校园", "都市情感", "历史改编"],
  },
  {
    key: "scale",
    ask: "篇幅打算做多大?我建议第一部用「标准」,看效果再加。",
    options: ["短篇 · 3幕/12-18场景/约10分钟", "标准 · 4幕/18-26场景/约15分钟", "长篇 · 5幕/26-35场景/约25分钟"],
  },
  {
    key: "branches",
    ask: "分支和结局怎么铺?抉择节点越多,重玩价值越高,但生图也越多。",
    options: ["轻分支 · 3处抉择/4结局", "标准 · 4-5处抉择/5-6结局", "重分支 · 6+处抉择/8结局"],
  },
  {
    key: "chars",
    ask: "角色阵容怎么配?(会为每个角色的每个姿势生成一张透明底立绘)",
    options: ["双主角(男女各一)", "主角+2配角", "三主角群像", "单主角+旁白"],
  },
  {
    key: "style",
    ask: "画风走哪路?场景图和立绘都会跟着这个基调。",
    options: ["水墨×赛璐璐(默认招牌)", "电影感写实,情绪化布光", "怀旧暖黄,旧时光质感", "冷冽科幻,霓虹夜色", "淡彩绘本,温柔治愈"],
  },
  {
    key: "voice",
    ask: "配音和声音怎么定?(引擎自带环境音/BGM,这里定人声)",
    options: ["系统中文语音(即开即用,Edge最佳)", "先不配音,只留字幕", "预留云端TTS(后续接火山/阶跃)"],
  },
  {
    key: "stats",
    ask: "要不要数值系统?灵动叙事默认纯演出(无数值);想要人生模拟那种六维成长,建议去「创作工坊」用经典模式。",
    options: ["纯演出,不要数值(推荐)", "轻数值:好感度/信任度影响结局走向(写进剧情判定,不上HUD)"],
  },
  {
    key: "research",
    ask: "要不要我先联网调研真实事件/作品做改编底料?(会多花2-3分钟,产出一份参考简报融进剧本)",
    options: ["不用,直接原创", "要,帮我搜真实范例来改编"],
    optional: true,
  },
  {
    key: "extra",
    ask: "最后,还有什么一定要有的桥段、台词、意象或禁忌?(没有就跳过)",
    placeholder: "例:一定要有雨夜天台戏;结尾要留白;不要死人",
    optional: true,
  },
];

/** 一份「什么都说清楚了」的范例提示词,给用户参考/一键填入 */
export const EXAMPLE_BRIEF = `讲一个旧物修复师的故事:他能听见旧物里住着的记忆,一位纪录片编导闯进他的店,两人沿着一只怀表、一台缝纫机、一幅无名画,把陌生人的一生一件件修回来——我想让玩家感受到「平凡人生也值得被认真记住」。
类型:治愈日常,带一点淡淡的悬念。
篇幅:4幕,18-26个场景,单周目约15分钟。
分支:4处抉择分布在各幕,5个结局(传奇1/隐藏1/悲喜2/普通1)。
角色:双主角(男修复师·内敛低音,女编导·明亮女声)+1位老店主配角。
画风:怀旧暖黄旧时光质感,雨巷青砖与旧木纹理。
配音:系统中文语音。数值:纯演出。
必须有:雨夜初遇;每件旧物一段闪回(闪白镜头);结尾留白不点破。`;

export interface WizardAnswers {
  [key: string]: string;
}

/** 把回答拼成创作简报(交给写稿管线的 intent) */
export function buildBrief(a: WizardAnswers, research?: string): string {
  const lines: string[] = [];
  if (a.story) lines.push(a.story.trim());
  if (a.genre) lines.push(`类型:${a.genre}。`);
  if (a.scale) lines.push(`篇幅:${a.scale}。`);
  if (a.branches) lines.push(`分支:${a.branches},抉择要分布在不同幕。`);
  if (a.chars) lines.push(`角色阵容:${a.chars}。`);
  if (a.style) lines.push(`画风:${a.style}。`);
  if (a.voice) lines.push(`配音方案:${a.voice}。`);
  if (a.stats) lines.push(`数值:${a.stats}。`);
  if (a.extra) lines.push(`硬性要求:${a.extra}。`);
  if (research) lines.push(`\n【联网调研参考(改编底料,取其神不抄其形)】\n${research}`);
  return lines.join("\n");
}

/** 幕数从 scale 选项里解析 */
export function actsOf(a: WizardAnswers): number {
  const m = /(\d)幕/.exec(a.scale || "");
  return m ? parseInt(m[1], 10) : 4;
}

/** 联网调研:claude CLI 开 WebSearch,产出改编参考简报 */
export async function runResearch(story: string, genre: string, onProgress: (m: string) => void): Promise<string> {
  onProgress("联网调研中(claude + WebSearch,约2-3分钟)…");
  const prompt = `请用网络搜索,为下面这个视觉小说选题找 2~3 个可改编的真实事件/人物/作品原型:
选题:${story}
类型:${genre || "不限"}
要求:每个原型给出——一段事实梗概(150字内)、最动人的1-2个真实细节、可以怎么化用进剧情(50字内)。
不要链接不要来源列表,直接输出可以贴进创作简报的中文文本,总长600字以内。`;
  const out = await invoke<string>("vn_run_claude", { prompt, timeoutMs: 300000, tools: "WebSearch,WebFetch" });
  onProgress("✓ 调研完成");
  return out.trim();
}
