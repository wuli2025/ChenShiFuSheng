// 生图：按设置里配置的 OpenAI-images 兼容端点真实出图。
// 未配置 / 未启用 / 任何异常 → 返回 null，调用方回退到 CSS 渐变占位（保证零依赖也能跑出游戏）。
import { getImageCfg } from "./gameSettings";

/**
 * 调生图模型生成一张图，返回可直接用于 background 的 URL 或 dataURL；失败返回 null。
 * 走 OpenAI images 通用约定：POST {model, prompt, n, size}，
 * 响应 data[0].url 或 data[0].b64_json。
 */
export async function genImage(prompt: string): Promise<string | null> {
  const cfg = getImageCfg();
  if (!cfg.enabled || !cfg.endpoint || !cfg.apiKey) return null;
  try {
    const resp = await fetch(cfg.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model || undefined,
        prompt,
        n: 1,
        size: "1024x1024",
      }),
    });
    if (!resp.ok) return null;
    const json: any = await resp.json();
    const item = json?.data?.[0];
    if (!item) return null;
    if (item.url) return item.url as string;
    if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
    return null;
  } catch {
    return null;
  }
}

/** 批量为场景出图，逐个尝试；失败的保持 null（用 bgCss）。带并发上限避免限流。 */
export async function genImagesFor(
  prompts: { id: string; prompt: string }[],
  onOne?: (id: string, url: string | null) => void
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const p of prompts) {
    const url = await genImage(p.prompt);
    out[p.id] = url;
    onOne?.(p.id, url);
  }
  return out;
}
