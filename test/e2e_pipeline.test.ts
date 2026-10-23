import { describe, it, expect } from "vitest";
import { getCorrectionPrompt } from "../src/config/prompts";
import {
  cleanTranscriptText,
  formatSubtitles,
  generateSrtContent,
  generateTxtContent,
  formatSrtTimestamp
} from "../src/utils/subtitleFormatter";

describe("End-to-End Pipeline Integration (端到端全流程模拟串联测试)", () => {
  it("Case 2.1: Full Pipeline (Audio ASR -> Gemini Dual-Standard -> Subtitle Breaking -> SRT Export)", () => {
    // Step 1: Simulate ASR Speech-to-Text output (Text A) with common speech recognition flaws
    const mockAsrTextA = "bueno hermanos dios ha dicho en juan tres dieciseis porque de tal manera amo dios al mundo";

    // Step 2: Reference Scripture Script (Text B) with correct theology, accents, and Latin quotes
    const referenceScriptB = "Bueno hermanos, Dios dice en Juan 3:16: «Porque de tal manera amó Dios al mundo».";

    // Step 3: Build Prompt using the production prompt generator
    const prompt = getCorrectionPrompt('es', mockAsrTextA, referenceScriptB, 'es', {
      enableLineBreaks: true,
      maxLineLength: 25,
      minLineLength: 10,
      enableVisualOptimization: true,
      visualOptStart: 20,
      visualOptEnd: 24
    });

    expect(prompt).toContain("Mayúscula Reverencial / Divina");
    expect(prompt).toContain(mockAsrTextA);
    expect(prompt).toContain(referenceScriptB);

    // Step 4: Simulate Gemini response conforming to the JSON schema
    const simulatedGeminiJson = {
      correctedText: "Bueno hermanos, Dios dice en Juan 3:16:\n«Porque de tal manera amó Dios al mundo».",
      differences: "Palabras modificadas: se corrigió 'ha dicho' por 'dice' conforme al guion original."
    };

    expect(simulatedGeminiJson.correctedText).toBeDefined();
    expect(simulatedGeminiJson.differences).toBeDefined();

    // Step 5: Process through the intelligent subtitle breaking engine
    const formattedSubtitles = formatSubtitles(simulatedGeminiJson.correctedText, {
      maxLen: 25,
      minLen: 10,
      enableVisualOpt: true,
      visualOptStart: 20,
      visualOptEnd: 24
    });

    const lines = formattedSubtitles.split("\n").map(l => l.trim()).filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);

    // Check that each line adheres to max character constraints
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(30);
      // No dangling prepositions at line ends
      const lastWord = line.split(" ").pop()?.toLowerCase();
      expect(["de", "en", "para", "la", "el", "a"]).not.toContain(lastWord);
    }

    // Step 6: Generate valid SRT subtitle blocks with audio duration of 8.5 seconds
    const srtOutput = generateSrtContent(formattedSubtitles, 8.5);
    expect(srtOutput).toContain("1\n");
    expect(srtOutput).toContain("2\n");
    expect(srtOutput).toMatch(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/);
    expect(srtOutput).toContain("Bueno hermanos");

    // Step 7: Generate timestamped TXT transcript
    const txtOutput = generateTxtContent(formattedSubtitles, 8.5);
    expect(txtOutput).toContain("1. [");
    expect(txtOutput).toContain("2. [");

    // Step 8: Validate clean filename sanitization for download
    const rawFilename = "sermon_juan_3:16/test?.mp3";
    const cleanFilename = (rawFilename || "subtitles")
      .replace(/[/\\?%*:|"<>]+/g, "_")
      .replace(/[\r\n\x00-\x1F\x7F]+/g, "")
      .trim();

    expect(cleanFilename).not.toContain(":");
    expect(cleanFilename).not.toContain("/");
    expect(cleanFilename).not.toContain("?");
  });

  it("Case 2.2: Text-Only Fast Pipeline (Direct Text B Proofreading and Formatting)", () => {
    const rawText = "El Señor es mi pastor, nada me faltará. En lugares de delicados pastos me hará descansar.";

    // Format directly
    const formatted = formatSubtitles(rawText, { maxLen: 28, minLen: 10 });
    const lines = formatted.split("\n").map(l => l.trim()).filter(Boolean);

    expect(lines.length).toBeGreaterThanOrEqual(2);

    // Generate SRT
    const srt = generateSrtContent(formatted, 6.0);
    expect(srt).toContain("1\n");
    expect(srt).toContain("El Señor es mi pastor,");
  });
});
