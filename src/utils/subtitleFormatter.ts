import { Utterance, Cue } from '../types';

/**
 * Intelligent subtitle line-breaking and formatting engine tailored for multi-language speech-to-text transcripts.
 * Features:
 * - Knuth-Plass style Dynamic Programming (DP) optimal line break partitioning
 * - Word & utterance real timestamp alignment
 * - Proper NFC Unicode normalization
 * - CJK (Chinese, Japanese, Korean) and European languages support
 * - Deduplicated download and cue generation utilities
 */

export interface SubtitleFormatOptions {
  maxLen?: number;
  minLen?: number;
  enableVisualOpt?: boolean;
  visualOptStart?: number;
  visualOptEnd?: number;
}

// Words that should NOT dangle at the end of a line (articles, prepositions, conjunctions, possessives, clitics)
const DANGLES_AT_LINE_END = new Set([
  // Spanish articles & contractions
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo', 'del', 'al',
  // Spanish prepositions
  'a', 'de', 'en', 'con', 'por', 'para', 'sin', 'sobre', 'hacia', 'hasta', 'desde', 'entre', 'bajo', 'ante', 'tras', 'según', 'contra',
  // Spanish conjunctions
  'y', 'e', 'o', 'u', 'pero', 'sino', 'mas', 'que', 'si', 'ni', 'pues', 'porque', 'aunque',
  // Spanish possessives & clitic pronouns
  'mi', 'mis', 'tu', 'tus', 'su', 'sus', 'nuestro', 'nuestra', 'nuestros', 'nuestras', 'vuestro', 'vuestra', 'vuestros', 'vuestras',
  'me', 'te', 'se', 'nos', 'os', 'le', 'les',
  // Spanish demonstratives & relatives
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel', 'aquella', 'cuyo', 'cuya', 'cuyos', 'cuyas',
  // French articles, pronouns, prepositions and short words
  'le', 'les', 'une', 'des', 'du', "d'", "l'",
  'ce', 'cet', 'cette', 'ces',
  'mon', 'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'notre', 'votre', 'leur', 'vos', 'leurs',
  'au', 'aux', 'à', 'dans', 'sur', 'sous', 'par', 'avec', 'chez',
  'ou', 'car', 'donc', 'or',
  'qui', 'quoi', 'dont', 'où', "qu'",
  'ne', 'lui', "s'", "m'", "t'", "n'", "j'", "c'",
  // English articles, conjunctions, prepositions
  'the', 'a', 'an', 'and', 'or', 'but', 'nor', 'for', 'yet', 'so',
  'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'about', 'into', 'over', 'after',
  'my', 'your', 'his', 'her', 'its', 'our', 'their'
]);

// Conjunctions or relative words that naturally begin a new line or subordinate clause
const CLAUSE_STARTERS_LINE_START = new Set([
  // Spanish conjunctions & subordinate markers
  'y', 'e', 'o', 'u', 'pero', 'sino', 'porque', 'pues', 'como', 'cuando', 'donde', 'si', 'aunque', 'para', 'que', 'quien', 'ya', 'así',
  // French conjunctions & markers
  'et', 'mais', 'car', 'donc', 'parce', 'puisque', 'lorsque', 'quand', 'afin', 'pour', 'qui',
  // English conjunctions & markers
  'and', 'but', 'or', 'because', 'so', 'if', 'when', 'where', 'while', 'that', 'which', 'who', 'since'
]);

// Terminal / strong pauses (quotes appear strictly here, not in secondary pauses)
const STRONG_PAUSES = new Set(['.', '!', '?', '…', '»', '”', '。', '！', '？']);

// Secondary / clause-level pauses
const SECONDARY_PAUSES = new Set([',', ';', ':', '—', ')', '，', '；', '：', '、']);

// Regular expression to detect CJK characters
const CJK_REGEX = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/;

// Compound conjunctions / multi-word phrases that must not be split across line breaks
const COMPOUND_CONJUNCTION_PAIRS = new Set([
  // Spanish
  'para que', 'sin embargo', 'por tanto', 'por lo', 'ya que', 'puesto que',
  'a pesar', 'tal como', 'de modo', 'de manera', 'así que', 'en tanto',
  // French
  'parce que', 'afin que', 'pour que', 'bien que', 'de sorte', 'dès que', 'au moins', 'en plus',
  // English
  'so that', 'even though', 'even if', 'as well', 'in order', 'such that', 'rather than'
]);

function isCompoundSplit(w1: string, w2: string): boolean {
  if (!w1 || !w2) return false;
  return COMPOUND_CONJUNCTION_PAIRS.has(`${w1.toLowerCase()} ${w2.toLowerCase()}`);
}

/**
 * Clean and normalize quotation marks, inverted marks, extra spaces and NFC Unicode.
 */
export function cleanTranscriptText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Normalize Spanish / French quotes
    .replace(/<<\s*/g, '« ')
    .replace(/\s*>>/g, ' »')
    // Collapse redundant spaces/tabs
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Measure effective length of a line (NFC normalized and trimmed).
 */
export function getLineLength(line: string): number {
  return line.normalize('NFC').trim().length;
}

/**
 * Tokenize a sentence or clause into words or CJK characters/punctuations.
 */
function tokenizeWords(clause: string): string[] {
  const clean = clause.normalize('NFC').trim();
  if (!clean) return [];

  // If text has CJK characters and no whitespace, tokenize into ideographic tokens / punctuation
  if (CJK_REGEX.test(clean) && !clean.includes(' ')) {
    const tokens = clean.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]|[a-zA-Z0-9]+|[.,!?:;…»"()¿¡—。！？，；：、]/g);
    return tokens ? tokens.filter(Boolean) : [clean];
  }

  return clean.split(/\s+/).filter(Boolean);
}

/**
 * Join an array of tokens into a line. For pure CJK tokens, join without spaces.
 */
function joinTokens(tokens: string[]): string {
  if (tokens.length === 0) return '';
  const isPureCjk = tokens.every(t => CJK_REGEX.test(t) || /^[.,!?:;…»"()¿¡—。！？，；：、]+$/.test(t));
  if (isPureCjk) {
    return tokens.join('');
  }
  return tokens.join(' ');
}

/**
 * Base cost per line break to prevent excessive fragmenting/splintering
 * when pause/starter bonuses are present.
 */
const BASE_LINE_COST = 250;

/**
 * Evaluate the penalty/cost of breaking a line consisting of tokens[startIndex ... endIndex - 1].
 */
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
  const isSingleWord = (endIndex - startIndex === 1);

  // Single word longer than maxLen is forced with a finite penalty so DP remains solvable
  if (isSingleWord && lineLen > maxLen) {
    return 1000 + (lineLen - maxLen) * 50;
  }

  // Multi-word line exceeding maxLen is strictly disallowed
  if (lineLen > maxLen) {
    return Infinity;
  }

  let cost = BASE_LINE_COST;
  const isLastLine = (endIndex === tokens.length);
  const targetLen = Math.max(minLen, Math.round(maxLen * 0.85));

  if (!isLastLine) {
    // Intermediate lines prefer to be close to ~85% of maxLen
    cost += Math.pow(lineLen - targetLen, 2);
    // Heavy penalty for being too short (below minLen)
    if (lineLen < minLen) {
      cost += Math.pow(minLen - lineLen, 2) * 15;
    }
  } else {
    // Last line relaxation: it is natural for the final line to be shorter than targetLen
    // But prevent widow/orphan words (e.g. fewer than 8 chars or below minLen)
    const orphanThreshold = Math.min(minLen, 8);
    if (lineLen < orphanThreshold) {
      cost += Math.pow(orphanThreshold - lineLen, 2) * 15;
    } else if (lineLen > targetLen) {
      cost += Math.pow(lineLen - targetLen, 2);
    }
  }

  // Visual optimization penalty (avoid awkward length window)
  if (opt?.enableVisualOpt && opt.visualOptStart !== undefined && opt.visualOptEnd !== undefined) {
    const vStart = opt.visualOptStart;
    const vEnd = opt.visualOptEnd;
    if (lineLen >= vStart && lineLen <= vEnd) {
      cost += 120;
    }
  }

  // Check the ending token of this line
  const lastToken = tokens[endIndex - 1] || '';
  const lastChar = lastToken.slice(-1);

  if (STRONG_PAUSES.has(lastChar)) {
    cost -= 150; // Strong natural break bonus
  } else if (SECONDARY_PAUSES.has(lastChar)) {
    cost -= 80;  // Good secondary clause pause bonus
  }

  // Grammar penalty: never leave dangling articles/prepositions/conjunctions at line end
  const cleanLastWord = lastToken.toLowerCase().replace(/[.,!?:;»"()…¿¡。！？，；：、]+$/g, '');
  if (DANGLES_AT_LINE_END.has(cleanLastWord)) {
    cost += 200; // Heavy penalty for dangling words
  }

  // Check the starting token of the next line (if not at end of tokens)
  if (endIndex < tokens.length) {
    const nextToken = tokens[endIndex];
    const cleanNextWord = nextToken.toLowerCase().replace(/^[«"'(¿¡]/, '').replace(/[.,!?:;»"()…¿¡。！？，；：、]+$/g, '');

    // Severe penalty for splitting a compound phrase/conjunction across lines
    if (isCompoundSplit(cleanLastWord, cleanNextWord)) {
      cost += 350;
    }

    // Bonus for starting next line with a natural conjunction / clause starter
    if (CLAUSE_STARTERS_LINE_START.has(cleanNextWord)) {
      cost -= 50;
    }

    // Heavy penalty if next line begins with an orphaned closing punctuation mark
    if (/^[.,!?:;»”)。！？，；：、]/.test(nextToken)) {
      cost += 500;
    }
  }

  return Math.max(0, cost);
}

/**
 * Dynamic Programming optimal line breaking algorithm (Knuth-Plass inspired).
 * Partitions words into lines with minimal total penalty.
 */
function dpBreakLines(
  clause: string,
  maxLen: number,
  minLen: number,
  opt?: SubtitleFormatOptions
): string[] {
  const clean = clause.normalize('NFC').trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const tokens = tokenizeWords(clean);
  const n = tokens.length;
  if (n <= 1) return [clean];

  // dp[i] = minimum total cost to partition tokens[0 ... i - 1]
  const dp: number[] = new Array(n + 1).fill(Infinity);
  // parent[i] = start index of the optimal last line
  const parent: number[] = new Array(n + 1).fill(-1);

  dp[0] = 0;

  for (let i = 1; i <= n; i++) {
    // Reverse traversal: start from the immediate predecessor token (j = i - 1)
    // and expand to the left until candidate line length exceeds maxLen.
    for (let j = i - 1; j >= 0; j--) {
      const isSingleWord = (j === i - 1);
      const lineText = joinTokens(tokens.slice(j, i));
      const lineLen = lineText.length;

      // Early pruning: for multi-word lines, extending further left (smaller j)
      // will strictly increase lineLen. If it already exceeds maxLen, break immediately.
      if (!isSingleWord && lineLen > maxLen) {
        break;
      }

      if (dp[j] === Infinity) continue;

      const cost = evaluateLineCost(tokens, j, i, maxLen, minLen, opt);
      if (cost !== Infinity && dp[j] + cost < dp[i]) {
        dp[i] = dp[j] + cost;
        parent[i] = j;
      }
    }
  }

  // If DP found a valid partition
  if (dp[n] !== Infinity && parent[n] !== -1) {
    const resultLines: string[] = [];
    let curr = n;
    while (curr > 0) {
      const prev = parent[curr];
      // Defensive guard against corrupted state: prevents tokens.slice(-1, curr)
      if (prev === -1 || prev >= curr) {
        resultLines.unshift(joinTokens(tokens.slice(0, curr)));
        break;
      }
      resultLines.unshift(joinTokens(tokens.slice(prev, curr)));
      curr = prev;
    }
    return resultLines;
  }

  // Fallback greedy packing if DP fails under extreme constraints
  const lines: string[] = [];
  let currentWords: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const candidate = joinTokens([...currentWords, tokens[i]]);
    if (candidate.length <= maxLen) {
      currentWords.push(tokens[i]);
    } else {
      if (currentWords.length > 0) {
        // Prevent dangling short non-terminal words at line end
        const poppedWords: string[] = [];
        while (currentWords.length > 1) {
          const lastWord = currentWords[currentWords.length - 1].toLowerCase().replace(/[.,!?:;»"()…¿¡。！？，；：、]+$/g, '');
          if (DANGLES_AT_LINE_END.has(lastWord)) {
            poppedWords.unshift(currentWords.pop()!);
          } else {
            break;
          }
        }
        lines.push(joinTokens(currentWords));
        currentWords = [...poppedWords, tokens[i]];
      } else {
        lines.push(tokens[i]);
        currentWords = [];
      }
    }
  }

  if (currentWords.length > 0) {
    lines.push(joinTokens(currentWords));
  }

  return lines;
}

/**
 * Process text and format into accurate subtitle lines.
 */
export function formatSubtitles(
  text: string,
  options: SubtitleFormatOptions = {}
): string {
  const {
    maxLen = 25,
    minLen = 12,
    enableVisualOpt = true,
    visualOptStart = 20,
    visualOptEnd = 24
  } = options;

  if (!text || !text.trim()) return '';

  const normalized = cleanTranscriptText(text);
  const rawParagraphs = normalized.split(/\n+/).map(p => p.trim()).filter(Boolean);

  const finalLines: string[] = [];

  for (const paragraph of rawParagraphs) {
    if (paragraph.length <= maxLen) {
      finalLines.push(paragraph);
      continue;
    }

    // Split paragraph by full-stop sentence terminators (. ! ? … » 。 ！？)
    // Avoid false split after » when followed by lowercase attribution (e.g. » dijo)
    const sentenceChunks = paragraph
      .split(/(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÑÀÂÇÈÊËÎÏÔŒÙÛÜ¿¡«"'\d])|(?<=»)\s+(?=[A-ZÁÉÍÓÚÑÀÂÇÈÊËÎÏÔŒÙÛÜ¿¡\d])|(?<=[。！？])\s*/)
      .filter(Boolean);

    const paragraphLines: string[] = [];

    for (const sentence of sentenceChunks) {
      if (sentence.length <= maxLen) {
        paragraphLines.push(sentence);
      } else {
        const broken = dpBreakLines(sentence, maxLen, minLen, {
          maxLen,
          minLen,
          enableVisualOpt,
          visualOptStart,
          visualOptEnd
        });
        paragraphLines.push(...broken);
      }
    }

    // Post-processing within paragraph: Balance and merge any awkward trailing micro-lines
    const consolidated: string[] = [];
    for (let i = 0; i < paragraphLines.length; i++) {
      const current = paragraphLines[i].trim();
      if (!current) continue;

      // If current line is too short (< minLen) and can fit into previous line
      if (
        consolidated.length > 0 &&
        current.length < minLen &&
        (consolidated[consolidated.length - 1].length + 1 + current.length) <= maxLen
      ) {
        consolidated[consolidated.length - 1] = joinTokens([consolidated[consolidated.length - 1], current]);
      } else {
        consolidated.push(current);
      }
    }

    finalLines.push(...consolidated);
  }

  return finalLines.join('\n');
}

/**
 * Format seconds into standard SRT timestamp format: HH:MM:SS,mmm
 */
export function formatSrtTimestamp(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const totalMs = Math.floor(safeSeconds * 1000);
  
  const ms = totalMs % 1000;
  const totalSecs = Math.floor(totalMs / 1000);
  const s = totalSecs % 60;
  const totalMins = Math.floor(totalSecs / 60);
  const m = totalMins % 60;
  const h = Math.floor(totalMins / 60);

  const pad = (n: number, z: number = 2) => String(n).padStart(z, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/**
 * Strip diacritics / accents and non-alphanumeric characters for robust Spanish/French token matching.
 * E.g., "está" and "esta" -> "esta", "creó" and "creo" -> "creo".
 */
export function normalizeWordToken(word: string): string {
  return (word || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Helper interface for token-level timestamp alignment
 */
interface AlignedWordToken {
  word: string;
  cleanWord: string;
  start: number;
  end: number;
}

/**
 * Compute subtitle cues with start and end timestamps.
 * Prioritizes real timestamps from Gladia utterances/words; falls back to strictly bounded proportional timing.
 */
export function computeCues(
  text: string,
  audioDuration?: number,
  utterances?: Utterance[]
): Cue[] {
  if (!text || !text.trim()) return [];

  const lines = text
    .normalize('NFC')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const maxDuration = (audioDuration && audioDuration > 0 && isFinite(audioDuration))
    ? audioDuration
    : undefined;

  // Strategy 1: Real timestamp alignment from Gladia utterances/words
  if (utterances && utterances.length > 0) {
    const wordTokens: AlignedWordToken[] = [];
    for (const u of utterances) {
      if (u.words && u.words.length > 0) {
        for (const w of u.words) {
          wordTokens.push({
            word: w.word,
            cleanWord: normalizeWordToken(w.word),
            start: w.start,
            end: w.end
          });
        }
      } else if (u.text) {
        const uWords = u.text.split(/\s+/).filter(Boolean);
        const uDur = Math.max(0.1, u.end - u.start);
        const step = uDur / uWords.length;
        for (let wi = 0; wi < uWords.length; wi++) {
          wordTokens.push({
            word: uWords[wi],
            cleanWord: normalizeWordToken(uWords[wi]),
            start: u.start + wi * step,
            end: u.start + (wi + 1) * step
          });
        }
      }
    }

    if (wordTokens.length > 0) {
      // Pass 1: Find candidate matches and anchor points for each line
      interface LineMatch {
        start: number;
        end: number;
      }
      const rawMatches: (LineMatch | null)[] = new Array(lines.length).fill(null);
      let currentWordIdx = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineWords = line
          .split(/\s+/)
          .map(normalizeWordToken)
          .filter(Boolean);

        let matchStartIdx = -1;
        let matchEndIdx = -1;

        if (lineWords.length > 0) {
          // Look ahead in wordTokens with multi-word anchor stabilization
          const searchLimit = Math.min(wordTokens.length, currentWordIdx + 45);

          // 1. Primary search: attempt to match lineWords[0]
          for (let wi = currentWordIdx; wi < searchLimit; wi++) {
            if (wordTokens[wi].cleanWord === lineWords[0]) {
              if (lineWords.length > 1 && wi + 1 < wordTokens.length) {
                if (wordTokens[wi + 1].cleanWord === lineWords[1] || wordTokens[wi].cleanWord.length >= 4) {
                  matchStartIdx = wi;
                  break;
                }
                if (matchStartIdx === -1) {
                  matchStartIdx = wi;
                }
              } else {
                matchStartIdx = wi;
                break;
              }
            }
          }

          // 2. Secondary fallback: if lineWords[0] was omitted or changed, search for distinctive words (>= 4 chars)
          if (matchStartIdx === -1 && lineWords.length > 1) {
            for (let lw = 1; lw < Math.min(lineWords.length, 4); lw++) {
              const target = lineWords[lw];
              if (target.length >= 4) {
                for (let wi = currentWordIdx; wi < searchLimit; wi++) {
                  if (wordTokens[wi].cleanWord === target) {
                    matchStartIdx = Math.max(currentWordIdx, wi - lw);
                    break;
                  }
                }
                if (matchStartIdx !== -1) break;
              }
            }
          }

          if (matchStartIdx !== -1) {
            const lastWordTarget = lineWords[lineWords.length - 1];
            const endSearchLimit = Math.min(wordTokens.length, matchStartIdx + lineWords.length + 15);
            for (let wi = matchStartIdx + lineWords.length - 1; wi < endSearchLimit; wi++) {
              if (wordTokens[wi]?.cleanWord === lastWordTarget) {
                matchEndIdx = wi;
                break;
              }
            }
            if (matchEndIdx === -1) {
              matchEndIdx = Math.min(wordTokens.length - 1, matchStartIdx + lineWords.length - 1);
            }
          }
        }

        if (matchStartIdx !== -1 && matchEndIdx !== -1 && matchEndIdx >= matchStartIdx) {
          rawMatches[i] = {
            start: wordTokens[matchStartIdx].start,
            end: Math.max(wordTokens[matchStartIdx].start + 0.3, wordTokens[matchEndIdx].end)
          };
          currentWordIdx = matchEndIdx + 1;
        }
      }

      // Pass 2: Build final monotonic cues, interpolating unmatched lines between surrounding anchors
      const cues: Cue[] = [];
      let i = 0;
      let prevEndTime = 0;

      while (i < lines.length) {
        if (rawMatches[i]) {
          const match = rawMatches[i]!;
          const cueStart = Math.max(prevEndTime, match.start);
          const cueEnd = Math.max(cueStart + 0.3, match.end);
          cues.push({
            index: i + 1,
            start: cueStart,
            end: cueEnd,
            text: lines[i]
          });
          prevEndTime = cueEnd;
          i++;
        } else {
          // Identify contiguous block of unmatched lines [i ... nextAnchorIdx - 1]
          let nextAnchorIdx = i + 1;
          while (nextAnchorIdx < lines.length && !rawMatches[nextAnchorIdx]) {
            nextAnchorIdx++;
          }

          const gapStart = prevEndTime;
          const nextAnchorStart = nextAnchorIdx < lines.length ? rawMatches[nextAnchorIdx]!.start : undefined;
          const unmatchedLines = lines.slice(i, nextAnchorIdx);
          const totalGapChars = unmatchedLines.reduce((sum, l) => sum + Math.max(1, l.length), 0);

          let gapEnd: number;
          if (nextAnchorStart !== undefined && nextAnchorStart > gapStart + 0.3) {
            gapEnd = nextAnchorStart;
          } else if (maxDuration && maxDuration > gapStart) {
            gapEnd = Math.min(maxDuration, gapStart + totalGapChars * 0.065 + 0.5);
          } else {
            gapEnd = gapStart + totalGapChars * 0.065 + 0.5;
          }

          const totalWindow = Math.max(0.3 * unmatchedLines.length, gapEnd - gapStart);
          let cursor = gapStart;

          for (let k = 0; k < unmatchedLines.length; k++) {
            const line = unmatchedLines[k];
            const lineFraction = Math.max(1, line.length) / totalGapChars;
            const lineDur = Math.max(0.3, totalWindow * lineFraction);
            const cueStart = cursor;
            const cueEnd = cueStart + lineDur;
            cursor = cueEnd;

            cues.push({
              index: i + k + 1,
              start: cueStart,
              end: cueEnd,
              text: line
            });
          }

          prevEndTime = cursor;
          i = nextAnchorIdx;
        }
      }

      // Final pass: clamp to maxDuration if strictly bounded
      if (maxDuration) {
        for (const cue of cues) {
          if (cue.start >= maxDuration) {
            cue.start = Math.max(0, maxDuration - 0.2);
          }
          if (cue.end > maxDuration) {
            cue.end = maxDuration;
          }
        }
      }

      return cues;
    }
  }

  // Strategy 2: Bounded proportional timing across audio duration
  const totalChars = lines.reduce((sum, l) => sum + l.length, 0) || 1;
  const cues: Cue[] = [];

  if (maxDuration) {
    const totalGap = (lines.length - 1) * 0.05;
    const availableDur = Math.max(0.5, maxDuration - totalGap);
    let curTime = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cueDur = Math.max(0.2, (line.length / totalChars) * availableDur);
      const startTime = curTime;
      let endTime = startTime + cueDur;

      if (endTime > maxDuration) {
        endTime = maxDuration;
      }

      cues.push({
        index: i + 1,
        start: startTime,
        end: endTime,
        text: line
      });

      curTime = Math.min(maxDuration, endTime + 0.05);
    }
  } else {
    // Standard comfortable speech reading speed (~15 characters/second)
    let curTime = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cueDur = Math.max(1.5, Math.min(6.0, line.length * 0.07 + 0.5));
      const startTime = curTime;
      const endTime = startTime + cueDur;

      cues.push({
        index: i + 1,
        start: startTime,
        end: endTime,
        text: line
      });

      curTime = endTime + 0.06;
    }
  }

  return cues;
}

/**
 * Universal browser file download helper.
 */
export function downloadBlob(
  content: string,
  filename: string,
  mimeType: string = 'text/plain;charset=utf-8'
): void {
  if (!content) return;
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  // Add UTF-8 BOM (\uFEFF) for text exports so media players/editors render accents properly
  const contentWithBom = content.startsWith('\uFEFF') ? content : '\uFEFF' + content;
  const blob = new Blob([contentWithBom], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  const sanitizedBase = (filename || 'export')
    .replace(/[/\\?%*:|"<>]+/g, '_')
    .replace(/[\r\n\x00-\x1F\x7F]+/g, '')
    .trim() || 'export';

  link.download = sanitizedBase;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate standard SRT subtitle content from multiline text.
 */
export function generateSrtContent(
  text: string,
  audioDuration?: number,
  utterances?: Utterance[]
): string {
  const cues = computeCues(text, audioDuration, utterances);
  if (cues.length === 0) return '';

  return cues
    .map(cue => `${cue.index}\n${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}\n${cue.text}`)
    .join('\n\n') + '\n';
}

/**
 * Trigger download of SRT file in the browser.
 */
export function downloadSrtFile(
  text: string,
  filename: string = 'subtitles.srt',
  audioDuration?: number,
  utterances?: Utterance[]
): void {
  const srtContent = generateSrtContent(text, audioDuration, utterances);
  if (!srtContent) return;

  const cleanFilename = filename.toLowerCase().endsWith('.srt')
    ? filename
    : `${filename.replace(/\.[^/.]+$/, '') || 'subtitles'}.srt`;

  downloadBlob(srtContent, cleanFilename);
}

/**
 * Generate readable timestamped TXT transcript content with line indices and time intervals.
 */
export function generateTxtContent(
  text: string,
  audioDuration?: number,
  utterances?: Utterance[]
): string {
  const cues = computeCues(text, audioDuration, utterances);
  if (cues.length === 0) return '';

  return cues
    .map(cue => `${cue.index}. [${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}] ${cue.text}`)
    .join('\n') + '\n';
}

/**
 * Trigger download of timestamped TXT file in the browser.
 */
export function downloadTxtFile(
  text: string,
  filename: string = 'subtitles.txt',
  audioDuration?: number,
  utterances?: Utterance[]
): void {
  const txtContent = generateTxtContent(text, audioDuration, utterances);
  if (!txtContent) return;

  const cleanFilename = filename.toLowerCase().endsWith('.txt')
    ? filename
    : `${filename.replace(/\.[^/.]+$/, '') || 'subtitles'}.txt`;

  downloadBlob(txtContent, cleanFilename);
}
