// 故事线模板库 —— 从《爆款文案样本库(拉片)》里挑出最贴合本引擎「场景图 + 加权抉择 +
// caps/tags 复盘」结构的几套交互手法，落成可直接套用的模板；每套都标明落到我们
// story-schema / engine 里的哪个字段，以及配套哪一层「评判机制」(对照 UniPrism)。
//
// 原则:这里存的是「手法(交互结构)」,不是「文案(词句)」。产品文案必须原创,
// 套用示例仅为演示草样。—— 抄招不抄词。

/** 评判机制的一层（对照 UniPrism 五层，映射到本引擎已实现的字段）。 */
export interface EvalLayer {
  id: string;
  no: string; // ①..⑤
  title: string;
  desc: string;
  field: string; // 落到我们 engine/assess 的哪个字段/函数
  status: "done" | "partial"; // 引擎是否已支持
}

/** UniPrism「评判」五层 —— 从「记录行为」到「给出方向建议」的链路，全部已在引擎落地。 */
export const EVAL_LAYERS: EvalLayer[] = [
  {
    id: "verdict",
    no: "①",
    title: "结果裁定 · 多结局阈值",
    desc: "不是简单成败，按属性向量加权求值，落到不同分数带的结局；极端值也能触发失败局。",
    field: "engine.judge / WeightedEnding.weight（表达式）",
    status: "done",
  },
  {
    id: "checkpoint",
    no: "②",
    title: "Checkpoint 多维评分",
    desc: "关键关卡按当前属性公开打一次 rubric 分，维度对玩家透明，让人看见「这次因哪项被扣分」。仅职业/专业体验向用。",
    field: "Scene.scorecard → assess.scoreCard()",
    status: "done",
  },
  {
    id: "profile",
    no: "③",
    title: "过程性能力评估（核心）",
    desc: "不看最终数值，看行为证据：每步选项挂 tags/caps，结算时反推能力雷达 —— 你是个什么样的决策者。",
    field: "Choice.tags + Choice.caps → assess.buildProfile()",
    status: "done",
  },
  {
    id: "diagnose",
    no: "④",
    title: "诊断式 NPC 质疑",
    desc: "导师/对手不只打分，按你最弱的一维提一句针对性质疑。规则定「问什么」，文案定「怎么说得像人话」。",
    field: "GameDef.diagnoseByCap（按最弱 cap 取一句）",
    status: "done",
  },
  {
    id: "report",
    no: "⑤",
    title: "复盘报告 → 方向推荐",
    desc: "结束不止一段结局文案：能力画像 + 命运岔口 + 一句锐评，职业向再加「你适合什么、下一步该补什么」。",
    field: "assess.Profile.review + GameDef.recommend()",
    status: "done",
  },
];

export type LineKind = "narrative" | "career" | "both";

export interface TemplateField {
  slot: string; // 落到我们 schema 的哪个字段
  desc: string; // 该字段在本模板里承载什么
}

export interface StorylineTemplate {
  id: string;
  name: string; // 模板名
  origin: string; // 原型出处
  line: LineKind; // 叙事向 / 职业向 / 通用
  hook: string; // 一句话精髓
  structure: TemplateField[]; // 交互结构 → 我们 schema 字段
  sample: { label: string; text: string }[]; // 可套用示例（原创草样，非定稿）
  evalLayer: string; // 配套评判层 id（对应 EVAL_LAYERS）；"" = 不直接产出评判
  evalNote: string; // 如何挂到评判
  pros: string[];
  cons: string[];
  seed: string; // 「以此模板起草」时喂给生成器的提示骨架
}

export const TEMPLATES: StorylineTemplate[] = [
  {
    id: "official-hook",
    name: "公文体开场钩子",
    origin: "Papers, Please《请出示文件》· 余罪 / 法医秦明「一句话自报家门」",
    line: "both",
    hook: "用一封录用/排班/分配函，3 秒把玩家塞进职业身份 —— 开场不寒暄，先给「你是谁、在哪上班、上头喊什么」，再埋一个反常细节钩。",
    structure: [
      { slot: "startScene.lines[]", desc: "第一句用公文体（通知/分配函/病历抬头），第二句主角自报家门「我是谁+干哪行+什么状态」。" },
      { slot: "Scene.age / ageNote / era", desc: "把身份坐标塞进大字小字：年份、职级、地点、时代批注。" },
      { slot: "Scene.footnote", desc: "开场埋一个反常细节钩（尸袋里是熟人 / 名单上是自家地址），种下「怎么回事」。" },
      { slot: "GameDef.initialCaps", desc: "顺手给能力雷达定基线，后续行为在此之上增减。" },
    ],
    sample: [
      { label: "排班通知（公文体）", text: "【市一院急诊科 · 夜班】住院医 · 你 · 18:00–次日 08:00。带教：林越 主治。备注：今夜雷暴，救护车比平时多。" },
      { label: "自报家门（状态）", text: "我叫江野，规培第二年，轮到急诊的第 9 天。我以为自己见过血——直到今晚。" },
      { label: "反常细节钩（footnote）", text: "分诊台跳出今晚第一个名字时，我愣了一下：那个地址，是我家楼下。" },
    ],
    evalLayer: "profile",
    evalNote: "开场本身不产出评判，但它给能力雷达（③）立初始基线，也定下后续 tags 累加的坐标系。",
    pros: [
      "极快建立代入：一屏之内玩家就知道自己是谁、在哪、要做什么。",
      "零美术成本：纯文字公文体即可承载身份与世界观。",
      "反常细节钩天然制造第一悬念，接得住任何题材。",
    ],
    cons: [
      "公文体若太长会劝退，务必短句、条目化。",
      "只是开场，不承担评判，需要后续抉择模板接力才完整。",
    ],
    seed:
      "请用「公文体开场钩子」模板开局：startScene 第一句用一封职业相关的公文（录用函/排班表/病历抬头），第二句让主角一句话自报家门（我是谁+干哪行+现在什么状态），并在 footnote 埋一个反常细节钩。给主角一组初始能力维度(caps)作为基线。题材：",
  },
  {
    id: "polyphony",
    name: "复调内心声音",
    origin: "Disco Elysium 人格化「内心声音」",
    line: "both",
    hook: "同一个抉择点，让几把脑内声音对吼 —— 玩家「选择听谁」= 选择职业人格，通关自动生成「选择画像」。",
    structure: [
      { slot: "Scene.lines[]", desc: "抉择前用 2–3 句代表不同声音的独白（〔同理心〕〔规则〕〔自保〕），立场相反。" },
      { slot: "Choice[]", desc: "每个选项 = 听从其中一把声音；无明显对错。" },
      { slot: "Choice.tags[]", desc: "给选项挂行为证据标签，如 tags:['同理心','冒险']，结算时统计频次。" },
      { slot: "Choice.caps{}", desc: "对应能力维度增减，如 caps:{ 用户洞察:+6, 抗压:+3 }，驱动复盘雷达。" },
    ],
    sample: [
      { label: "内心复调（lines）", text: "〔同理心〕孩子还那么小，先救孩子。　〔规则〕分诊等级摆在那，老人是 I 级。　〔自保〕选错，明天被投诉的是你。" },
      { label: "选项 A（tags/caps）", text: "先收孩子（凭直觉）　tags:['共情','冒险']　caps:{ 用户洞察:+6, 抗压:+2 }" },
      { label: "选项 B（tags/caps）", text: "按分诊等级先收老人　tags:['守则','稳健']　caps:{ 商业判断:+5, 沟通表达:+2 }" },
    ],
    evalLayer: "profile",
    evalNote: "这是过程性能力评估（③）最直接的落地：tags 频次 + caps 累加 → buildProfile() 雷达 + 一句锐评（「你更像一个会为病人破例的医生」）。",
    pros: [
      "把抽象的职业心态演成可玩抉择，代入感强。",
      "tags/caps 天然喂给复盘画像，评判「有据可依」。",
      "同一节点因听谁不同而分流，重玩动机拉满。",
    ],
    cons: [
      "声音超过 3 把会稀释，玩家记不住谁是谁。",
      "每个选项都要精心配 tag/caps，作者工作量大。",
      "用多了显「腔调」，需控制在关键抉择点。",
    ],
    seed:
      "请用「复调内心声音」模板设计关键抉择：抉择前用 2–3 句代表不同人格的脑内独白（如同理心/规则/自保），立场相反；每个选项对应听从其中一把声音，无明显对错，并给每个选项挂 tags（行为标签）与 caps（能力维度增减），以便结算时反推能力画像。题材：",
  },
  {
    id: "no-right-answer",
    name: "无正解两难 + 延迟代价",
    origin: "Reigns《王权》· The Walking Dead「会记住」· This War of Mine 留白",
    line: "both",
    hook: "短问、快答、硬后果 —— 选项只有「得罪谁」，没有明显对的；代价不当场结算，延迟到下一幕才回收，制造长尾愧疚。",
    structure: [
      { slot: "Choice.effects{}", desc: "每个选项都同时有得有失，没有全赢项。" },
      { slot: "Scene.event / footnote", desc: "在后续场景里用被动事件或一行批注回收代价（「林医生记住了这一点」）。" },
      { slot: "WeightedEnding.weight", desc: "把这些抉择的累积效应交给加权结局裁定，形成不同终局。" },
    ],
    sample: [
      { label: "两难选项（effects）", text: "A. 带 bug 准时上线（进度+，质量−，团队信任−）　B. 延期保质量（质量+，进度−，老板脸色−）" },
      { label: "延迟代价（下一幕 footnote）", text: "三天后线上炸了。你想起那晚的选择——没人说什么，但每个人都记得。" },
      { label: "留白写罪责", text: "克制事实 + 一个具体人名，情绪交给玩家：「回滚那晚，是小林顶的锅。」" },
    ],
    evalLayer: "verdict",
    evalNote: "累积效应喂给加权结局（①）；结局页再用命运岔口（fateFork）показывает「你距另一种人生仅差 X 分」，让延迟代价可视化。",
    pros: [
      "持续道德张力，「没有最优解」正是职业真实。",
      "延迟代价让每个选择有重量，避免即时反馈的廉价感。",
      "累积效应完美契合加权裁定 + 命运岔口。",
    ],
    cons: [
      "无正解若处理不好，玩家会觉得「怎么选都被惩罚」。",
      "延迟代价需要提前埋线，否则玩家回收时无感。",
    ],
    seed:
      "请用「无正解两难 + 延迟代价」模板设计冲突：每个选项都同时有得有失、没有明显正确项；代价不当场结算，延迟到后续场景用被动事件或 footnote 回收（点名式反馈）。抉择的累积效应交给加权结局裁定。题材：",
  },
  {
    id: "too-much",
    name: "过犹不及 · 极端即坏局",
    origin: "Reigns 四资源条「军队喂太饱不会保护你，而会取代你」",
    line: "both",
    hook: "属性拉满也是坏结局 —— 太卷=过劳猝死，太佛=被边缘化。打破「堆满某一条即通关」的最优解思维。",
    structure: [
      { slot: "WeightedEnding.weight", desc: "坏结局的权重表达式奖励极端值，如「过劳」结局 weight 用 抗压*0 + 内卷度 让高压玩家落入。" },
      { slot: "GameDef.endings[]", desc: "为每条主属性各配一个「过头」坏局与一个「不足」坏局，中庸区才出好局。" },
    ],
    sample: [
      { label: "过劳坏局（weight）", text: "《凌晨四点没能醒来》　weight: \"内卷 - 健康*2\"（越卷越低健康越易命中）" },
      { label: "边缘坏局（weight）", text: "《会议室里没有你的名字》　weight: \"佛系 - 存在感\"（太佛则被命中）" },
      { label: "好局（中庸区）", text: "《在能扛与想活之间》　weight: \"成就 + 健康 - abs(内卷-50)\"（离极端越远越高）" },
    ],
    evalLayer: "verdict",
    evalNote: "纯落在结局裁定层（①）：用权重表达式惩罚极端。呼应 UniPrism「不奖励选对答案，而让学生看见后果」。",
    pros: [
      "杜绝「无脑堆一条属性通关」，逼玩家权衡。",
      "两端坏局都能写成有回味的意象结局，失败也值得截图。",
    ],
    cons: [
      "阈值要反复调参，容易一半玩家全落坏局。",
      "玩家「满级还失败」会困惑，需靠结局文案把道理讲明白。",
    ],
    seed:
      "请用「过犹不及」模板设计结局：为每条主属性各配一个「过头」坏局和一个「不足」坏局，只有中庸区才落到好局；坏局的权重表达式奖励极端值（如太卷=过劳、太佛=被边缘化）。题材：",
  },
  {
    id: "dossier",
    name: "熟悉格式承载知识 · 档案体祛魅",
    origin: "《明朝那些事儿》档案体开篇 · 《大江东去》用动作演时代",
    line: "career",
    hook: "用玩家熟悉的现成格式（简历/病历/案卷/系统面板）承载陌生专业知识，反差即趣味；顺手夹带一个「祛魅点」戳破职业幻想。",
    structure: [
      { slot: "Scene（纯叙事幕）.lines[]", desc: "用档案体/面板体铺陈专业信息，短句、条目化，穿插作者吐槽当旁白。" },
      { slot: "Scene.footnote", desc: "落一个知识点（K 编号）或祛魅事实：「一个夜班真正抢救的时间不到 10%」。" },
      { slot: "Scene.scorecard（可选）", desc: "职业向可在此幕后接一次公开评分，把知识点变成可被考核的维度。" },
    ],
    sample: [
      { label: "档案体祛魅卡（lines）", text: "【急诊真相 · 03】你以为急诊医生整夜在抢救？错。一个夜班里，真正抢救不到 10%，其余都在：写病历、安抚家属、等结果、跟不排队的人解释什么叫「分诊」。" },
      { label: "动作演真实（大江东去式）", text: "凌晨四点，我趴在护士站写第 17 份病历，笔尖停在「主诉」两个字上。走廊尽头有人骂「等这么久还算什么医院」，我没抬头。" },
      { label: "知识点（footnote）", text: "K7：急诊分诊四级标准 —— 决定谁先被看见的，不是谁先来，是谁更可能死。" },
    ],
    evalLayer: "checkpoint",
    evalNote: "职业向可把知识点接入 checkpoint 评分（②），公开维度让玩家看见自己「专业认知」这一项的高低；叙事向则只做旁白，不打分以免破坏沉浸。",
    pros: [
      "零门槛传递专业知识，反差自带幽默。",
      "「祛魅」是职业体验产品的验收红线，本模板专治。",
      "格式复用性极高，任何行业都能套（案卷/工单/病历/代码 diff）。",
    ],
    cons: [
      "纯叙事幕多了会拖节奏，只宜适度穿插。",
      "档案体过度会像说明书，需靠吐槽旁白保持趣味。",
    ],
    seed:
      "请用「档案体祛魅」模板设计一个纯叙事幕：用玩家熟悉的现成格式（简历/病历/案卷/系统面板）承载该职业的一个陌生专业知识点，短句条目化并穿插吐槽旁白；footnote 落一个「祛魅事实」戳破对这行的常见幻想。若为职业体验向，可在该幕后接一次公开评分卡。题材：",
  },
  {
    id: "imagery-ending",
    name: "意象结局 + 可截图总评卡",
    origin: "主播女孩 overdose · 人生重开模拟器 · 隐形守护者 BE 箴言",
    line: "both",
    hook: "坏结局不写「你失败了」，写成一个意象标题；结局后出一张数值化总评卡 + 一句锐评，让「失败也值得截图」、把「看结局」升级成「看见自己」。",
    structure: [
      { slot: "Ending.title / WeightedEnding.verse", desc: "结局标题用意象（《凌晨四点的白大褂》），verse 写成有回味的箴言。" },
      { slot: "assess.buildProfile()", desc: "结局后渲染能力雷达 + 一句点评（你强在抗压，弱在用户洞察）。" },
      { slot: "GameDef.recommend()", desc: "职业向再给一句方向推荐：你适合这行，但得先学会不把每个病人的命都扛肩上。" },
    ],
    sample: [
      { label: "意象结局（title/verse）", text: "《凌晨四点的白大褂》——你扛住了这一夜，也扛住了想辞职的第 100 个念头。天亮了，你没赢，只是没输。" },
      { label: "选择画像（review）", text: "这一局你 6 次听从〔同理心〕、2 次听从〔规则〕——你更像一个会为病人破例的医生。" },
      { label: "方向推荐（recommend）", text: "你适合这行，但你得先学会：不把每个病人的命都扛在自己肩上。" },
    ],
    evalLayer: "report",
    evalNote: "这是复盘报告层（⑤）的呈现出口：把③的画像、①的命运岔口、④的质疑收束成一张可截图的总评卡 + 方向推荐，正是「专业/职业体验」产品的核心产出物。",
    pros: [
      "「失败也值得截图」= 天然传播裂变。",
      "把游戏从「看结局」升级成「看见自己」，留存与口碑双升。",
      "方向推荐是教育/职业产品真正的产出物，撑得起付费。",
    ],
    cons: [
      "意象标题写不好会矫情，需克制。",
      "总评卡若与过程数据脱节，会显得像硬贴标签 —— 必须由 tags/caps 真实累加而来。",
    ],
    seed:
      "请用「意象结局 + 可截图总评卡」模板收尾：每个结局标题用意象而非「你失败了」，verse 写成有回味的箴言；结局后基于全程累加的 caps 给出能力画像 + 一句锐评，职业向再加一句方向推荐（你适合什么、下一步该补什么）。题材：",
  },
];

/** 按线类型过滤（叙事向 / 职业向 / 全部）。 */
export function filterTemplates(line: LineKind | "all"): StorylineTemplate[] {
  if (line === "all") return TEMPLATES;
  return TEMPLATES.filter((t) => t.line === line || t.line === "both");
}

/** 取某模板配套的评判层定义。 */
export function evalLayerOf(t: StorylineTemplate): EvalLayer | null {
  return EVAL_LAYERS.find((l) => l.id === t.evalLayer) || null;
}
