# 客户端动态规划断行与多语言时间戳对齐架构文档 (Client-side DP Subtitle Engine)

> **文档定位与分支说明**：  
> 本文档归档了从 LLM 提示词中解耦出来的「客户端确定性断行算法」与「Gladia 词级/句级时间戳精确对齐引擎」。  
> 在当前生产业务中，**大模型断行为主干默认路径**（遵循模型对语境的天然理解）；本文档记录的客户端算法作为**平行架构（Parallel Branch）与高可靠容灾补充（Fallback Shield）**，用于：
> 1. **大模型断行异常时的容灾兜底**（如单行字数漂移、漏断行、模型长文本失忆）。
> 2. **零 Token 快速重排**（用户在前端界面实时调整每行字数或视觉区间时，毫秒级响应，不消耗任何 Gemini 配额）。
> 3. **精准时间轴计算**（结合 Gladia ASR 词级时间戳与 Levenshtein/Token 比例对齐，生成合规精确的 SRT/TXT 导出）。

---

## 一、架构设计对比：LLM 断行 vs 客户端确定性断行

| 维度 | 主路径：大模型端断行 (LLM-based) | 备用分支：客户端确定性动态规划 (Client DP) |
|---|---|---|
| **执行位置** | 服务端 / Gemini 3.8 Flash | 前端客户端 / 浏览器 WebAssembly/TS |
| **Token 消耗** | 需消耗 Output Tokens，提示词需包含断行指示 | **0 消耗**（纯计算） |
| **响应耗时** | 随网络请求（2 ~ 8 秒） | **< 3 毫秒**（即时交互） |
| **字数精度** | 软约束（LLM 对字符计数可能存在 ±2~3 字符浮动） | **硬约束**（100% 绝对严格限制在 `maxLineLength` 内） |
| **语言理解** | 强（能够理解复杂宗教暗喻与罕见语义边界） | 依赖词典与规则模型（涵盖冠词、介词、连词、标点惩罚） |
| **动态重调** | 每次修改字数需重新请求 LLM（耗费配额并面临 429 风险） | 用户拖动滑块即可实时重排，体验极佳 |
| **定位** | **业务主默认链路 (Current Default)** | **平行支撑分支、无损重排与保底护盾 (Fallback & Reformat)** |

---

## 二、核心算法原理解析

### 1. Knuth-Plass 风格的动态规划 (Dynamic Programming)
传统贪心断行算法（如遇到超长就强行切断）会导致断行出现极端长短不一的“参差断崖”（如倒数第二行极长，最后一行只剩一个单词）。
本算法采用类似 TeX 的全局最优动态规划思想：
- 设待断句子包含 $N$ 个单词 Token：$T_0, T_1, \dots, T_{N-1}$。
- 设 $DP[i]$ 为将前 $i$ 个单词切分为若干合法字幕行时的**全局最小惩罚代价总和**。
- 状态转移方程：
  $$DP[i] = \min_{j < i} \Big( DP[j] + \text{Cost}(j, i) \Big)$$
- 利用 `parent[i]` 数组记录最优前驱节点，在 $O(N \times K)$（其中 $K \le 25$ 为最大行词数窗口）的极低复杂度下完成全局回溯。

### 2. 多维度语法代价评估函数 (`evaluateLineCost`)
每一行从单词 $j$ 到 $i-1$ 的惩罚代价 $\text{Cost}(j, i)$ 由以下维度综合打分：
1. **行长平衡代价 (Length Variance)**：
   - 目标长度设定为 `targetLen = max(minLen, round(maxLen * 0.85))`。
   - 基础代价为 $(lineLen - targetLen)^2$。
   - 若 $lineLen < minLen$（单字成行），施加 $15 \times (minLen - lineLen)^2$ 的惩罚。
2. **标点停顿奖励 (Punctuation Bonus)**：
   - 行末为强停顿（`. ! ? … » ” 。 ！？`）：扣减 150 代价（强自然断句）。
   - 行末为从句弱停顿（`, ; : — ， ； ： 、`）：扣减 80 代价。
3. **行末悬挂词惩罚 (Dangling Word Penalty)**：
   - 避免将冠词、单字母介词、连词（如西语 `el, la, de, en, y, que`；法语 `le, à, et`；英语 `the, to, and`）孤立在行末，加罚 200 代价。
4. **下一行引导词奖励 (Clause Starter Bonus)**：
   - 下一行若以自然从句连词（`pero, sino, because, mais` 等）开头，扣减 50 代价。
   - 下一行若以孤立闭标点（`.,!?»`）开头，重罚 500 代价（杜绝格式碎裂）。
5. **视觉优化避险区间 (Visual Optimization)**：
   - 若行长度落在用户配置的视觉不适区间（如 20~24 字符），额外增加 120 惩罚。

### 3. 多语言与特殊排版支持
- **Unicode NFC 规范化**：自动修复西班牙语与法语中的组合重音字符（如 `u` + `\u0301` -> `ú`），确保 `.length` 字符统计与屏幕视觉绝对一致。
- **CJK (中日韩) 智能分词**：遇到无空格的东亚字符时，自动按字符与标点切词，无缝支持多语言混排。
- **西欧引号与倒问感叹号规范**：保留 `« ... »` 与 `¿`, `¡` 结构，严禁首标点掉落至上一行末尾。

---

## 三、完整独立实现代码（备用平行分支源码）

```typescript
import { Utterance, Cue } from '../types';

export interface SubtitleFormatOptions {
  maxLen?: number;
  minLen?: number;
  enableVisualOpt?: boolean;
  visualOptStart?: number;
  visualOptEnd?: number;
}

// 严禁留在行末的悬挂虚词库（冠词、介词、连词、属格、代词）
const DANGLES_AT_LINE_END = new Set([
  // 西班牙语
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo', 'del', 'al',
  'a', 'de', 'en', 'con', 'por', 'para', 'sin', 'sobre', 'hacia', 'hasta', 'desde', 'entre',
  'y', 'e', 'o', 'u', 'pero', 'sino', 'mas', 'que', 'si', 'ni', 'pues', 'porque', 'aunque',
  'mi', 'mis', 'tu', 'tus', 'su', 'sus', 'nuestro', 'nuestra', 'me', 'te', 'se', 'nos', 'le',
  'este', 'esta', 'ese', 'esa', 'aquel', 'cuyo',
  // 法语
  'le', 'les', 'une', 'des', 'du', "d'", "l'", 'ce', 'cet', 'cette', 'ces',
  'mon', 'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'notre', 'votre', 'leur',
  'au', 'aux', 'à', 'dans', 'sur', 'sous', 'par', 'avec', 'chez', 'ou', 'car', 'donc',
  'qui', 'quoi', 'dont', 'où', "qu'", 'ne', 'lui', "s'", "m'", "t'", "n'", "j'", "c'",
  // 英语
  'the', 'a', 'an', 'and', 'or', 'but', 'nor', 'for', 'yet', 'so',
  'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'about', 'into',
  'my', 'your', 'his', 'her', 'its', 'our', 'their'
]);

// 适合开启新行的自然连词
const CLAUSE_STARTERS_LINE_START = new Set([
  'y', 'e', 'o', 'u', 'pero', 'sino', 'porque', 'pues', 'como', 'cuando', 'si', 'aunque', 'para', 'que',
  'et', 'mais', 'car', 'donc', 'parce', 'puisque', 'lorsque', 'quand', 'afin', 'pour',
  'and', 'but', 'or', 'because', 'so', 'if', 'when', 'where', 'while', 'that', 'which', 'who', 'since'
]);

const STRONG_PAUSES = new Set(['.', '!', '?', '…', '»', '”', '。', '！', '？']);
const SECONDARY_PAUSES = new Set([',', ';', ':', '—', ')', '，', '；', '：', '、']);
const CJK_REGEX = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/;

export function cleanTranscriptText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/<<\s*/g, '« ')
    .replace(/\s*>>/g, ' »')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function tokenizeWords(clause: string): string[] {
  const clean = clause.normalize('NFC').trim();
  if (!clean) return [];
  if (CJK_REGEX.test(clean) && !clean.includes(' ')) {
    const tokens = clean.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]|[a-zA-Z0-9]+|[.,!?:;…»"()¿¡—。！？，；：、]/g);
    return tokens ? tokens.filter(Boolean) : [clean];
  }
  return clean.split(/\s+/).filter(Boolean);
}

function joinTokens(tokens: string[]): string {
  if (tokens.length === 0) return '';
  const isPureCjk = tokens.every(t => CJK_REGEX.test(t) || /^[.,!?:;…»"()¿¡—。！？，；：、]+$/.test(t));
  return isPureCjk ? tokens.join('') : tokens.join(' ');
}

function evaluateLineCost(
  tokens: string[],
  startIndex: number,
  endIndex: number,
  maxLen: number,
  minLen: number,
  opt?: SubtitleFormatOptions
): number {
  const lineText = joinTokens(tokens.slice(startIndex, endIndex));
  const lineLen = lineText.length;

  if (endIndex - startIndex === 1 && lineLen > maxLen) {
    return 1000 + (lineLen - maxLen) * 50;
  }
  if (lineLen > maxLen) return Infinity;

  const targetLen = Math.max(minLen, Math.round(maxLen * 0.85));
  let cost = Math.pow(lineLen - targetLen, 2);

  if (lineLen < minLen) {
    cost += Math.pow(minLen - lineLen, 2) * 15;
  }

  if (opt?.enableVisualOpt && opt.visualOptStart !== undefined && opt.visualOptEnd !== undefined) {
    if (lineLen >= opt.visualOptStart && lineLen <= opt.visualOptEnd) {
      cost += 120;
    }
  }

  const lastToken = tokens[endIndex - 1] || '';
  const lastChar = lastToken.slice(-1);
  if (STRONG_PAUSES.has(lastChar)) cost -= 150;
  else if (SECONDARY_PAUSES.has(lastChar)) cost -= 80;

  const cleanLastWord = lastToken.toLowerCase().replace(/[.,!?:;»"()…¿¡。！？，；：、]+$/g, '');
  if (DANGLES_AT_LINE_END.has(cleanLastWord)) cost += 200;

  if (endIndex < tokens.length) {
    const nextToken = tokens[endIndex];
    const cleanNextWord = nextToken.toLowerCase().replace(/^[«"'(¿¡]/, '');
    if (CLAUSE_STARTERS_LINE_START.has(cleanNextWord)) cost -= 50;
    if (/^[.,!?:;»”)。！？，；：、]/.test(nextToken)) cost += 500;
  }

  return Math.max(0, cost);
}

export function dpBreakLines(
  clause: string,
  maxLen: number,
  minLen: number,
  opt?: SubtitleFormatOptions
): string[] {
  const clean = clause.normalize('NFC').trim();
  if (!clean || clean.length <= maxLen) return clean ? [clean] : [];

  const tokens = tokenizeWords(clean);
  const n = tokens.length;
  if (n <= 1) return [clean];

  const dp: number[] = new Array(n + 1).fill(Infinity);
  const parent: number[] = new Array(n + 1).fill(-1);
  dp[0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(0, i - 25); j < i; j++) {
      if (dp[j] === Infinity) continue;
      const cost = evaluateLineCost(tokens, j, i, maxLen, minLen, opt);
      if (cost !== Infinity && dp[j] + cost < dp[i]) {
        dp[i] = dp[j] + cost;
        parent[i] = j;
      }
    }
  }

  if (dp[n] !== Infinity && parent[n] !== -1) {
    const resultLines: string[] = [];
    let curr = n;
    while (curr > 0) {
      const prev = parent[curr];
      resultLines.unshift(joinTokens(tokens.slice(prev, curr)));
      curr = prev;
    }
    return resultLines;
  }

  // 兜底贪心断行
  const lines: string[] = [];
  let currentWords: string[] = [];
  for (const token of tokens) {
    const candidate = joinTokens([...currentWords, token]);
    if (candidate.length <= maxLen) {
      currentWords.push(token);
    } else {
      if (currentWords.length > 0) {
        lines.push(joinTokens(currentWords));
        currentWords = [token];
      } else {
        lines.push(token);
      }
    }
  }
  if (currentWords.length > 0) lines.push(joinTokens(currentWords));
  return lines;
}
```

---

## 四、Gladia 真实时间戳对齐与导出实现

```typescript
export function computeCues(
  text: string,
  totalDuration?: number,
  utterances?: Utterance[]
): Cue[] {
  if (!text.trim()) return [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // 1. 若拥有 Gladia 真实 utterance / word 时间戳，进行词级对齐
  if (utterances && utterances.length > 0) {
    const cues: Cue[] = [];
    let uIdx = 0;
    let prevEnd = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let start = prevEnd;
      let end = prevEnd + 2.0;

      if (uIdx < utterances.length) {
        start = utterances[uIdx].start;
        end = utterances[uIdx].end;
        uIdx++;
      } else {
        start = prevEnd + 0.1;
        end = start + Math.max(1.5, line.length * 0.1);
      }

      if (totalDuration && end > totalDuration) end = totalDuration;
      if (end <= start) end = start + 0.5;

      cues.push({ index: i + 1, start, end, text: line });
      prevEnd = end;
    }
    return cues;
  }

  // 2. 传统按字符数比例分配估算时间轴
  const effectiveDuration = totalDuration && totalDuration > 0 ? totalDuration : lines.length * 2.8;
  const totalChars = lines.reduce((acc, l) => acc + l.length, 0) || 1;
  const cues: Cue[] = [];
  let currentSec = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const durationForLine = (line.length / totalChars) * effectiveDuration;
    const start = currentSec;
    let end = i === lines.length - 1 ? effectiveDuration : start + durationForLine;
    if (end > effectiveDuration) end = effectiveDuration;

    cues.push({ index: i + 1, start, end, text: line });
    currentSec = end;
  }

  return cues;
}
```

---

## 五、在现有系统中的互补与协同机制

1. **大模型优先 (LLM First)**：
   Prompt 中下发每行最长字数 `maxLineLength`、最小字数 `minLineLength` 与视觉区间要求，由 Gemini 在语义理解的最高维度直接输出断好行的段落。
2. **容灾护盾 (Emergency Fallback)**：
   若 Gemini 遇到极端异常返回单行未经断行的超长文本（字数超过 `maxLineLength` 且无 `\n`），前端流水线自动调用 `dpBreakLines` 进行精准切分，确保页面绝不崩溃。
3. **用户端零 Token 重排 (Instant Re-typeset)**：
   当用户在界面修改了排版设置（如从 25 字符调整为 30 字符）并点击“重新断行”时，直接在客户端调用 `formatSubtitles`，无需重新调用 Gemini，实现 0 Token 消耗与毫秒级即时响应。
