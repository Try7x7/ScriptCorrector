// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuotaAlert } from "../src/components/QuotaAlert";
import { TranscriptionPanel } from "../src/components/TranscriptionPanel";
import { ScriptPanel } from "../src/components/ScriptPanel";
import { SubtitleSettingsPanel } from "../src/components/SubtitleSettingsPanel";

describe("Frontend Component Interactions & User Events (前端组件交互与用户点击事件测试)", () => {
  it("Case 2.1: QuotaAlert renders error code badge and fires onRetry and onClose callbacks", () => {
    const handleClose = vi.fn();
    const handleRetry = vi.fn();

    const mockErrorInfo = {
      message: "Gemini 官方服务暂时过载 (503 Service Unavailable)",
      errorCode: "HTTP 503 / UNAVAILABLE",
      errorReason: "Google Gemini 官方服务器当前出现突发高并发负载。",
      quotaTip: "免费层配额上限通常为 5 RPM / 20 RPD。"
    };

    const { rerender } = render(
      <QuotaAlert
        error="测试错误"
        errorInfo={mockErrorInfo}
        onClose={handleClose}
        onRetry={handleRetry}
        isRetrying={false}
        canRetry={true}
      />
    );

    // Verify error code badge and text are displayed
    expect(screen.getByText("HTTP 503 / UNAVAILABLE")).toBeDefined();
    expect(screen.getByText("Gemini 官方服务暂时过载 (503 Service Unavailable)")).toBeDefined();

    // Click close button
    const closeBtn = screen.getByTitle("关闭提示");
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Click manual retry button
    const retryBtn = screen.getByText("手动重试校对 (不重复语音识别)");
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);

    // When isRetrying is true, verify button is disabled
    rerender(
      <QuotaAlert
        error="测试错误"
        errorInfo={mockErrorInfo}
        onClose={handleClose}
        onRetry={handleRetry}
        isRetrying={true}
        canRetry={true}
      />
    );
    const retryBtnDisabled = screen.getByText("手动重试校对 (不重复语音识别)").closest("button");
    expect(retryBtnDisabled?.hasAttribute("disabled")).toBe(true);
  });

  it("Case 2.2: TranscriptionPanel fires onLanguageChange when clicking language tabs", () => {
    const handleLanguageChange = vi.fn();
    const handleGladiaApiKeyChange = vi.fn();
    const handleFileSelect = vi.fn();

    render(
      <TranscriptionPanel
        selectedLanguage="es"
        onLanguageChange={handleLanguageChange}
        gladiaApiKeyInput=""
        onGladiaApiKeyChange={handleGladiaApiKeyChange}
        audioFile={null}
        onFileSelect={handleFileSelect}
      />
    );

    // Find and click French language button
    const frButton = screen.getByText("法语").closest("button");
    expect(frButton).not.toBeNull();
    fireEvent.click(frButton!);
    expect(handleLanguageChange).toHaveBeenCalledWith("fr");

    // Find and click English language button
    const enButton = screen.getByText("英语").closest("button");
    expect(enButton).not.toBeNull();
    fireEvent.click(enButton!);
    expect(handleLanguageChange).toHaveBeenCalledWith("en");
  });

  it("Case 2.3: ScriptPanel shows character count and triggers onTextBChange on clear click", () => {
    const handleTextChange = vi.fn();
    const sampleScript = "En el principio creó Dios los cielos y la tierra.";

    render(
      <ScriptPanel
        textB={sampleScript}
        onTextBChange={handleTextChange}
        selectedLanguage="es"
      />
    );

    // Character counter should reflect text length
    expect(screen.getByText(`${sampleScript.length} 字`)).toBeDefined();

    // Clear button should be visible when text is not empty
    const clearBtn = screen.getByTitle("清空文本");
    expect(clearBtn).toBeDefined();
    fireEvent.click(clearBtn);
    expect(handleTextChange).toHaveBeenCalledWith("");
  });

  it("Case 2.4: SubtitleSettingsPanel applies quick presets when clicking preset buttons", () => {
    const setMaxLineLength = vi.fn();
    const setMinLineLength = vi.fn();
    const setVisualOptStart = vi.fn();
    const setVisualOptEnd = vi.fn();

    render(
      <SubtitleSettingsPanel
        enableLineBreaks={true}
        onEnableLineBreaksChange={vi.fn()}
        maxLineLength={25}
        onMaxLineLengthChange={setMaxLineLength}
        minLineLength={12}
        onMinLineLengthChange={setMinLineLength}
        enableVisualOptimization={true}
        onEnableVisualOptimizationChange={vi.fn()}
        visualOptStart={20}
        onVisualOptStartChange={setVisualOptStart}
        visualOptEnd={24}
        onVisualOptEndChange={setVisualOptEnd}
      />
    );

    // Click Loose preset (max 30 / min 12)
    const loosePresetBtn = screen.getByText("宽松排版 (最长30 / 最小12)");
    fireEvent.click(loosePresetBtn);
    expect(setMaxLineLength).toHaveBeenCalledWith(30);
    expect(setMinLineLength).toHaveBeenCalledWith(12);
    expect(setVisualOptStart).toHaveBeenCalledWith(24);
    expect(setVisualOptEnd).toHaveBeenCalledWith(29);

    // Click Standard preset (max 25 / min 12)
    const standardPresetBtn = screen.getByText("✓ 标准规范 (最长25 / 最小12)");
    fireEvent.click(standardPresetBtn);
    expect(setMaxLineLength).toHaveBeenCalledWith(25);
    expect(setMinLineLength).toHaveBeenCalledWith(12);
    expect(setVisualOptStart).toHaveBeenCalledWith(20);
    expect(setVisualOptEnd).toHaveBeenCalledWith(24);
  });
});
