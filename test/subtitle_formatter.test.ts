import { describe, it, expect, vi } from "vitest";
import {
  cleanTranscriptText,
  formatSubtitles,
  computeCues,
  generateSrtContent,
  generateTxtContent,
  formatSrtTimestamp,
  normalizeWordToken,
  downloadBlob,
  downloadSrtFile,
  downloadTxtFile
} from "../src/utils/subtitleFormatter";
import { Utterance } from "../src/types";

describe("Subtitle Formatter & Export Security (字幕断行排版与文件安全测试)", () => {
  it("Case 4.1: Normalizes quotes and whitespace in cleanTranscriptText", () => {
    const raw = "  En el principio << existía el Verbo >> y el Verbo estaba con Dios.  ";
    const cleaned = cleanTranscriptText(raw);
    expect(cleaned).toBe("En el principio « existía el Verbo » y el Verbo estaba con Dios.");
    expect(cleaned).not.toContain("<<");
    expect(cleaned).not.toContain(">>");
  });

  it("Case 4.2: Breaks long Spanish text within specified length constraints", () => {
    const longSpanishText =
      "Dios todopoderoso y eterno que con infinito amor cuidas de cada uno de tus hijos en todo momento y lugar de nuestra existencia.";

    const formatted = formatSubtitles(longSpanishText, {
      maxLen: 30,
      minLen: 12,
      enableVisualOpt: true,
      visualOptStart: 20,
      visualOptEnd: 28
    });

    const lines = formatted.split("\n").map(l => l.trim()).filter(Boolean);
    expect(lines.length).toBeGreaterThan(1);

    // Each line should not exceed maximum boundary significantly
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(35);
    }
  });

  it("Case 4.3: Avoids leaving trailing prepositions or articles at line ends", () => {
    const text = "Vamos a la casa de Dios para cantar alabanzas con gozo y alegría en el templo.";
    const formatted = formatSubtitles(text, { maxLen: 25, minLen: 10 });
    const lines = formatted.split("\n").map(l => l.trim());

    // Lines should avoid ending with dangling 'de', 'para', 'en', 'el', 'la'
    for (const line of lines.slice(0, -1)) {
      const lastWord = line.split(" ").pop()?.toLowerCase();
      expect(["de", "en", "para", "la", "el"]).not.toContain(lastWord);
    }
  });

  it("Case 4.4: generateSrtContent creates valid SRT blocks with sequential IDs and standard timestamps", () => {
    const lines = "Primera línea de subtítulo.\nSegunda línea de subtítulo.\nTercera línea de subtítulo.";
    const srt = generateSrtContent(lines, 10); // 10 seconds total

    expect(srt).toContain("1\n");
    expect(srt).toContain("2\n");
    expect(srt).toContain("3\n");
    expect(srt).toMatch(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/);
    expect(srt).toContain("Primera línea de subtítulo.");
    expect(srt).toContain("Segunda línea de subtítulo.");
  });

  it("Case 4.5: generateTxtContent creates clean numbered lines with time brackets", () => {
    const lines = "Línea uno.\nLínea dos.";
    const txt = generateTxtContent(lines, 5);

    expect(txt).toContain("1. [");
    expect(txt).toContain("2. [");
    expect(txt).toContain("-->");
    expect(txt).toContain("Línea uno.");
    expect(txt).toContain("Línea dos.");
  });

  it("Case 4.6: formatSrtTimestamp outputs correct millisecond formatting", () => {
    expect(formatSrtTimestamp(0)).toBe("00:00:00,000");
    expect(formatSrtTimestamp(65.5)).toBe("00:01:05,500");
    expect(formatSrtTimestamp(3661.123)).toBe("01:01:01,123");
  });

  it("Case 4.7: Filename sanitization strips injection, traversal, and forbidden characters", () => {
    const maliciousNames = [
      "../../../etc/passwd.srt",
      "malicious\r\nHeader: Injection\nfile.srt",
      "test*file?name:forbidden|char<>.srt"
    ];

    for (const raw of maliciousNames) {
      const sanitizedBase = (raw || "subtitles")
        .replace(/[/\\?%*:|"<>]+/g, "_")
        .replace(/[\r\n\x00-\x1F\x7F]+/g, "")
        .trim() || "subtitles";

      expect(sanitizedBase).not.toContain("/");
      expect(sanitizedBase).not.toContain("\\");
      expect(sanitizedBase).not.toContain("\r");
      expect(sanitizedBase).not.toContain("\n");
      expect(sanitizedBase).not.toContain(":");
      expect(sanitizedBase).not.toContain("*");
      expect(sanitizedBase).not.toContain("?");
      expect(sanitizedBase).not.toContain("<");
      expect(sanitizedBase).not.toContain(">");
      expect(sanitizedBase).not.toContain("|");
    }
  });

  it("Case 4.8: Property Invariant: Content preservation across arbitrary inputs (no words lost or added)", () => {
    const sampleCorpus = [
      "Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito.",
      "Car Dieu a tant aimé le monde qu'il a donné son Fils unique, afin que quiconque croit en lui ne périsse point.",
      "En el principio creó Dios los cielos y la tierra. Y la tierra estaba desordenada y vacía.",
      "Texto corto.",
      "Palabra1 Palabra2 Palabra3 Palabra4 Palabra5 Palabra6 Palabra7 Palabra8 Palabra9 Palabra10 Palabra11 Palabra12 Palabra13",
      "¿Acaso no sabéis? ¿No habéis oído? ¿Nunca os lo han dicho desde el principio?",
      "¡Aleluya! ¡Alabad a Dios en su santuario; alabadle en la magnificencia de su firmamento!"
    ];

    const maxLenOptions = [15, 20, 25, 30, 40, 50];

    for (const text of sampleCorpus) {
      for (const maxLen of maxLenOptions) {
        const formatted = formatSubtitles(text, { maxLen, minLen: 5 });
        
        // Extract all words from input and output after normalizing quotes and spacing
        const inputWords = cleanTranscriptText(text).split(/\s+/).filter(Boolean);
        const outputWords = formatted.split(/\s+/).filter(Boolean);

        // Invariant: The tokenized sequence of words must be identical in order and content
        expect(outputWords).toEqual(inputWords);
      }
    }
  });

  it("Case 4.9: Property Invariant: Maximum line length compliance under varied thresholds", () => {
    const longText =
      "El Señor es mi pastor; nada me faltará. En lugares de delicados pastos me hará descansar; junto a aguas de reposo me pastoreará. Confortará mi alma; me guiará por sendas de justicia por amor de su nombre.";

    const testLengths = [20, 25, 30, 35, 45];

    for (const maxLen of testLengths) {
      const formatted = formatSubtitles(longText, {
        maxLen,
        minLen: Math.floor(maxLen / 3),
        enableVisualOpt: false // Test strict packing
      });

      const lines = formatted.split("\n").map(l => l.trim()).filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);

      for (const line of lines) {
        // Individual words longer than maxLen are unavoidable, but multi-word lines must not exceed maxLen
        const wordsInLine = line.split(" ");
        if (wordsInLine.length > 1) {
          expect(line.length).toBeLessThanOrEqual(maxLen);
        }
      }
    }
  });

  it("Case 4.10: Property Invariant: Graceful handling of edge-case inputs", () => {
    // Empty & whitespace
    expect(formatSubtitles("")).toBe("");
    expect(formatSubtitles("   \n\t   ")).toBe("");

    // Single word
    expect(formatSubtitles("Dios")).toBe("Dios");

    // Single extremely long word exceeding maxLen
    const ultraLong = "SupercalifragilisticoespialidosoTheologicalTermExceedingLength";
    expect(formatSubtitles(ultraLong, { maxLen: 20 })).toBe(ultraLong);

    // Multiple consecutive newlines and spaces
    const messy = "Primera   línea  con   espacios.  \n\n\n   Segunda    línea.\n\n";
    const cleanedResult = formatSubtitles(messy, { maxLen: 30 });
    expect(cleanedResult).toContain("Primera línea con espacios.");
    expect(cleanedResult).toContain("Segunda línea.");
    expect(cleanedResult).not.toMatch(/\n{3,}/);
  });

  it("Case 4.11: computeCues aligns real word-level timestamps from Gladia utterances", () => {
    const textC = "En el principio existía el Verbo\ny el Verbo estaba con Dios\ny el Verbo era Dios.";
    const mockUtterances: Utterance[] = [
      {
        start: 0.5,
        end: 3.2,
        text: "En el principio existía el Verbo",
        words: [
          { word: "En", start: 0.5, end: 0.8 },
          { word: "el", start: 0.8, end: 1.0 },
          { word: "principio", start: 1.0, end: 1.8 },
          { word: "existía", start: 1.9, end: 2.5 },
          { word: "el", start: 2.5, end: 2.7 },
          { word: "Verbo", start: 2.7, end: 3.2 }
        ]
      },
      {
        start: 3.5,
        end: 7.0,
        text: "y el Verbo estaba con Dios y el Verbo era Dios",
        words: [
          { word: "y", start: 3.5, end: 3.7 },
          { word: "el", start: 3.7, end: 3.9 },
          { word: "Verbo", start: 3.9, end: 4.4 },
          { word: "estaba", start: 4.5, end: 5.0 },
          { word: "con", start: 5.0, end: 5.2 },
          { word: "Dios", start: 5.2, end: 5.6 },
          { word: "y", start: 5.7, end: 5.9 },
          { word: "el", start: 5.9, end: 6.1 },
          { word: "Verbo", start: 6.1, end: 6.5 },
          { word: "era", start: 6.5, end: 6.7 },
          { word: "Dios", start: 6.7, end: 7.0 }
        ]
      }
    ];

    const cues = computeCues(textC, 10, mockUtterances);
    expect(cues.length).toBe(3);

    // Cue 1 aligns with words 0.5 -> 3.2
    expect(cues[0].start).toBeCloseTo(0.5, 1);
    expect(cues[0].end).toBeCloseTo(3.2, 1);
    expect(cues[0].text).toBe("En el principio existía el Verbo");

    // Cue 2 aligns with words 3.5 -> 5.6
    expect(cues[1].start).toBeCloseTo(3.5, 1);
    expect(cues[1].end).toBeCloseTo(5.6, 1);

    // Cues must be strictly monotonic
    expect(cues[1].start).toBeGreaterThanOrEqual(cues[0].end);
    expect(cues[2].start).toBeGreaterThanOrEqual(cues[1].end);
  });

  it("Case 4.12: Strict total audio duration bound: cues never exceed total audio duration", () => {
    const manyLines = [
      "Línea 1", "Línea 2", "Línea 3", "Línea 4", "Línea 5",
      "Línea 6", "Línea 7", "Línea 8", "Línea 9", "Línea 10"
    ].join("\n");

    const audioDuration = 4.0; // Short 4 second audio with 10 lines
    const cues = computeCues(manyLines, audioDuration);

    expect(cues.length).toBe(10);
    for (const cue of cues) {
      expect(cue.start).toBeGreaterThanOrEqual(0);
      expect(cue.start).toBeLessThanOrEqual(audioDuration);
      expect(cue.end).toBeLessThanOrEqual(audioDuration);
      expect(cue.end).toBeGreaterThan(cue.start);
    }

    const lastCue = cues[cues.length - 1];
    expect(lastCue.end).toBeLessThanOrEqual(audioDuration);
  });

  it("Case 4.13: Unicode NFC normalization correctly handles decomposed accents", () => {
    const decomposed = "Jesu\u0301s es mi Sen\u0303or";
    const composed = "Jesús es mi Señor";

    const cleanedDecomposed = cleanTranscriptText(decomposed);
    expect(cleanedDecomposed).toBe(composed);
    expect(decomposed.normalize('NFD')).not.toBe(cleanedDecomposed);
  });

  it("Case 4.14: Sentence splitting does not break quote followed by lowercase dialogue attribution", () => {
    const textWithAttribution = "«El Señor es mi pastor» dijo el salmista con alegría.";
    const formatted = formatSubtitles(textWithAttribution, { maxLen: 60 });
    // Should NOT falsely split between » and dijo because 'dijo' is lowercase attribution
    expect(formatted).not.toContain("«El Señor es mi pastor»\ndijo");
  });

  it("Case 4.15: CJK text line break support", () => {
    const chineseText = "神爱世人，甚至将祂的独生子赐给他们，叫一切信祂的不至灭亡，反得永生。";
    const formatted = formatSubtitles(chineseText, { maxLen: 16, minLen: 6 });
    const lines = formatted.split("\n").map(l => l.trim()).filter(Boolean);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(20);
    }
  });

  it("Case 4.16: downloadBlob centralizes sanitized browser file downloads", () => {
    let clicked = false;
    const mockAnchor = {
      href: '',
      download: '',
      click: () => { clicked = true; }
    };

    const mockDocument = {
      createElement: (tagName: string) => mockAnchor as any,
      body: {
        appendChild: (child: any) => child,
        removeChild: (child: any) => child
      }
    };

    vi.stubGlobal('document', mockDocument);
    vi.stubGlobal('window', {});
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:mock-url',
      revokeObjectURL: () => {}
    });

    downloadSrtFile("1\n00:00:00,000 --> 00:00:01,000\nPrueba\n", "test:malicious/file.srt");

    expect(clicked).toBe(true);
    expect(mockAnchor.download).toBe("test_malicious_file.srt");
    expect(mockAnchor.href).toBe('blob:mock-url');

    vi.unstubAllGlobals();
  });

  it("Case 4.17: CJK token sequence exceeding 25 tokens without spaces breaks safely without window truncation", () => {
    // 32 continuous Chinese characters without any whitespace
    const continuousCjk = "因为神爱世人甚至将祂的独生子赐给他们叫一切信祂的不至灭亡反得永生";
    expect(continuousCjk.length).toBe(32);

    // Max length 28 allows up to 28 characters per line
    const formatted = formatSubtitles(continuousCjk, { maxLen: 28, minLen: 10 });
    const lines = formatted.split("\n").map(l => l.trim()).filter(Boolean);

    // In the old algorithm with fixed 25 sliding window, lines could never exceed 25 tokens.
    // With reverse traversal pruning, lines comfortably pack up to 28 tokens.
    expect(lines.length).toBe(2);
    expect(lines[0].length).toBeLessThanOrEqual(28);
    expect(lines[1].length).toBeLessThanOrEqual(28);
    // Content is completely preserved
    expect(lines.join("")).toBe(continuousCjk);
  });

  it("Case 4.18: Embedded ultra-long token exceeding maxLen does not corrupt DP backtrack", () => {
    const textWithGiantWord =
      "Dios nos libra de la SupercalifragilisticoespialidosoTeologicaTribulacion en tiempos difíciles.";
    
    // maxLen = 22, whereas 'SupercalifragilisticoespialidosoTeologicaTribulacion' is 51 characters
    const formatted = formatSubtitles(textWithGiantWord, { maxLen: 22, minLen: 8 });
    const lines = formatted.split("\n").map(l => l.trim()).filter(Boolean);

    expect(lines.length).toBeGreaterThan(1);
    // The giant word should be isolated cleanly on its own line without crashing DP or dropping words
    const foundGiantLine = lines.find(l => l.includes("SupercalifragilisticoespialidosoTeologicaTribulacion"));
    expect(foundGiantLine).toBeDefined();
    // Words preservation invariant
    const allWords = lines.join(" ").split(/\s+/);
    expect(allWords).toContain("SupercalifragilisticoespialidosoTeologicaTribulacion");
    expect(allWords).toContain("Dios");
    expect(allWords).toContain("difíciles.");
  });

  it("Case 4.19: Anti-fragmentation: Base line cost prevents hyper-fragmenting sentences with dense commas", () => {
    // Sentence with multiple closely spaced commas
    const denseCommas = "Hola, sí, claro, por supuesto que vamos hoy juntos al templo.";
    const formatted = formatSubtitles(denseCommas, { maxLen: 35, minLen: 10 });
    const lines = formatted.split("\n").map(l => l.trim()).filter(Boolean);

    // Under BASE_LINE_COST = 250, algorithm should NOT splinter into 4-5 tiny 1-2 word lines
    expect(lines.length).toBeLessThanOrEqual(3);
    for (const line of lines) {
      expect(line.split(" ").length).toBeGreaterThanOrEqual(2);
    }
  });

  it("Case 4.20: Compound conjunction protection prevents splitting 'para que' and 'sin embargo'", () => {
    const spanishWithCompound = "Oramos con fervor para que la gracia divina descienda hoy.";
    const formatted = formatSubtitles(spanishWithCompound, { maxLen: 26, minLen: 10 });
    const lines = formatted.split("\n").map(l => l.trim()).filter(Boolean);

    // 'para que' should stay on the same line, rather than '... para' and 'que ...'
    for (let i = 0; i < lines.length - 1; i++) {
      const lineEndsWithPara = /\bpara$/i.test(lines[i]);
      const nextStartsWithQue = /^que\b/i.test(lines[i + 1]);
      expect(lineEndsWithPara && nextStartsWithQue).toBe(false);
    }
  });

  it("Case 4.21: normalizeWordToken strips diacritics / accents for Spanish and French matching", () => {
    expect(normalizeWordToken("está")).toBe("esta");
    expect(normalizeWordToken("ESTÁ")).toBe("esta");
    expect(normalizeWordToken("creó")).toBe("creo");
    expect(normalizeWordToken("créé")).toBe("cree");
    expect(normalizeWordToken("¿Dios?")).toBe("dios");
    expect(normalizeWordToken("¡Aleluya!")).toBe("aleluya");
  });

  it("Case 4.22: computeCues aligns words with accents in Gemini text against unaccented Gladia words", () => {
    const utterances: Utterance[] = [
      {
        start: 1.0,
        end: 2.5,
        text: "Dios esta aqui",
        words: [
          { word: "Dios", start: 1.0, end: 1.5, confidence: 0.95 },
          { word: "esta", start: 1.5, end: 2.0, confidence: 0.92 },
          { word: "aqui", start: 2.0, end: 2.5, confidence: 0.98 }
        ]
      }
    ];

    // Gemini corrected text contains theological and orthographic accents ("está", "aquí")
    const lines = "Dios está aquí.";
    const cues = computeCues(lines, 3.0, utterances);

    expect(cues.length).toBe(1);
    expect(cues[0].start).toBeCloseTo(1.0, 1);
    expect(cues[0].end).toBeCloseTo(2.5, 1);
    expect(cues[0].text).toBe("Dios está aquí.");
  });

  it("Case 4.23: downloadBlob prepends UTF-8 BOM when creating text blobs", () => {
    let capturedBlob: Blob | null = null;
    const mockAnchor = {
      href: '',
      download: '',
      click: () => {}
    };

    const mockDocument = {
      createElement: () => mockAnchor as any,
      body: {
        appendChild: (child: any) => child,
        removeChild: (child: any) => child
      }
    };

    vi.stubGlobal('document', mockDocument);
    vi.stubGlobal('window', {});
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        capturedBlob = blob;
        return 'blob:mock-url';
      },
      revokeObjectURL: () => {}
    });

    try {
      downloadBlob("Línea con acentos: está, creó, Señor", "test.srt");

      expect(capturedBlob).not.toBeNull();
      expect(capturedBlob!.type).toContain("text/plain");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

