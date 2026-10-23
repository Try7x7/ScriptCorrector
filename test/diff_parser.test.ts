import { describe, it, expect } from "vitest";

// Diff & JSON output parser mirroring App.tsx's runGemini output processing
function parseGeminiDiffOutput(responseText: string): {
  correctedText: string;
  differences: string;
} {
  let cleanText = responseText.trim();
  if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  let result: any = null;
  try {
    result = JSON.parse(cleanText);
  } catch (firstErr) {
    const match = cleanText.match(/\{[\s\S]*\}/);
    if (match) {
      result = JSON.parse(match[0]);
    } else {
      // Fallback
      return {
        correctedText: responseText,
        differences: "差异报告解析失败，已直接呈现校正文本。请检查内容格式。"
      };
    }
  }

  return {
    correctedText: result.correctedText || "",
    differences: result.differences || ""
  };
}

describe("Gemini Output JSON Resilience & Diff Parsing (大模型JSON鲁棒性与差异解析测试)", () => {
  it("Case 3.1: Parses clean standard JSON object", () => {
    const raw = JSON.stringify({
      correctedText: "El Señor es mi pastor, nada me faltará.",
      differences: "Se añadieron las tildes correspondientes a 'Señor' y 'faltará'."
    });

    const parsed = parseGeminiDiffOutput(raw);
    expect(parsed.correctedText).toBe("El Señor es mi pastor, nada me faltará.");
    expect(parsed.differences).toContain("Se añadieron las tildes");
  });

  it("Case 3.2: Strips markdown code fences ```json ... ``` cleanly", () => {
    const raw = "```json\n" + JSON.stringify({
      correctedText: "Car Dieu a tant aimé le monde.",
      differences: "Majuscule ajoutée à 'Dieu'."
    }, null, 2) + "\n```";

    const parsed = parseGeminiDiffOutput(raw);
    expect(parsed.correctedText).toBe("Car Dieu a tant aimé le monde.");
    expect(parsed.differences).toBe("Majuscule ajoutée à 'Dieu'.");
  });

  it("Case 3.3: Strips generic markdown code fences ``` ... ```", () => {
    const raw = "```\n" + JSON.stringify({
      correctedText: "For God so loved the world.",
      differences: "Punctuation normalized."
    }) + "\n```";

    const parsed = parseGeminiDiffOutput(raw);
    expect(parsed.correctedText).toBe("For God so loved the world.");
    expect(parsed.differences).toBe("Punctuation normalized.");
  });

  it("Case 3.4: Extracts JSON object even when surrounded by conversational chatter", () => {
    const raw = "Here is the requested theological correction in JSON format:\n\n" +
      JSON.stringify({
        correctedText: "En el principio existía el Verbo.",
        differences: "Discrepancia resuelta."
      }) +
      "\n\nI hope this theological analysis helps you!";

    const parsed = parseGeminiDiffOutput(raw);
    expect(parsed.correctedText).toBe("En el principio existía el Verbo.");
    expect(parsed.differences).toBe("Discrepancia resuelta.");
  });

  it("Case 3.5: Falls back gracefully if output is completely non-JSON text", () => {
    const raw = "Lo siento, no pude procesar el audio directamente.";

    const parsed = parseGeminiDiffOutput(raw);
    expect(parsed.correctedText).toBe("Lo siento, no pude procesar el audio directamente.");
    expect(parsed.differences).toContain("差异报告解析失败");
  });
});
