<script setup lang="ts">
// 生成页（对话框形式）：在对话框里描述想要的游戏 → 生成；可继续对话微调（累积需求重生成）。
// 上传资料、生成配图为输入框旁的次要功能。不依赖知识库。
import { nextTick, onMounted, ref } from "vue";
import { enterGame, platform } from "./platform";
import { generateGame, type CreateReq } from "./generator";
import { saveGame } from "./gamesStore";
import { describeImageError, genImagesFor, lastImageError } from "./imagegen";
import { getImageCfg } from "./gameSettings";
import {
  addUpload,
  listUploads,
  removeUpload,
  uploadsAsContext,
  type UploadItem,
} from "./uploadsStore";
import StoryTree from "./StoryTree.vue";
import type { GeneratedGame } from "./story-schema";
import { toast } from "../composables/useToast";
import { kb } from "../tauri";
import { useFileDrop } from "../composables/useFileDrop";

interface Msg {
  id: number;
  role: "user" | "ai";
  text?: string;
  game?: GeneratedGame;
  showTree?: boolean;
}

const EXAMPLES = [
  "做一个民国背景的悬疑故事，主角是个落魄书生，在生计与气节之间反复抉择。",
  "一个现代都市的人生模拟，从大学毕业开始，经历职场、爱情、中年危机。",
  "武侠题材，主角是江湖小人物，靠抉择一步步卷入门派纷争，多结局。",
  "末世求生，资源稀缺，每个选择都关乎人性与生存。",
];

const messages = ref<Msg[]>([]);
const input = ref("");
const busy = ref(false);
const progress = ref("");
const imgNote = ref(""); // 后台配图进度(不阻塞对话)
const withImages = ref(false);

const uploads = ref<UploadItem[]>(listUploads());
const ingesting = ref(false);
const scroller = ref<HTMLElement | null>(null);

let seq = 0;
const nid = () => ++seq;

function briefFromHistory(latest: string): string {
  const userTurns = messages.value
    .filter((m) => m.role === "user" && m.text)
    .map((m) => m.text as string);
  userTurns.push(latest);
  if (userTurns.length === 1) return userTurns[0];
  return (
    "玩家分多次提出了需求，请综合所有要求生成（后面的为补充/修改）：\n" +
    userTurns.map((t, i) => `${i + 1}. ${t}`).join("\n")
  );
}

async function scrollDown() {
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
}

async function send(text?: string) {
  const content = (text ?? input.value).trim();
  if (!content || busy.value) return;
  messages.value.push({ id: nid(), role: "user", text: content });
  input.value = "";
  busy.value = true;
  progress.value = "正在调用模型…";
  await scrollDown();
  try {
    const req: CreateReq = {
      genre: "",
      era: "",
      protagonist: "",
      tone: "",
      length: "",
      requirement: briefFromHistory(content),
      injected: uploadsAsContext(),
    };
    const game = await generateGame(req, (info) => {
      progress.value = info.note ? info.note : `生成中… 已接收 ${info.chars} 字`;
    });

    // 先落库再补图:配图最多可能要几分钟,不能让用户白等,
    // 更不能因为中途关页面把整个生成的游戏丢掉。
    if (!saveGame(game)) {
      toast.error("本地存储已满，游戏可能未保存成功（可删除旧游戏释放空间）");
    }
    messages.value.push({ id: nid(), role: "ai", game });
    toast.success(`已生成《${game.title}》`);

    if (withImages.value) {
      if (getImageCfg().enabled) {
        void genImagesInBackground(game);
      } else {
        toast.info("未在设置里配置生图模型，已跳过配图");
      }
    }
  } catch (e: any) {
    messages.value.push({
      id: nid(),
      role: "ai",
      text: `生成失败：${e?.message || e}。可以换个说法再试。`,
    });
    toast.error(`生成失败：${e?.message || e}`);
  } finally {
    busy.value = false;
    progress.value = "";
    await scrollDown();
  }
}

/** 后台批量出图:逐张完成即挂到场景并落库,进度实时可见,失败给出可排障的原因。 */
async function genImagesInBackground(game: GeneratedGame) {
  const prompts = Object.values(game.scenes)
    .filter((s) => s.bgPrompt)
    .map((s) => ({ id: s.id, prompt: s.bgPrompt as string }));
  if (!prompts.length) return;
  let done = 0;
  let okCount = 0;
  imgNote.value = `配图生成中 0/${prompts.length}…`;
  try {
    await genImagesFor(prompts, (id, ref) => {
      done++;
      imgNote.value = `配图生成中 ${done}/${prompts.length}…`;
      if (ref && game.scenes[id]) {
        game.scenes[id].bg = ref;
        okCount++;
        saveGame(game); // 逐张落库,中途退出也不丢已完成的图
      }
    });
  } finally {
    imgNote.value = "";
  }
  if (okCount >= prompts.length) {
    toast.success(`《${game.title}》配图完成（${okCount} 张）`);
  } else {
    const why = describeImageError(lastImageError());
    toast.info(
      `《${game.title}》配图完成 ${okCount}/${prompts.length}${why ? `：${why}` : ""}`
    );
  }
}

function onEnter(e: KeyboardEvent) {
  // Enter 发送，Shift+Enter 换行
  if (!e.shiftKey) {
    e.preventDefault();
    send();
  }
}

function play(game?: GeneratedGame) {
  if (game) enterGame(game.id);
}

// —— 上传（注入，不进知识库）——
const IMG_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
async function ingestPaths(paths: string[]) {
  if (!paths.length) return;
  ingesting.value = true;
  try {
    for (const p of paths) {
      const name = p.split(/[\\/]/).pop() || p;
      const ext = (name.split(".").pop() || "").toLowerCase();
      if (IMG_EXT.includes(ext)) {
        addUpload({ name, kind: "image", text: "" });
        continue;
      }
      try {
        const res = await kb.uploadFiles([p]);
        const r = res[0];
        if (r && r.ok) {
          let txt = "";
          try {
            txt = await kb.read(r.relPath);
          } catch {
            /* ignore */
          }
          addUpload({ name, kind: ext || "doc", text: txt });
          try {
            await kb.delete(r.relPath);
          } catch {
            /* ignore */
          }
        } else {
          addUpload({ name, kind: ext || "other", text: "" });
        }
      } catch (e: any) {
        toast.error(`「${name}」处理失败：${e?.message || e}`);
      }
    }
    uploads.value = listUploads();
    toast.success("已加入资料");
  } finally {
    ingesting.value = false;
  }
}
async function pickFiles() {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({
      multiple: true,
      filters: [
        {
          name: "资料",
          extensions: ["md", "txt", "docx", "pdf", "pptx", "html", "json", "csv", "png", "jpg", "jpeg", "gif", "webp"],
        },
      ],
    });
    if (!sel) return;
    await ingestPaths(Array.isArray(sel) ? sel : [sel]);
  } catch (e: any) {
    toast.error(e?.message || String(e));
  }
}
function delUpload(id: string) {
  removeUpload(id);
  uploads.value = listUploads();
}
const { isOver } = useFileDrop({
  active: () => platform.screen === "create" && !busy.value,
  onDrop: ingestPaths,
});

// 从「故事线模板 → 以此模板起草」跳进来时，预填提示骨架（不自动发送，交玩家补题材再改）。
onMounted(() => {
  if (platform.seedPrompt) {
    input.value = platform.seedPrompt;
    platform.seedPrompt = null;
  }
});
</script>

<template>
  <div class="create-root" :class="{ over: isOver }">
    <div class="title">生成一卷新的人生</div>

    <!-- 对话区 -->
    <div class="chat" ref="scroller">
      <div v-if="messages.length === 0" class="welcome">
        <p class="w-lead">想玩个什么样的故事？在下面的对话框里说给我听 —— 直接写就行，比如：</p>
        <div class="examples">
          <button v-for="(ex, i) in EXAMPLES" :key="i" class="ex" @click="send(ex)">
            {{ ex }}
          </button>
        </div>
        <p class="w-tip">生成后还能继续对话微调，比如「把主角换成女性」「再多两个结局」。</p>
      </div>

      <div v-for="m in messages" :key="m.id" class="msg" :class="m.role">
        <template v-if="m.role === 'user'">
          <div class="bubble user">{{ m.text }}</div>
        </template>
        <template v-else>
          <div class="bubble ai">
            <template v-if="m.game">
              <div class="game-card">
                <div class="gc-title">《{{ m.game.title }}》</div>
                <div class="gc-sub">{{ m.game.subtitle }}</div>
                <div class="gc-meta">{{ m.game.tag }} · {{ Object.keys(m.game.scenes).length }} 幕 · {{ m.game.endings.length }} 种结局</div>
                <div class="gc-actions">
                  <button class="gc-btn play" @click="play(m.game)">点开试玩 →</button>
                  <button class="gc-btn" @click="m.showTree = !m.showTree">
                    {{ m.showTree ? "收起结构" : "看剧情结构" }}
                  </button>
                </div>
                <div v-if="m.showTree" class="gc-tree">
                  <StoryTree :game="m.game" />
                </div>
              </div>
            </template>
            <template v-else>{{ m.text }}</template>
          </div>
        </template>
      </div>

      <div v-if="busy" class="msg ai">
        <div class="bubble ai busy">{{ progress || "生成中…" }}</div>
      </div>
      <div v-if="imgNote" class="msg ai">
        <div class="bubble ai busy">{{ imgNote }}</div>
      </div>
    </div>

    <!-- 已上传资料 -->
    <div class="up-list" v-if="uploads.length">
      <span class="up-item" v-for="u in uploads" :key="u.id">
        {{ u.name }}<i class="up-kind">{{ u.kind }}</i>
        <b class="up-del" @click="delUpload(u.id)">×</b>
      </span>
    </div>

    <!-- 对话框输入条 -->
    <div class="composer">
      <button class="attach" :disabled="ingesting" :title="'上传资料注入'" @click="pickFiles">
        {{ ingesting ? "…" : "＋" }}
      </button>
      <textarea
        v-model="input"
        class="input"
        :disabled="busy"
        rows="1"
        placeholder="描述你想要的游戏，回车生成（Shift+回车换行）…"
        @keydown.enter="onEnter"
      ></textarea>
      <label class="img-toggle" title="生成场景配图（需在设置配置生图模型）">
        <input type="checkbox" v-model="withImages" /> 配图
      </label>
      <button class="send" :disabled="busy || !input.trim()" @click="send()">
        {{ busy ? "生成中…" : "生成" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.create-root {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: radial-gradient(120% 80% at 50% -10%, #1a1d22, #0b0c0e 60%);
  color: #d8d2c4;
  padding: 44px 0 18px;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}
.create-root.over {
  box-shadow: inset 0 0 0 2px rgba(201, 139, 107, 0.6);
}
.title {
  text-align: center;
  font-family: "Songti SC", "SimSun", serif;
  font-size: 24px;
  letter-spacing: 0.3em;
  color: #ece3d0;
  margin-bottom: 18px;
}
.chat {
  flex: 1;
  overflow-y: auto;
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
  padding: 8px 24px;
}
.welcome { padding: 36px 8px; }
.w-lead { color: #cfc8ba; font-size: 15px; line-height: 1.9; }
.examples { display: flex; flex-direction: column; gap: 10px; margin: 18px 0; }
.ex {
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.025);
  color: #cfc8ba;
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.7;
  cursor: pointer;
  font-family: "Songti SC", "SimSun", serif;
  transition: 0.18s;
}
.ex:hover { border-color: #c98b6b; color: #f0e9da; background: rgba(201, 139, 107, 0.08); }
.w-tip { color: #6c727c; font-size: 12.5px; margin-top: 8px; }

.msg { display: flex; margin: 12px 0; }
.msg.user { justify-content: flex-end; }
.msg.ai { justify-content: flex-start; }
.bubble {
  max-width: 78%;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.8;
}
.bubble.user {
  background: rgba(44, 70, 97, 0.5);
  border: 1px solid rgba(138, 162, 184, 0.3);
  color: #eaf0f5;
  border-bottom-right-radius: 4px;
}
.bubble.ai {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #d8d2c4;
  border-bottom-left-radius: 4px;
}
.bubble.busy { color: #c98b6b; }

.game-card { min-width: 320px; }
.gc-title { font-family: "Songti SC", serif; font-size: 20px; color: #f0e9da; letter-spacing: 0.08em; }
.gc-sub { margin-top: 6px; font-size: 13px; color: #b6b0a3; line-height: 1.6; }
.gc-meta { margin-top: 8px; font-size: 12px; color: #8a8f98; }
.gc-actions { margin-top: 14px; display: flex; gap: 10px; }
.gc-btn {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: transparent;
  color: #cfc8ba;
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
}
.gc-btn.play { border-color: #b5654a; background: rgba(201, 139, 107, 0.16); color: #f0e9da; }
.gc-tree { margin-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 14px; }

.up-list {
  max-width: 860px;
  margin: 0 auto;
  width: 100%;
  padding: 6px 24px 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.up-item {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px; padding: 4px 9px; font-size: 12px; color: #d8d2c4;
}
.up-kind { font-style: normal; font-size: 10px; color: #6c727c; }
.up-del { cursor: pointer; color: #8a8f98; padding: 0 2px; }
.up-del:hover { color: #cf8466; }

.composer {
  max-width: 860px;
  margin: 10px auto 0;
  width: calc(100% - 0px);
  padding: 0 24px;
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.attach {
  flex: none;
  width: 40px; height: 40px;
  border: 1px dashed rgba(201, 139, 107, 0.5);
  background: rgba(201, 139, 107, 0.08);
  color: #e0c4b3;
  border-radius: 10px;
  font-size: 20px;
  cursor: pointer;
}
.attach:disabled { opacity: 0.5; cursor: default; }
.input {
  flex: 1;
  resize: none;
  max-height: 160px;
  min-height: 40px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 10px 14px;
  color: #e4ddce;
  font-size: 15px;
  line-height: 1.6;
  font-family: "Songti SC", "SimSun", serif;
}
.input:focus { outline: none; border-color: #c98b6b; }
.img-toggle {
  flex: none;
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; color: #9aa1ab; cursor: pointer;
  padding-bottom: 10px;
}
.send {
  flex: none;
  border: 1px solid #b5654a;
  background: rgba(201, 139, 107, 0.2);
  color: #f0e9da;
  border-radius: 10px;
  padding: 0 24px;
  height: 40px;
  cursor: pointer;
  font-size: 15px;
  letter-spacing: 0.06em;
}
.send:disabled { opacity: 0.55; cursor: default; }
</style>
