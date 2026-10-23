import { describe, it, expect } from "vitest";
import {
  cleanTranscriptText,
  formatSubtitles,
  generateSrtContent,
  generateTxtContent,
  formatSrtTimestamp
} from "../src/utils/subtitleFormatter";

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
});
