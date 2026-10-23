/**
 * Intelligent subtitle line-breaking and formatting engine tailored for Spanish & multi-language speech-to-text transcripts.
 */

export interface SubtitleFormatOptions {
  maxLen?: number;
  minLen?: number;
  enableVisualOpt?: boolean;
  visualOptStart?: number;
  visualOptEnd?: number;
}

// Spanish, French & common short non-terminal words that shouldn't be orphaned at line ends
const NON_TERMINAL_WORDS = new Set([
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
  'ne', 'lui', "s'", "m'", "t'", "n'", "j'", "c'"
]);

/**
 * Clean and normalize Spanish & French quotation marks, inverted marks and extra spaces.
 */
export function cleanTranscriptText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Normalize quotes
    .replace(/<<\s*/g, '« ')
    .replace(/\s*>>/g, ' »')
    // Remove duplicate consecutive spaces
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Measure effective length of a line (trimmed).
 */
export function getLineLength(line: string): number {
  return line.trim().length;
}

/**
 * Score a potential break position (higher score = better place to break line).
 */
function scoreBreakPoint(
  words: string[],
  splitIndex: number,
  maxLen: number,
  minLen: number,
  targetMidpoint: number,
  opt?: SubtitleFormatOptions
): number {
  const line1 = words.slice(0, splitIndex).join(' ');
  const line2 = words.slice(splitIndex).join(' ');

  const len1 = line1.length;
  const len2 = line2.length;

  if (len1 > maxLen || len2 > maxLen) {
    return -10000; // invalid break
  }

  let score = 100;

  // 1. Balance penalty (prefer splitting closer to target midpoint for symmetric subtitles)
  const balanceDiff = Math.abs(len1 - targetMidpoint);
  score -= balanceDiff * 2;

  // 2. Minimum length penalty
  if (len1 < minLen) score -= (minLen - len1) * 8;
  if (len2 < minLen) score -= (minLen - len2) * 8;

  // 3. Punctuation bonus at split position (Spanish & Latin punctuation)
  const prevWord = words[splitIndex - 1] || '';
  const lastChar = prevWord.slice(-1);

  if (['.', '!', '?', '…', '»', '”'].includes(lastChar)) {
    score += 50;
  } else if ([',', ';', ':', '—', ')', '»', '”'].includes(lastChar)) {
    score += 35;
  } else if (prevWord.endsWith('-')) {
    score += 10;
  }

  // 4. Grammar bonus (conjunctions or clauses at the start of line 2)
  // Strip opening quotes and Spanish inverted punctuation (¿, ¡)
  const nextWord = (words[splitIndex] || '').toLowerCase().replace(/^[«"'(¿¡]/, '');
  if ([
    // Spanish conjunctions & subordinate markers
    'y', 'e', 'o', 'u', 'pero', 'sino', 'porque', 'pues', 'como', 'cuando', 'donde', 'si', 'aunque', 'para', 'que', 'quien', 'ya', 'así',
    // French conjunctions
    'et', 'mais', 'car', 'donc', 'parce', 'puisque', 'lorsque', 'quand', 'afin', 'pour', 'qui'
  ].includes(nextWord)) {
    score += 20;
  }

  // 5. Grammar penalty: never leave dangling articles/prepositions/conjunctions at the end of line 1
  const prevCleanWord = prevWord.toLowerCase().replace(/[.,!?:;»"()…¿¡]+$/g, '');
  if (NON_TERMINAL_WORDS.has(prevCleanWord)) {
    score -= 40;
  }

  // Extra penalty if next line begins with a standalone or misplaced punctuation mark
  if (/^[.,!?:;»”)]/.test(words[splitIndex])) {
    score -= 100;
  }

  // 6. Visual optimization check
  if (opt?.enableVisualOpt && opt.visualOptStart !== undefined && opt.visualOptEnd !== undefined) {
    const vStart = opt.visualOptStart;
    const vEnd = opt.visualOptEnd;
    if (len1 >= vStart && len1 <= vEnd) score -= 30;
    if (len2 >= vStart && len2 <= vEnd) score -= 30;
  }

  return score;
}

/**
 * Split a single long sentence / clause into balanced, natural subtitle lines.
 */
function splitLongClause(
  clause: string,
  maxLen: number,
  minLen: number,
  opt?: SubtitleFormatOptions
): string[] {
  const clean = clause.trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  // Tokenize into words
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [clean];

  // Check if we can split in 2 parts cleanly
  let bestSplit = -1;
  let bestScore = -Infinity;
  const targetMidpoint = Math.round(clean.length / 2);

  for (let i = 1; i < words.length; i++) {
    const score = scoreBreakPoint(words, i, maxLen, minLen, targetMidpoint, opt);
    if (score > bestScore) {
      bestScore = score;
      bestSplit = i;
    }
  }

  if (bestSplit > 0 && bestScore > -5000) {
    const part1 = words.slice(0, bestSplit).join(' ');
    const part2 = words.slice(bestSplit).join(' ');

    const result: string[] = [];
    if (part1.length <= maxLen) {
      result.push(part1);
    } else {
      result.push(...splitLongClause(part1, maxLen, minLen, opt));
    }

    if (part2.length <= maxLen) {
      result.push(part2);
    } else {
      result.push(...splitLongClause(part2, maxLen, minLen, opt));
    }

    return result;
  }

  // Fallback greedy word-by-word packing with smart punctuation preference
  const lines: string[] = [];
  let currentWords: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const candidate = [...currentWords, words[i]].join(' ');
    if (candidate.length <= maxLen) {
      currentWords.push(words[i]);
    } else {
      if (currentWords.length > 0) {
        // Prevent dangling short non-terminal words (prepositions, articles, conjunctions) at line end
        const poppedWords: string[] = [];
        while (currentWords.length > 1) {
          const lastWord = currentWords[currentWords.length - 1].toLowerCase().replace(/[.,!?:;»"()…]+$/g, '');
          if (NON_TERMINAL_WORDS.has(lastWord)) {
            poppedWords.unshift(currentWords.pop()!);
          } else {
            break;
          }
        }
        lines.push(currentWords.join(' '));
        currentWords = [...poppedWords, words[i]];
      } else {
        lines.push(words[i]);
        currentWords = [];
      }
    }
  }

  if (currentWords.length > 0) {
    lines.push(currentWords.join(' '));
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
    // If the paragraph is already short enough, keep it
    if (paragraph.length <= maxLen) {
      finalLines.push(paragraph);
      continue;
    }

    // Split paragraph by full-stop sentence terminators (. ! ? … »)
    const sentenceChunks = paragraph.split(/(?<=[.!?…»])\s+/).filter(Boolean);

    for (const sentence of sentenceChunks) {
      if (sentence.length <= maxLen) {
        finalLines.push(sentence);
        continue;
      }

      // Split sentence by secondary punctuation (, ; : —)
      const clauses = sentence.split(/(?<=[,;:—])\s+/).filter(Boolean);

      let currentAccumulator = '';

      for (const clause of clauses) {
        if (clause.length <= maxLen) {
          const potentialMerge = currentAccumulator ? `${currentAccumulator} ${clause}` : clause;
          if (potentialMerge.length <= maxLen) {
            currentAccumulator = potentialMerge;
          } else {
            if (currentAccumulator) {
              finalLines.push(currentAccumulator);
            }
            currentAccumulator = clause;
          }
        } else {
          if (currentAccumulator) {
            finalLines.push(currentAccumulator);
            currentAccumulator = '';
          }
          const broken = splitLongClause(clause, maxLen, minLen, {
            maxLen,
            minLen,
            enableVisualOpt,
            visualOptStart,
            visualOptEnd
          });
          finalLines.push(...broken);
        }
      }

      if (currentAccumulator) {
        finalLines.push(currentAccumulator);
      }
    }
  }

  // Post-processing: Balance and merge any awkward trailing micro-lines
  const consolidated: string[] = [];
  for (let i = 0; i < finalLines.length; i++) {
    const current = finalLines[i].trim();
    if (!current) continue;

    // If current line is too short (< minLen) and can fit into previous line
    if (
      consolidated.length > 0 &&
      current.length < minLen &&
      (consolidated[consolidated.length - 1].length + 1 + current.length) <= maxLen
    ) {
      consolidated[consolidated.length - 1] += ' ' + current;
    } else {
      consolidated.push(current);
    }
  }

  return consolidated.join('\n');
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
 * Generate standard SRT subtitle content from multiline text.
 */
export function generateSrtContent(
  text: string,
  audioDuration?: number
): string {
  if (!text || !text.trim()) return '';

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';

  const totalChars = lines.reduce((sum, l) => sum + l.length, 0) || 1;
  const hasAudioDuration = audioDuration && audioDuration > 0 && isFinite(audioDuration);

  let currentTime = 0;
  const srtBlocks: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let duration: number;

    if (hasAudioDuration) {
      // Proportional timing across total audio duration
      const rawDuration = (line.length / totalChars) * (audioDuration as number);
      duration = Math.max(1.2, rawDuration);
    } else {
      // Estimated duration based on comfortable French reading speed (~13 chars/sec + base pause)
      duration = Math.max(1.8, Math.min(6.0, line.length * 0.12 + 0.6));
    }

    const startTime = currentTime;
    const endTime = startTime + duration;

    srtBlocks.push(
      `${i + 1}\n${formatSrtTimestamp(startTime)} --> ${formatSrtTimestamp(endTime)}\n${line}`
    );

    // 60ms gap between consecutive subtitle blocks
    currentTime = endTime + 0.06;
  }

  return srtBlocks.join('\n\n') + '\n';
}

/**
 * Trigger download of SRT file in the browser.
 */
export function downloadSrtFile(
  text: string,
  filename: string = 'subtitles.srt',
  audioDuration?: number
): void {
  const srtContent = generateSrtContent(text, audioDuration);
  if (!srtContent) return;

  const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  
  const sanitizedBase = (filename || 'subtitles')
    .replace(/[/\\?%*:|"<>]+/g, '_')
    .replace(/[\r\n\x00-\x1F\x7F]+/g, '')
    .trim() || 'subtitles';

  const cleanFilename = sanitizedBase.toLowerCase().endsWith('.srt')
    ? sanitizedBase
    : `${sanitizedBase.replace(/\.[^/.]+$/, '') || 'subtitles'}.srt`;

  link.download = cleanFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate readable timestamped TXT transcript content with line indices and time intervals.
 */
export function generateTxtContent(
  text: string,
  audioDuration?: number
): string {
  if (!text || !text.trim()) return '';

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';

  const totalChars = lines.reduce((sum, l) => sum + l.length, 0) || 1;
  const hasAudioDuration = audioDuration && audioDuration > 0 && isFinite(audioDuration);

  let currentTime = 0;
  const txtBlocks: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let duration: number;

    if (hasAudioDuration) {
      const rawDuration = (line.length / totalChars) * (audioDuration as number);
      duration = Math.max(1.2, rawDuration);
    } else {
      duration = Math.max(1.8, Math.min(6.0, line.length * 0.12 + 0.6));
    }

    const startTime = currentTime;
    const endTime = startTime + duration;

    txtBlocks.push(
      `${i + 1}. [${formatSrtTimestamp(startTime)} --> ${formatSrtTimestamp(endTime)}] ${line}`
    );

    currentTime = endTime + 0.06;
  }

  return txtBlocks.join('\n') + '\n';
}

/**
 * Trigger download of timestamped TXT file in the browser.
 */
export function downloadTxtFile(
  text: string,
  filename: string = 'subtitles.txt',
  audioDuration?: number
): void {
  const txtContent = generateTxtContent(text, audioDuration);
  if (!txtContent) return;

  const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  
  const sanitizedBase = (filename || 'subtitles')
    .replace(/[/\\?%*:|"<>]+/g, '_')
    .replace(/[\r\n\x00-\x1F\x7F]+/g, '')
    .trim() || 'subtitles';

  const cleanFilename = sanitizedBase.toLowerCase().endsWith('.txt')
    ? sanitizedBase
    : `${sanitizedBase.replace(/\.[^/.]+$/, '') || 'subtitles'}.txt`;

  link.download = cleanFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
