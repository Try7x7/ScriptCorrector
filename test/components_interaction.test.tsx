// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QuotaAlert } from "../src/components/QuotaAlert";
import { TranscriptionPanel } from "../src/components/TranscriptionPanel";
import { ScriptPanel } from "../src/components/ScriptPanel";
import { SubtitleSettingsPanel } from "../src/components/SubtitleSettingsPanel";
import { ResultsPanel } from "../src/components/ResultsPanel";
import { Header } from "../src/components/Header";

describe("Frontend Component Interactions & User Events (前端组件交互与用户点击事件测试)", () => {
  afterEach(() => {
    cleanup();
  });
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

  it("Case 2.5: ResultsPanel displays tips bubble, supports manual editing of Text C, and calls onReformatLines and onRestoreGeminiResult", () => {
    const handleReformat = vi.fn();
    const handleRestore = vi.fn();
    const handleTextCChange = vi.fn();
    const sampleTextC = "Primera línea de prueba.\nSegunda línea de prueba.";

    render(
      <ResultsPanel
        selectedLanguage="es"
        textA="Texto A de prueba"
        onTextAChange={vi.fn()}
        textC={sampleTextC}
        onTextCChange={handleTextCChange}
        canRestoreGemini={true}
        onRestoreGeminiResult={handleRestore}
        diffText="Diferencia reportada"
        isTranscribing={false}
        isCorrecting={false}
        maxLineLength={25}
        minLineLength={12}
        enableVisualOptimization={true}
        visualOptStart={20}
        visualOptEnd={24}
        onReformatLines={handleReformat}
        onExportSrt={vi.fn()}
        onExportTxt={vi.fn()}
        diffLanguage="es"
        onDiffLanguageChange={vi.fn()}
      />
    );

    // Verify tips bubble notification is displayed
    expect(screen.getByText(/💡 提示说明：/)).toBeDefined();
    expect(screen.getByText(/手动修改校对文字/)).toBeDefined();

    // Verify reformat lines button is present and triggers onReformatLines
    const reformatBtn = screen.getByTitle("按当前设定的字符上限与语法规则重新精准排版断行");
    expect(reformatBtn).toBeDefined();
    fireEvent.click(reformatBtn);
    expect(handleReformat).toHaveBeenCalledTimes(1);

    // Verify restore Gemini button is present, enabled, and triggers onRestoreGeminiResult
    const restoreBtn = screen.getByTitle("恢复为 Gemini 原始校对结果");
    expect(restoreBtn).toBeDefined();
    expect(restoreBtn.hasAttribute("disabled")).toBe(false);
    fireEvent.click(restoreBtn);
    expect(handleRestore).toHaveBeenCalledTimes(1);

    // Click "手动编辑文本" to switch to textarea edit mode
    const editModeBtn = screen.getByTitle("切换编辑/统计模式");
    expect(editModeBtn).toBeDefined();
    fireEvent.click(editModeBtn);

    // Textarea should now be visible and can be typed into
    const textarea = screen.getByPlaceholderText("在此直接手动编辑或修改校对结果文本...");
    expect(textarea).toBeDefined();
    fireEvent.change(textarea, { target: { value: "Nuevo texto C modificado" } });
    expect(handleTextCChange).toHaveBeenCalledWith("Nuevo texto C modificado");
  });

  it("Case 2.6: ResultsPanel supports editing Text A directly when onTextAChange is provided", () => {
    const handleTextAChange = vi.fn();

    render(
      <ResultsPanel
        selectedLanguage="es"
        textA="Transcripción inicial"
        onTextAChange={handleTextAChange}
        textC=""
        diffText=""
        isTranscribing={false}
        isCorrecting={false}
        maxLineLength={25}
        minLineLength={12}
        enableVisualOptimization={true}
        visualOptStart={20}
        visualOptEnd={24}
        onReformatLines={vi.fn()}
        onExportSrt={vi.fn()}
        onExportTxt={vi.fn()}
        diffLanguage="es"
        onDiffLanguageChange={vi.fn()}
      />
    );

    // Find textarea for Text A
    const textareaA = screen.getByPlaceholderText(/音频识别完成后将在此显示结果/);
    expect(textareaA).toBeDefined();
    fireEvent.change(textareaA, { target: { value: "Nueva transcripción pegada manualmente" } });
    expect(handleTextAChange).toHaveBeenCalledWith("Nueva transcripción pegada manualmente");

    // Clear Text A button should work
    const clearBtnA = screen.getByTitle("清空识别结果");
    expect(clearBtnA).toBeDefined();
    fireEvent.click(clearBtnA);
    expect(handleTextAChange).toHaveBeenCalledWith("");
  });

  it("Case 2.7: ResultsPanel handles SRT and TXT export with estimation notice when hasGladiaTimestamps is false", () => {
    const handleExportSrt = vi.fn();
    const handleExportTxt = vi.fn();

    const { rerender } = render(
      <ResultsPanel
        selectedLanguage="es"
        textA="Texto A"
        textC="Primera línea de subtítulo\nSegunda línea de subtítulo"
        diffText=""
        isTranscribing={false}
        isCorrecting={false}
        maxLineLength={25}
        minLineLength={12}
        enableVisualOptimization={true}
        visualOptStart={20}
        visualOptEnd={24}
        hasGladiaTimestamps={false}
        onReformatLines={vi.fn()}
        onExportSrt={handleExportSrt}
        onExportTxt={handleExportTxt}
        diffLanguage="es"
        onDiffLanguageChange={vi.fn()}
      />
    );

    // 1. Without Gladia timestamps, SRT button is enabled with "估算时间" badge and title
    const srtBtnEstimated = screen.getByTitle("导出为 SRT 字幕文件（无音频，按字数估算时间轴）");
    expect(srtBtnEstimated).toBeDefined();
    expect(srtBtnEstimated.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("估算时间")).toBeDefined();

    fireEvent.click(srtBtnEstimated);
    expect(handleExportSrt).toHaveBeenCalledTimes(1);

    // 2. TXT button is always available when textC is present
    const txtBtn = screen.getByTitle("导出为 TXT 纯文本文档");
    expect(txtBtn).toBeDefined();
    expect(txtBtn.hasAttribute("disabled")).toBe(false);

    fireEvent.click(txtBtn);
    expect(handleExportTxt).toHaveBeenCalledTimes(1);

    // 3. When hasGladiaTimestamps is true, badge disappears and title reflects real audio timestamps
    rerender(
      <ResultsPanel
        selectedLanguage="es"
        textA="Texto A"
        textC="Primera línea de subtítulo\nSegunda línea de subtítulo"
        diffText=""
        isTranscribing={false}
        isCorrecting={false}
        maxLineLength={25}
        minLineLength={12}
        enableVisualOptimization={true}
        visualOptStart={20}
        visualOptEnd={24}
        hasGladiaTimestamps={true}
        onReformatLines={vi.fn()}
        onExportSrt={handleExportSrt}
        onExportTxt={handleExportTxt}
        diffLanguage="es"
        onDiffLanguageChange={vi.fn()}
      />
    );

    const srtBtnReal = screen.getByTitle("导出为 SRT 字幕文件（包含真实录音时间轴）");
    expect(srtBtnReal).toBeDefined();
    expect(screen.queryByText("估算时间")).toBeNull();
  });

  it("Case 2.8: Header displays v1.2 badge and links directly to GitHub CHANGELOG.md", () => {
    render(<Header selectedLanguage="es" />);

    // Verify v1.2 version badge
    const badge = screen.getByText("v1.2");
    expect(badge).toBeDefined();
    expect(badge.closest("a")?.getAttribute("href")).toBe(
      "https://github.com/Try7x7/ScriptCorrector/blob/main/CHANGELOG.md"
    );

    // Verify changelog external link button
    const changelogLink = screen.getByTitle("查看 GitHub 仓库更新日志");
    expect(changelogLink).toBeDefined();
    expect(changelogLink.getAttribute("href")).toBe(
      "https://github.com/Try7x7/ScriptCorrector/blob/main/CHANGELOG.md"
    );
    expect(changelogLink.getAttribute("target")).toBe("_blank");
    expect(changelogLink.getAttribute("rel")).toContain("noopener");
  });
});



