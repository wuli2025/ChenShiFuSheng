// 《尘世浮生》剧情数据 —— 七年一节点的人生模拟。
// 纯数据驱动:场景图 + 选项 + 属性增减,日后可由 API 动态续写支线(catch 进 next)。
// 属性:才情 / 家境 / 风骨 / 心境,范围 0–100。

export interface Stats {
  才情: number;
  家境: number;
  风骨: number;
  心境: number;
}

export type StatKey = keyof Stats;

export interface Choice {
  text: string;
  hint?: string;
  effects?: Partial<Stats>;
  next: string; // 目标场景 id;"__end__" 走结局裁定
}

export interface Scene {
  id: string;
  age: string; // 大字:廿八
  ageNote: string; // 岁 · 第四个七年
  era: string; // 丙午年 · 谷雨
  scene: string; // — 一 · 城南旧寓 —
  lines: string[]; // 旁白逐句
  choices: Choice[];
}

export const INITIAL_STATS: Stats = { 才情: 50, 家境: 40, 风骨: 50, 心境: 55 };

export const START_SCENE = "age7";

export const SCENES: Record<string, Scene> = {
  age7: {
    id: "age7",
    age: "七",
    ageNote: "岁 · 第一个七年",
    era: "庚子年 · 立春",
    scene: "— 序 · 巷口人家 —",
    lines: [
      "你出生在城南一户寻常人家,父亲在码头扛货,母亲替人浆洗。",
      "七岁这年,先生在祠堂办了蒙学。束脩不轻,父亲蹲在门槛上抽了半宿旱烟。",
      "天没亮,他把你叫醒,问了一句:「这书,你想不想念?」",
    ],
    choices: [
      {
        text: "想念。哪怕白日去码头帮工,夜里也要识字",
        hint: "才情 +,家境 −,心境 −",
        effects: { 才情: 12, 家境: -6, 心境: -4 },
        next: "age14",
      },
      {
        text: "不念了。早些做工,替家里分担",
        hint: "家境 +,风骨 +,才情 −",
        effects: { 家境: 8, 风骨: 6, 才情: -8 },
        next: "age14",
      },
    ],
  },

  age14: {
    id: "age14",
    age: "十四",
    ageNote: "岁 · 第二个七年",
    era: "丁未年 · 霜降",
    scene: "— 二 · 风雨少年 —",
    lines: [
      "十四岁,你已长成半个大人。这年秋天,父亲在码头伤了腰,卧床不起。",
      "邻家少年招你入伙,说跟着漕帮跑一趟,够全家半年嚼用——只是那活,见不得光。",
    ],
    choices: [
      {
        text: "去。这世道,先让家人活下去",
        hint: "家境 +,风骨 −,心境 −",
        effects: { 家境: 16, 风骨: -12, 心境: -6 },
        next: "age21",
      },
      {
        text: "不去。再难,也不沾那条道",
        hint: "风骨 +,家境 −",
        effects: { 风骨: 14, 家境: -8, 心境: 4 },
        next: "age21",
      },
    ],
  },

  age21: {
    id: "age21",
    age: "廿一",
    ageNote: "岁 · 第三个七年",
    era: "甲寅年 · 清明",
    scene: "— 三 · 歧路 —",
    lines: [
      "二十一岁,你在城里站稳了脚跟。一个旧识来寻你,说府衙正招书办,识字便可。",
      "同一日,巷尾的姑娘托人带话,说她家要往南边去了,问你可愿同行,从此另起炉灶。",
      "前程与人,这一回似乎只能择其一。",
    ],
    choices: [
      {
        text: "留下,去府衙谋个出身",
        hint: "才情 +,家境 +,心境 −",
        effects: { 才情: 10, 家境: 12, 心境: -8 },
        next: "age28_office",
      },
      {
        text: "随她南下,从头来过",
        hint: "心境 +,家境 −",
        effects: { 心境: 16, 家境: -10, 风骨: 4 },
        next: "age28_south",
      },
    ],
  },

  // —— 分支 A:留城为吏 ——
  age28_office: {
    id: "age28_office",
    age: "廿八",
    ageNote: "岁 · 第四个七年",
    era: "丙午年 · 谷雨",
    scene: "— 四 · 漏雨之屋 —",
    lines: [
      "二十八岁,你在府衙做了三年书办。这年春汛,乡下老屋漏了雨,母亲来信。",
      "手里攒下白银十二两——寄回去补屋顶,还是留着替自己再谋一步,你在灯下坐了整夜。",
    ],
    choices: [
      {
        text: "银钱尽数寄回乡下",
        hint: "风骨 +,家境 −,心境 +",
        effects: { 风骨: 12, 家境: -10, 心境: 8 },
        next: "__end__",
      },
      {
        text: "留下,托人引荐,再往上走一步",
        hint: "家境 +,才情 +,风骨 −",
        effects: { 家境: 14, 才情: 8, 风骨: -10 },
        next: "__end__",
      },
      {
        text: "谁也不告诉,把钱埋进了墙根",
        hint: "心境 −(有些选择把自己也埋了)",
        effects: { 心境: -16, 家境: 6 },
        next: "__end__",
      },
    ],
  },

  // —— 分支 B:南下另起 ——
  age28_south: {
    id: "age28_south",
    age: "廿八",
    ageNote: "岁 · 第四个七年",
    era: "丙午年 · 小满",
    scene: "— 四 · 江南烟雨 —",
    lines: [
      "二十八岁,你随她在江南落了脚,开了间小小的书铺,日子清贫却安稳。",
      "这年,城里来了位旧时同窗,如今已是绸缎庄的东家。他要拉你入股,只是要押上书铺。",
    ],
    choices: [
      {
        text: "押上书铺,搏一回",
        hint: "家境 +,心境 −,风骨 −",
        effects: { 家境: 18, 心境: -10, 风骨: -6 },
        next: "__end__",
      },
      {
        text: "守着书铺,守着她,不动",
        hint: "心境 +,风骨 +,家境 −",
        effects: { 心境: 14, 风骨: 10, 家境: -4 },
        next: "__end__",
      },
    ],
  },
};

// —— 结局裁定:按四维加权,给一段定性的人生收束 ——
export interface Ending {
  title: string;
  verse: string;
}

export function judgeEnding(s: Stats): Ending {
  const sum = s.才情 + s.家境 + s.风骨 + s.心境;
  const top = (Object.keys(s) as StatKey[]).sort((a, b) => s[b] - s[a])[0];

  if (s.风骨 >= 72 && s.心境 >= 55) {
    return {
      title: "清士",
      verse: "一生未折腰,纵清贫,亦无愧于灯下读过的那些字。",
    };
  }
  if (s.家境 >= 70 && s.风骨 < 45) {
    return {
      title: "浮名",
      verse: "你得了想要的体面,只是夜深时,常想起墙根下埋过的那点东西。",
    };
  }
  if (s.心境 >= 70) {
    return {
      title: "安人",
      verse: "没成什么大器,可这一世活得不慌,已是许多人求不来的福分。",
    };
  }
  if (sum < 170) {
    return {
      title: "尘客",
      verse: "潮来潮去,你只是这尘世里再普通不过的一粒,来过,也就散了。",
    };
  }
  return {
    title: `${top}者`,
    verse: "七年又七年,路是自己一步步选的,回头看,也认了。",
  };
}
