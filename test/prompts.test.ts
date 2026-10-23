import { describe, it, expect } from "vitest";
import { getCorrectionPrompt } from "../src/config/prompts";

describe("Prompt Configuration Module (提示词配置文件单元测试)", () => {
  const baseOptions = {
    enableLineBreaks: true,
    maxLineLength: 25,
    minLineLength: 12,
    enableVisualOptimization: true,
    visualOptStart: 20,
    visualOptEnd: 24
  };

  it("Generates Spanish prompt with theological rules, Latin quotes and line break constraints", () => {
    const prompt = getCorrectionPrompt('es', 'dios es amor', 'Dios es amor', 'es', baseOptions);
    expect(prompt).toContain('Mayúscula Reverencial / Divina');
    expect(prompt).toContain('« ... »');
    expect(prompt).toContain('¿');
    expect(prompt).toContain('¡');
    expect(prompt).toContain('Redactar obligatoriamente en español');
    expect(prompt).toContain('每行最长不得超过 25 个字符');
    expect(prompt).toContain('dios es amor');
    expect(prompt).toContain('Dios es amor');
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

  it("Omits line break instructions when enableLineBreaks is false", () => {
    const prompt = getCorrectionPrompt('es', 'texto a', 'texto b', 'es', {
      ...baseOptions,
      enableLineBreaks: false
    });
    expect(prompt).toContain('不需要换行，直接输出为一整段连续文本');
    expect(prompt).not.toContain('逐行输出');
  });
});
