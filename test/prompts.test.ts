import { describe, it, expect } from "vitest";
import { getCorrectionPrompt, getStructuredCorrectionPrompt, LANGUAGE_CONFIGS } from "../src/config/prompts";

describe("Prompt Configuration Module (提示词配置文件单元测试)", () => {
  const baseOptions = {
    enableLineBreaks: true,
    maxLineLength: 25,
    minLineLength: 12,
    enableVisualOptimization: true,
    visualOptStart: 20,
    visualOptEnd: 24
  };

  it("Generates Spanish prompt with theological rules, Latin quotes and injection protection tags", () => {
    const prompt = getCorrectionPrompt('es', 'dios es amor', 'Dios es amor', 'es', baseOptions);
    expect(prompt).toContain('Mayúscula Reverencial / Divina');
    expect(prompt).toContain('« ... »');
    expect(prompt).toContain('¿');
    expect(prompt).toContain('¡');
    expect(prompt).toContain('Redactar obligatoriamente en español');
    expect(prompt).toContain('<TEXT_A_ASR>');
    expect(prompt).toContain('dios es amor');
    expect(prompt).toContain('<TEXT_B_REFERENCE_SCRIPT>');
    expect(prompt).toContain('Dios es amor');
    expect(prompt).toContain('<SECURITY_NOTICE>');
  });

  it("Switches Spanish report language to Chinese when reportLang is zh", () => {
    const prompt = getCorrectionPrompt('es', 'dios es amor', 'Dios es amor', 'zh', baseOptions);
    expect(prompt).toContain('【请使用中文回复此字段】');
    expect(prompt).not.toContain('Redactar obligatoriamente en español');
  });

  it("Generates French prompt with Divine Capitalization and French quotes", () => {
    const prompt = getCorrectionPrompt('fr', 'dieu est amour', 'Dieu est amour', 'zh', baseOptions);
    expect(prompt).toContain('Capitalisation Divine');
    expect(prompt).toContain('« ... »');
    expect(prompt).toContain('Matthieu');
  });

  it("Generates English prompt with comprehensive theological rules and sacred pronouns", () => {
    const prompt = getCorrectionPrompt('en', 'he said unto them', 'He said unto them', 'zh', baseOptions);
    expect(prompt).toContain('Sacred Reverential Pronouns');
    expect(prompt).toContain('Genesis');
    expect(prompt).toContain('John 3:16');
    expect(prompt).toContain('<TEXT_A_ASR>');
    expect(prompt).toContain('he said unto them');
  });

  it("Returns decoupled systemInstruction and userPrompt in getStructuredCorrectionPrompt", () => {
    const { systemInstruction, userPrompt } = getStructuredCorrectionPrompt('es', 'prueba', 'Prueba', 'es', baseOptions);
    expect(systemInstruction).toContain('Mayúscula Reverencial / Divina');
    expect(systemInstruction).not.toContain('<TEXT_A_ASR>');
    expect(userPrompt).toContain('<TEXT_A_ASR>');
    expect(userPrompt).toContain('prueba');
    expect(userPrompt).toContain('<SECURITY_NOTICE>');
  });

  it("Instructs LLM to perform subtitle line breaks when enableLineBreaks is true", () => {
    const prompt = getCorrectionPrompt('es', 'texto a', 'texto b', 'es', baseOptions);
    expect(prompt).toContain('字幕断行与排版规范（由大模型直接完成断行排版）');
    expect(prompt).toContain('最长不得超过 **25** 个字符');
    expect(prompt).toContain('每行尽量不少于 **12** 个字符');
    expect(prompt).toContain('行末防虚词悬挂');
    expect(prompt).toContain('视觉优化避险');
  });

  it("Outputs continuous text without line breaks when enableLineBreaks is false", () => {
    const prompt = getCorrectionPrompt('es', 'texto a', 'texto b', 'es', {
      ...baseOptions,
      enableLineBreaks: false
    });
    expect(prompt).toContain('直接输出为一整段连续文本（不包含换行符）');
  });
});
