// 简→繁流程的确定性实现。由 workspace_run 中的程序导入使用。
// 依赖：opencc-js（通过 @lg/npm 安装到共享 npm 工程后裸导入）
//
// 四个阶段各自独立，按 SKILL.md 的顺序调用。

const mod = await import("opencc-js");
const OC = mod.default || mod;

/** 保真档：简 → 繁体（词组级，语境感知） */
const s2tw = OC.Converter({ from: "cn", to: "tw" });
/** 在地化档：简 → 繁体（台湾用词） */
const s2twp = OC.Converter({ from: "cn", to: "twp" });
/** 反查用：繁 → 简 */
const t2s = OC.Converter({ from: "tw", to: "cn" });

// ---- 内置修正表 ----
// 基于三套官方繁简语料多重校准的 OpenCC 盲点：
// 1. 魔審官方繁简语料（34,368 条，现代科幻/法律推理）
// 2. 活侠传官方繁简语料（92,003 条，武侠/古风/古典文学）
// 3. 交响乐之雨官方繁简语料（51,074 条，恋爱纯爱/音乐校园/日本AVG汉化）
// 8. 苍之彼方的四重奏官方繁简语料（50,085 条，恋爱青春/热血空竞AVG官方同源底稿）
// 规则准则：跨语料一致、命中 >= 5、上下文稳定且符合教育部辞典规范。
// src = 简体源词，dst = 目标繁词形；与术语保护同机制：转前占位符保护、转后还原成 dst。
// 完整对照、语境规则与已知保留见 references/corrections.md。

export const CORRECTIONS = [
  // 1. 跨语料双重/三重验证一致的确定性修正
  { src: "计划", dst: "計畫" },
  { src: "湿", dst: "濕" },
  { src: "只", dst: "只" },
  { src: "不只", dst: "不只" },
  { src: "宣布", dst: "宣布" },
  { src: "布置", dst: "布置" },
  { src: "布局", dst: "布局" },
  { src: "会合", dst: "會合" },
  { src: "屏幕", dst: "螢幕" },
  { src: "录像", dst: "錄影" },
  { src: "出厂", dst: "原廠" },

  // 2. 活侠传语料校准（武侠/游戏/文学高频正字）
  { src: "秘籍", dst: "秘笈" },
  { src: "彷佛", dst: "彷彿" },
  { src: "倒霉", dst: "倒楣" },
  { src: "利落", dst: "俐落" },
  // 常用词正字（繁体环境以常用词为准，统一输出「傢伙」，防出「家夥」或保留「家伙」）
  { src: "傢伙", dst: "傢伙" },

  // 3. 称谓正字（防 OpenCC 过度生僻化为 孃 或漏转正字 姪；统一使用「姐」字规范，严禁用「姊」）
  { src: "娘亲", dst: "娘親" },
  { src: "师娘", dst: "師娘" },
  { src: "师侄", dst: "師姪" },
  { src: "贤侄", dst: "賢姪" },
  { src: "侄女", dst: "姪女" },
  { src: "侄儿", dst: "姪兒" },
  // 统一「姐」字规范：之后统一使用「姐」字而不要用到「姊」，防误转出「姊」
  { src: "姊", dst: "姐" },
  { src: "学姊", dst: "學姐" },
  { src: "师姊", dst: "師姐" },
  { src: "姊姊", dst: "姐姐" },
  { src: "姊妹", dst: "姐妹" },
  { src: "大姊", dst: "大姐" },

  // 4. 财务与日常正字（教育部辞典正字 帳，防 OpenCC 系统性出 賬）
  { src: "算账", dst: "算帳" },
  { src: "混账", dst: "混帳" },
  { src: "买账", dst: "買帳" },
  { src: "账房", dst: "帳房" },

  // 5. OpenCC 歧义盲点与过度转换回退
  { src: "干着急", dst: "乾著急" },
  { src: "干瞪眼", dst: "乾瞪眼" },
  { src: "干系", dst: "干係" },
  { src: "仙人板板", dst: "仙人板板" },
  { src: "心有戚戚", dst: "心有戚戚" },
  { src: "一出手", dst: "一出手" },
  { src: "大铁锤", dst: "大鐵鎚" },
  { src: "借着", dst: "藉著" },
  { src: "凭藉", dst: "憑藉" },

  // 6. 交响乐之雨语料校准：OpenCC 分词截断与错误粘连保护（彻底防御被切词切碎）
  { src: "面包", dst: "麵包" },          // 防被「有面/多面」粘连切词导致漏转「面包」
  { src: "这么干脆", dst: "這麼乾脆" },    // 防被「這麼幹」分词截断错转为荒谬的「這麼幹脆」
  { src: "那么干脆", dst: "那麼乾脆" },    // 同上，防截断错转为「那麼幹脆」
  { src: "简单干净", dst: "簡單乾淨" },    // 防被「單幹」粘连切词错转为荒谬的「簡單幹淨」

  // 7. 交响乐之雨语料校准：冲泡与淋浴洗澡（教育部正字水偏旁「沖」，防错转为冲撞之「衝」）
  { src: "冲个澡", dst: "沖個澡" },
  { src: "冲了个澡", dst: "沖了個澡" },
  { src: "冲了澡", dst: "沖了澡" },
  { src: "冲过澡", dst: "沖過澡" },
  { src: "冲好澡", dst: "沖好澡" },
  { src: "冲咖啡", dst: "沖咖啡" },
  { src: "冲牛奶", dst: "沖牛奶" },

  // 8. 交响乐之雨语料校准：做事/工作之正字「幹」（防单字 fallback 错转为干燥之「乾」）
  { src: "干的事情", dst: "幹的事情" },
  { src: "干的事", dst: "幹的事" },
  { src: "干点什么", dst: "幹點什麼" },
  { src: "干点事", dst: "幹點事" },

  // 9. 交响乐之雨语料校准：微闭双眼之教育部辞典正字「瞇」（OpenCC 默认不转残留「眯」）
  { src: "眯起眼睛", dst: "瞇起眼睛" },
  { src: "眯起眼", dst: "瞇起眼" },
  { src: "眯着眼", dst: "瞇著眼" },
  { src: "眯着眼睛", dst: "瞇著眼睛" },
  { src: "眯细", dst: "瞇細" },
  { src: "眯成", dst: "瞇成" },

  // 10. 交响乐之雨语料校准：状态形容词正字
  { src: "空荡荡", dst: "空盪盪" },

  // 11. 四款日系官方大作（美德傳說/空之軌跡1st/永恆傳說/魔物獵人物語）多重校準正字
  // 經典正字：遺跡（四款遊戲全量 100% 遺跡 320 處 vs 遺蹟 0 處，教育部辭典正字，防 OpenCC 盲點 遺蹟）
  { src: "遗迹", dst: "遺跡" },
  { src: "古迹", dst: "古蹟" },

  // 經典正字：不准（表許可禁止之教育部正字，美德66處/永恆/空軌/魔物100%使用不准，防過度繁化為 不準）
  { src: "不准", dst: "不准" },

  // 疾病康復撫慰正字：癒（四款遊戲全量 100% 130處使用疒字頭 癒，防 OpenCC 殘留 愈）
  { src: "治愈", dst: "治癒" },
  { src: "疗愈", dst: "療癒" },
  { src: "痊愈", dst: "痊癒" },
  { src: "愈合", dst: "癒合" },

  // 重大切詞Bug防禦：一出（防 OpenCC 貪婪匹配一齣戲導致切詞破壞為「一齣發」「一齣現」）
  { src: "一出发", dst: "一出發" },
  { src: "一出现", dst: "一出現" },
  { src: "一出来", dst: "一出來" },
  { src: "一出门", dst: "一出門" },
  { src: "一出生", dst: "一出生" },
  { src: "一出道", dst: "一出道" },

  // 遊戲與狀態回復（教育部正字 回復，四款遊戲戰鬥與狀態 416處全量使用回復，防 OpenCC 錯轉為信件 回覆）
  { src: "回复HP", dst: "回復HP" },
  { src: "回复体力", dst: "回復體力" },
  { src: "回复我方", dst: "回復我方" },
  { src: "回复状态", dst: "回復狀態" },
  { src: "回复魔法", dst: "回復魔法" },
  { src: "回复道具", dst: "回復道具" },
  { src: "回复技能", dst: "回復技能" },
  { src: "状态回复", dst: "狀態回復" },
  { src: "HP回复", dst: "HP回復" },
  { src: "异常回复", dst: "異常回復" },
  { src: "回复药", dst: "回復藥" },
  { src: "回复量", dst: "回復量" },
  { src: "回复力", dst: "回復力" },
  { src: "回复功能", dst: "回復功能" },

  // 軍事重型武器正字 砲（四款遊戲 100% 59處使用石部 砲，防 OpenCC 錯出火部 炮）
  { src: "大炮", dst: "大砲" },
  { src: "加农炮", dst: "加農砲" },
  { src: "火炮", dst: "火砲" },
  { src: "迫击炮", dst: "迫擊砲" },
  { src: "光束炮", dst: "光束砲" },
  { src: "炮击", dst: "砲擊" },
  { src: "炮台", dst: "砲台" },
  { src: "巨炮", dst: "巨砲" },

  // 冒險者職業核心正字（空之軌跡官方 1072處 100% 使用遊歷冒險之「遊擊士」，防誤轉為游擊隊 游擊士）
  { src: "游击士", dst: "遊擊士" },

  // 黏附特性正字 黏（教育部辭典正字，防殘留 粘）
  { src: "粘土", dst: "黏土" },
  { src: "粘液", dst: "黏液" },
  { src: "粘稠", dst: "黏稠" },
  { src: "粘贴", dst: "黏貼" },
  { src: "粘着", dst: "黏著" },
  { src: "粘性", dst: "黏性" },

  // 盡力盡情正字 盡（四款遊戲 98.6% 139處壓倒性使用 盡，防 OpenCC 過度繁化為 儘）
  { src: "尽可能", dst: "盡可能" },
  { src: "尽快", dst: "盡快" },
  { src: "尽量", dst: "盡量" },

  // 思睡疲倦正字 睏（教育部正字，防 OpenCC 錯留 困）
  { src: "好困", dst: "好睏" },
  { src: "犯困", dst: "犯睏" },
  { src: "发困", dst: "發睏" },

  // 寄託之正字 託（教育部正字，防殘留 托）
  { src: "托你的福", dst: "託你的福" },
  { src: "托大家的福", dst: "託大家的福" },
  { src: "托您的福", dst: "託您的福" },
  { src: "托福", dst: "託福" },

  // 重疊堆積正字 疊（防 堆迭）
  { src: "堆迭", dst: "堆疊" },

  // 12. 苍之彼方的四重奏官方繁简校准（50,085 行同源底稿，重大切词防御与教育部正字）
  // 重大切词Bug防御：积蓄发射（OpenCC 贪婪匹配「蓄发→蓄髮」导致荒谬错转「積蓄髮射」）
  { src: "积蓄发射", dst: "積蓄發射" },
  // 重大切词Bug防御：上下摆动（OpenCC 贪婪匹配「下摆→下襬」切词截断错转为「上下襬動」）
  { src: "上下摆动", dst: "上下擺動" },
  { src: "轻微上下摆动", dst: "輕微上下擺動" },
  // 重大切词Bug防御：一出（补充一出教室，防切词破坏为「一齣教室」）
  { src: "一出教室", dst: "一出教室" },

  // 台湾教育部正字：拚（56 处全量 100% 官方正字「拚命」，音 ㄆㄧㄣˋ，防 OpenCC 漏转保留「拼命」）
  { src: "拼命", dst: "拚命" },
  { src: "拼搏", dst: "拚搏" },
  { src: "打拼", dst: "打拚" },

  // 台湾教育部正字：背负（9 处全量 100% 官方正字「背負」，防 OpenCC 错转为俗字「揹負」）
  { src: "背负", dst: "背負" },

  // 台湾教育部正字：摆布（4 处全量 100% 官方正字「擺布」，防 OpenCC 错转为俗字「擺佈」）
  { src: "摆布", dst: "擺布" },

  // 台湾教育部正字：賒帳（6 处全量 100% 官方正字「賒帳」，防 OpenCC 系统性出「賒賬」）
  { src: "赊账", dst: "賒帳" },

  // 台湾建筑与日常正字：橫樑（6 处全量 100% 官方正字「橫樑」，建筑大梁用木部「樑」）
  { src: "横梁", dst: "橫樑" },

];

/** 已知保留词：findResidue 时先隔离，避免把正确词形误报为残留。见 corrections.md §三。 */
export const KNOWN_KEEPS = [
  "公里", "英里", "傢伙", "伙家", "布局", "宣布", "布置", "干扰", "干涉",
  "划艇", "划槳", "划船", "划動", "紀念", "晴空萬里", "面對", "掙扎", "濃郁", "伙食",
  "只", "伙", "污", "扎", "干", "娘", "娘親", "師娘", "姪", "師姪", "賢姪", "姪女",
  "帳", "算帳", "混帳", "買帳", "帳房", "仙人板板", "心有戚戚", "秘笈", "彷彿", "倒楣", "俐落",
  "麵包", "瞇", "學姊", "師姊", "空盪盪", "沖澡", "沖個澡", "乾淨", "乾脆",
  "遺跡", "古蹟", "不准", "治癒", "療癒", "痊癒", "癒合", "大砲", "加農砲", "火砲", "迫擊砲", "光束砲", "砲擊", "砲台", "巨砲", "遊擊士", "黏土", "黏液", "黏稠", "黏貼", "黏著", "黏性", "盡可能", "盡快", "盡量", "好睏", "犯睏", "發睏", "託福", "堆疊"
];

// 占位符使用 Unicode 私用区，正常文本不会出现
const SLOT_OPEN = "\uE000";
const SLOT_SEP = "\uE001";
const slot = (i) => SLOT_OPEN + "P" + i + SLOT_SEP;

/**
 * 术语保护：先把受保护词替换成占位符，转换后原样还原。
 * terms: [{ src, dst }]，dst 省略时表示保持原文不变。
 */
export function protectTerms(text, terms) {
  const applied = [];
  let out = text;
  terms.forEach((t) => {
    if (!t || !t.src) return;
    if (!out.includes(t.src)) return;
    const token = slot(applied.length);
    out = out.split(t.src).join(token);
    applied.push({ token, out: t.dst ?? t.src, src: t.src });
  });
  return { text: out, applied };
}

/** 还原占位符。 */
export function restoreTerms(text, applied) {
  let out = text;
  for (const a of applied) out = out.split(a.token).join(a.out);
  return out;
}

/** 基线转换。localize 为 true 时用 s2twp，否则用 s2tw。 */
export function convertBase(text, localize = false) {
  return localize ? s2twp(text) : s2tw(text);
}

/**
 * 完整转换一条文本：术语保护 → 基线转换 → 还原。
 * localize 决定档位，terms 为空数组时等价于直接转换。
 */
export function convertText(text, { localize = false, terms = [] } = {}) {
  if (!text) return text;
  const all = [...(terms || [])];
  const userSrcs = new Set(all.map((t) => t && t.src));
  for (const c of CORRECTIONS) if (!userSrcs.has(c.src)) all.push(c);
  all.sort((a, b) => b.src.length - a.src.length); // 最长匹配优先，用户 terms 与修正表同词时用户优先
  const { text: guarded, applied } = protectTerms(text, all);
  const converted = convertBase(guarded, localize);
  const restored = restoreTerms(converted, applied);
  // 统一「姐」字规范：为了统一风格，之后统一使用「姐」字而不要用到「姊」
  return restored.replaceAll("姊", "姐");
}

/** 统计用词白名单的命中情况，用于生成 diff 报告。按出现次数降序。 */
export function diffWordList(texts, entries) {
  const count = new Map();
  for (const t of texts) {
    if (!t) continue;
    for (const e of entries) {
      if (!e || !e.src) continue;
      const n = t.split(e.src).length - 1;
      if (n) count.set(e.src, (count.get(e.src) || 0) + n);
    }
  }
  return [...count.entries()]
    .map(([src, n]) => {
      const e = entries.find((x) => x.src === src);
      return { src, dst: e?.dst ?? "", count: n, zone: e?.zone ?? "any", note: e?.note ?? "" };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * 应用用词白名单。只处理 zone 匹配的条目，最长匹配优先。
 * zone: "ui" | "narrative" | "any"
 */
export function applyWordList(text, entries, zone = "any") {
  if (!text) return text;
  const usable = entries
    .filter((e) => e && e.src && e.dst && ((e.zone ?? "any") === "any" || (e.zone ?? "any") === zone))
    .sort((a, b) => b.src.length - a.src.length);
  let out = text;
  for (const e of usable) if (out.includes(e.src)) out = out.split(e.src).join(e.dst);
  return out;
}

// ---- 标点 ----

/**
 * 中文标点转换：双引号 → 「」，单引号 → 『』。
 * 英文直引号包裹的片段先隔离，转换后再还原，避免破坏代码与 JSON。
 */
export function convertPunctuation(text) {
  if (!text) return text;
  const ASCII_QUOTE_GUARD = /[\u0000-\u0008\u000E-\u001F]/;
  if (ASCII_QUOTE_GUARD.test(text)) return text;

  // 隔离英文直引号片段
  const spans = [];
  let out = text.replace(/"[^"\n]*"|'[^'\n]*'/g, (m) => {
    const token = "\uE000Q" + spans.length + "\uE001";
    spans.push({ token, m });
    return token;
  });

  out = out.replace(/“([^“”]*)”/g, "「$1」").replace(/“/g, "「").replace(/”/g, "」");
  out = out.replace(/‘([^‘’]*)’/g, "『$1』").replace(/‘/g, "『").replace(/’/g, "』");

  for (const s of spans) out = out.split(s.token).join(s.m);
  return out;
}

// ---- 复查 ----

/**
 * 一简对多繁的简体字集合（延迟计算）。
 * 这些字在繁体里有多个候选形，单字无法判定，交给歧义复查而不是判为残留。
 */
let ambiguousCache = null;
export function ambiguousSet() {
  if (ambiguousCache) return ambiguousCache;
  const rev = new Map();
  for (let cp = 0x4e00; cp <= 0x9fff; cp++) {
    const t = String.fromCodePoint(cp);
    const s = t2s(t);
    if (s === t || [...s].length !== 1) continue;
    if (!rev.has(s)) rev.set(s, new Set());
    rev.get(s).add(t);
  }
  ambiguousCache = new Set([...rev.entries()].filter(([, v]) => v.size > 1).map(([s]) => s));
  return ambiguousCache;
}

/** 歧义字普查：文本里一简对多繁的简体字出现了多少处，按次数降序。 */
export function ambiguityCensus(text) {
  const set = ambiguousSet();
  const s = text || "";
  const hits = new Map();
  for (const ch of s) if (set.has(ch)) hits.set(ch, (hits.get(ch) || 0) + 1);
  return [...hits.entries()].sort((a, b) => b[1] - a[1]);
}

// ---- 繁体歧义目标字过滤（转后筛查） ----

/**
 * 经典繁体歧义目标字与高危敏感字清单（298 字）。
 * 用于基线转换（转为繁体）后，从繁体文本中精准筛选落入「一简多繁」语境的句子（如 发/髮、干/乾/幹、只/隻、台/臺/檯/颱、里/裡、面/麵 等）。
 */
export const AMBIGUOUS_TARGET_CHARS = [
  "丑", "丰", "瞭", "于", "云", "亘", "仆", "讎", "崙", "价", "彷", "伙", "余", "彿", "佣", "儁", "脩", "藉", "殭", "剋",
  "党", "鼕", "沖", "淒", "准", "淩", "几", "凶", "齣", "划", "彆", "颳", "製", "勛", "韆", "昇", "蔔", "占", "鹵", "捲",
  "厂", "曆", "厘", "蔘", "髮", "隻", "祇", "檯", "颱", "台", "叶", "歎", "吁", "吃", "閤", "弔", "衕", "后", "嚮", "曏",
  "週", "賙", "咨", "咸", "嚥", "鬨", "嘩", "唇", "嚙", "餵", "譟", "迴", "糰", "睏", "罈", "垻", "塤", "複", "覆", "伕",
  "夸", "姦", "薑", "孃", "嫻", "甯", "牠", "傢", "嚐", "尸", "儘", "侷", "岩", "岳", "鉅", "佈", "帘", "蓆", "乾", "干",
  "併", "倖", "广", "菴", "瀰", "絃", "噹", "彔", "綵", "征", "禦", "誌", "唸", "卹", "噁", "癒", "愿", "慼", "纔", "紮",
  "托", "釦", "摺", "牴", "柺", "挂", "捱", "輓", "据", "蒐", "襬", "斗", "鏇", "崑", "闇", "麴", "朮", "硃", "朴", "桿",
  "杠", "盃", "杰", "鬆", "闆", "极", "柜", "慄", "覈", "樑", "慾", "燬", "彙", "沈", "霑", "氾", "汎", "註", "涂", "涌",
  "淀", "游", "灧", "灕", "鍊", "菸", "熏", "翫", "璿", "癥", "皂", "榘", "确", "俬", "鞦", "种", "筑", "籤", "係", "繫",
  "縴", "緔", "綳", "冑", "揹", "胜", "鬍", "衚", "臟", "腊", "腌", "膻", "緻", "捨", "艷", "蕓", "甦", "囌", "薹", "苹",
  "范", "荐", "盪", "廕", "葯", "穫", "矇", "濛", "懞", "蔑", "衊", "虫", "蚝", "蜡", "蝎", "錶", "嫋", "裊", "襇", "証",
  "謚", "穀", "贋", "讚", "跖", "辟", "蹟", "适", "郁", "痠", "采", "寀", "裏", "里", "鑒", "鍼", "鐘", "鈡", "鑰", "鈅",
  "鈁", "鍅", "鉆", "剷", "錇", "鉳", "钂", "鎲", "鎿", "錼", "钁", "鐝", "鐮", "鎌", "閑", "鵰", "麪", "鬚", "饑", "鷴",
  "偽", "啟", "媯", "峰", "么", "抬", "稜", "簷", "汙", "洩", "溈", "潀", "為", "床", "痺", "痴", "著", "睪", "秘", "灶",
  "粽", "韁", "才", "群", "眾", "踴", "缽", "針", "鯰", "麵", "顎", "发", "复", "冲", "面", "只", "卷", "系"
];

let targetAmbiguousCache = null;

/** 繁体歧义目标字集合（Set 缓存）。 */
export function ambiguousTargetSet() {
  if (!targetAmbiguousCache) {
    targetAmbiguousCache = new Set(AMBIGUOUS_TARGET_CHARS);
  }
  return targetAmbiguousCache;
}

/** 检测文本是否含有繁体歧义目标字（用于在基线转换后快速过滤待复查文本）。 */
export function hasAmbiguousTarget(text) {
  if (!text) return false;
  const set = ambiguousTargetSet();
  for (const ch of text) {
    if (set.has(ch)) return true;
  }
  return false;
}

/** 繁体歧义目标字普查：统计转换后文本中各歧义目标字的命中频次，按次数降序。 */
export function ambiguousTargetCensus(text) {
  const set = ambiguousTargetSet();
  const s = text || "";
  const hits = new Map();
  for (const ch of s) if (set.has(ch)) hits.set(ch, (hits.get(ch) || 0) + 1);
  return [...hits.entries()].sort((a, b) => b[1] - a[1]);
}


/**
 * 残留检测：把整句再跑一次 s2tw，若结果不同则仍有可转换的字。
 * 词组级比对能正确放过「干涉」「發現」「千里」，只揪出真正没转的简体。
 * keepWords：已知保留词形，先隔离再比较，避免把正确词形误报为残留。
 */
export function findResidue(text, keepWords = []) {
  const s = text || "";
  let guarded = s;
  let kIdx = 0;
  // 最长匹配优先：先保护长词组，防止单字破坏多字保留项
  const sortedKeeps = [...(keepWords || [])].sort((a, b) => b.length - a.length);
  for (const w of sortedKeeps) {
    if (!w || !guarded.includes(w)) continue;
    const token = SLOT_OPEN + "K" + kIdx + SLOT_SEP;
    guarded = guarded.split(w).join(token);
    kIdx++;
  }
  const converted = s2tw(guarded);
  if (converted === guarded) return [];
  const hits = new Map();
  if ([...converted].length === [...guarded].length) {
    const a = [...guarded], b = [...converted];
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      const k = a[i] + "→" + b[i];
      hits.set(k, (hits.get(k) || 0) + 1);
    }
  } else {
    hits.set("<句长变化，需人工比对>", 1);
  }
  return [...hits.entries()].sort((x, y) => y[1] - x[1]);
}

/** 结构校验：转换前后应保持的字符（数字、拉丁字母、控制符、标点数量）。 */
export function structureSnapshot(text) {
  const s = text || "";
  return {
    length: s.length,
    digits: (s.match(/[0-9]/g) || []).length,
    latin: (s.match(/[A-Za-z]/g) || []).length,
    controls: (s.match(/\\[A-Za-z]+(?:\[[^\]]*\])?/g) || []).length,
    brackets: (s.match(/[「」『』（）()［］\[\]]/g) || []).length,
    newlines: (s.match(/\n/g) || []).length,
  };
}
