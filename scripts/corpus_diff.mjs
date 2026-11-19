// 语料校准：对比 convertText(chs) 与官方 cht，提取候选规则。
// 依赖：opencc-js（共享 npm 工程，裸导入）。
//
// workspace_run 中使用：
//   const { diffCorpus } = await import("<skills>/s2t/scripts/corpus_diff.mjs");
//   const report = await diffCorpus(pairs);
//
// 入参 pairs: [{ rel?, id?, chs, cht }] —— 配对由调用方负责（各语料格式不同，
//   先写小 loader 把两侧文本对齐成数组，见 references/corrections.md §四）。
//
// 返回 report:
//   { total, identical, identicalRate,
//     singles: { "你→妳": { count, examples: [...] } },   // 单字替换，内建表候选
//     words:   { "计划→計畫": {...} },                    // 多字替换，术语/选词候选
//     dels:    { "被": {...} }, inss: { "吧": {...} } }    // 纯删/纯插，多为翻译差异，只观察
//
// 注意：官方繁簡若是独立译本，diff 混有翻译差异噪声。入内建表前必须
// 逐条核对 examples 的上下文一致性（命中 ≥5 且上下文一致才收，3–4 次只入
// 语境规则），标准见 references/corrections.md §四。

import OpenCC from "opencc-js";

const converter = (to) => OpenCC.Converter({ from: "cn", to });

// 字级 LCS 回溯：返回操作序列 [["eq"|"del"|"ins", 字], ...]
function lcsOps(a, b) {
  const n = a.length, m = b.length;
  if (n === 0) return [...b].map((ch) => ["ins", ch]);
  if (m === 0) return [...a].map((ch) => ["del", ch]);
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 1; i <= n; i++) {
    const ai = a[i - 1];
    for (let j = 1; j <= m; j++) {
      dp[i][j] = ai === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const ops = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { ops.push(["eq", a[i - 1]]); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) { ops.push(["del", a[i - 1]]); i--; }
    else { ops.push(["ins", b[j - 1]]); j--; }
  }
  while (i > 0) { ops.push(["del", a[i - 1]]); i--; }
  while (j > 0) { ops.push(["ins", b[j - 1]]); j--; }
  ops.reverse();
  return ops;
}

// 带【目标】标记的上下文窗
function mark(text, pos, len, r = 12) {
  const s = Math.max(0, pos - r);
  const e = Math.min(text.length, pos + len + r);
  return (s > 0 ? "…" : "") + text.slice(s, pos) + "【" + text.slice(pos, pos + len) + "】" + text.slice(pos + len, e) + (e < text.length ? "…" : "");
}

export async function diffCorpus(pairs, { to = "tw", sample = 5, onProgress, step = 2000 } = {}) {
  const conv = converter(to);
  const singles = new Map(), words = new Map(), dels = new Map(), inss = new Map();
  let identical = 0;

  const bump = (map, key, ex) => {
    const e = map.get(key) || { count: 0, examples: [] };
    e.count++;
    if (e.examples.length < sample) e.examples.push(ex);
    map.set(key, e);
  };

  for (let idx = 0; idx < pairs.length; idx++) {
    const p = pairs[idx];
    const c = conv(p.chs);
    if (c === p.cht) { identical++; continue; }
    const ops = lcsOps(c, p.cht);
    let posC = 0, posT = 0, i = 0;
    while (i < ops.length) {
      const [type, ch] = ops[i];
      if (type === "eq") { posC++; posT++; i++; continue; }
      const del = [], ins = [];
      while (i < ops.length && ops[i][0] !== "eq") {
        if (ops[i][0] === "del") { del.push(ops[i][1]); posC++; }
        else { ins.push(ops[i][1]); posT++; }
        i++;
      }
      const d = del.join(""), t = ins.join("");
      const ex = mark(c, posC - d.length, d.length || 1) + " ⟶ " + mark(p.cht, posT - t.length, t.length || 1);
      if (d && t) bump(d.length === 1 && t.length === 1 ? singles : words, d + "→" + t, ex);
      else if (d) bump(dels, d, ex);
      else bump(inss, t, ex);
    }
    if (onProgress && idx > 0 && idx % step === 0) onProgress(idx, pairs.length);
  }

  const toObj = (m) => Object.fromEntries([...m.entries()].sort((x, y) => y[1].count - x[1].count));
  return { total: pairs.length, identical, identicalRate: pairs.length ? identical / pairs.length : 0, singles: toObj(singles), words: toObj(words), dels: toObj(dels), inss: toObj(inss) };
}
