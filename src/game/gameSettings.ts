// 设置存储：生图模型配置（localStorage）。文本模型走现有 provider 系统，不在此存。
// 项目自带 API（.env / 当前 provider）只读，绝不在此覆盖。

export interface ImagePreset {
  id: string;
  name: string;
  endpoint: string; // OpenAI images 兼容端点
  model: string;
}

// 预置生图模型示范（点选自动填端点，用户只补 Key）
export const IMAGE_PRESETS: ImagePreset[] = [
  {
    id: "stepfun",
    name: "阶跃星辰 StepFun",
    endpoint: "https://api.stepfun.com/v1/images/generations",
    model: "step-1x-medium",
  },
  {
    id: "seedream",
    name: "即梦 / Seedream",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3/images/generations",
    model: "doubao-seedream-3-0-t2i",
  },
  {
    id: "wanx",
    name: "通义万相",
    endpoint:
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
    model: "wanx-v1",
  },
  {
    id: "sd",
    name: "Stable Diffusion",
    endpoint: "https://api.siliconflow.cn/v1/images/generations",
    model: "stabilityai/stable-diffusion-3-5-large",
  },
  {
    id: "dalle",
    name: "DALL·E",
    endpoint: "https://api.openai.com/v1/images/generations",
    model: "dall-e-3",
  },
  {
    id: "custom",
    name: "＋ 自定义",
    endpoint: "",
    model: "",
  },
];

export interface ImageCfg {
  preset: string; // ImagePreset.id
  endpoint: string;
  apiKey: string;
  model: string;
  enabled: boolean;
}

const KEY = "polaris.game.image.v1";

// 默认接入阶跃星辰。默认 key 只从构建期环境变量注入(.env.local 里配
// VITE_STEPFUN_API_KEY)——绝不能把真实 key 硬编码进源码/仓库:前端产物里的
// key 任何人都能提取盗刷。没注入 key 时默认关闭,用户在设置里自己填。
const DEFAULT_KEY = String(
  (import.meta as any).env?.VITE_STEPFUN_API_KEY || ""
).trim();

const DEFAULT_CFG: ImageCfg = {
  preset: "stepfun",
  endpoint: "https://api.stepfun.com/v1/images/generations",
  apiKey: DEFAULT_KEY,
  model: "step-1x-medium",
  enabled: !!DEFAULT_KEY,
};

export function getImageCfg(): ImageCfg {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_CFG };
    return { ...DEFAULT_CFG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CFG };
  }
}

export function setImageCfg(cfg: ImageCfg) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}
