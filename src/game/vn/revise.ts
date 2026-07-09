/* =====================================================================
 * vn/revise.ts · 节点对话改稿 —— 图谱点场景 → 像聊天一样提意见 → AI 回完整新块 → 落回 script.md
 * 移植自画布引擎 server.js 的 chatRevise/replaceNodes,改走 vn_run_claude。
 * ===================================================================== */
import { invoke } from "../../tauri";
import { VN_SPEC } from "./spec";

export interface ChatMsg { role: "user" | "assistant"; content: string; blocks?: string[] }

function escRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function nodeBlockOf(script: string, nodeId: string): { block: string; index: number } | null {
  const re = new RegExp("(^|\\n)(### " + escRe(nodeId) + " [\\s\\S]*?)(?=\\n### |\\n## |$)");
  const m = re.exec(script);
  return m ? { block: m[2].trim(), index: (m.index ?? 0) + m[1].length } : null;
}
function neighborsOf(script: string, nodeId: string) {
  const ids: string[] = []; const re = /^### (\S+) /gm; let m: RegExpExecArray | null;
  while ((m = re.exec(script))) ids.push(m[1]);
  const ix = ids.indexOf(nodeId);
  return { prev: ix > 0 ? ids[ix - 1] : null, next: ix > -1 && ix < ids.length - 1 ? ids[ix + 1] : null };
}
function extractJson(text: string): any {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI 回复中没有 JSON");
  return JSON.parse(m[0]);
}

/** 对某个场景节点提修改意见;返回 AI 回应 + 建议的新块(还没写盘) */
export async function chatRevise(
  script: string, nodeId: string, message: string, history: ChatMsg[]
): Promise<{ reply: string; blocks: { id: string; block: string }[] }> {
  const cur = nodeBlockOf(script, nodeId);
  if (!cur) throw new Error("节点不存在于 script.md: " + nodeId);
  const nb = neighborsOf(script, nodeId);
  const ctx: string[] = [];
  if (nb.prev) { const b = nodeBlockOf(script, nb.prev); if (b) ctx.push("【上一节点(只读参考)】\n" + b.block); }
  if (nb.next) { const b = nodeBlockOf(script, nb.next); if (b) ctx.push("【下一节点(只读参考)】\n" + b.block); }
  const prompt = VN_SPEC
    + "\n\n【任务】你是这部灵动剧本的驻场编剧。用户对下列场景提出修改意见,你要:\n"
    + "1) 用一两句话回应(说人话,别复述规则);\n"
    + "2) 如果需要改稿,给出每个被改场景的完整新版块(### 开头,格式合规,id 不变;跳转目标只能指向已存在的场景 id);不需要改就不给。\n"
    + "3) 仅当用户明确要求「续写/新增支线/加结局」时才新增场景:新 id 必须全新(结局 E_ 前缀),每个新场景给完整块,且同时给出改后的当前场景块把跳转接上,新支线最终要汇回已有场景或落在新结局上。\n"
    + '只输出一个 JSON:{"reply":"回应","blocks":[{"id":"场景id","block":"### 场景id …完整新块"}]}(blocks 可为空数组)。\n\n'
    + "【对话历史】\n" + history.slice(-8).map(h => `${h.role}: ${String(h.content).slice(0, 500)}`).join("\n")
    + "\n\n" + ctx.join("\n\n")
    + "\n\n【待修改场景(当前版本)】\n" + cur.block
    + "\n\n【用户意见】" + message;
  const out = await invoke<string>("vn_run_claude", { prompt, timeoutMs: 300000 });
  const j = extractJson(out);
  return { reply: j.reply || "", blocks: j.blocks || [] };
}

/** 把 AI 给的新块落进剧本文本;未知 id 的新块插到锚点之后。返回新剧本全文(不写盘)。 */
export function applyBlocks(script: string, blocks: { id: string; block: string }[], anchor?: string): string {
  const inserts: { id: string; block: string }[] = [];
  for (const nb of blocks) {
    const cur = nodeBlockOf(script, nb.id);
    if (cur) script = script.slice(0, cur.index) + nb.block.trim() + script.slice(cur.index + cur.block.length);
    else inserts.push(nb);
  }
  if (inserts.length) {
    const anchorId = anchor || blocks.find(b => nodeBlockOf(script, b.id))?.id;
    const cur = anchorId ? nodeBlockOf(script, anchorId) : null;
    const chunk = "\n\n" + inserts.map(b => b.block.trim()).join("\n\n");
    if (cur) script = script.slice(0, cur.index + cur.block.length) + chunk + script.slice(cur.index + cur.block.length);
    else script = script.trimEnd() + chunk + "\n";
  }
  return script;
}
