import React from 'react';
import { Loader2, XCircle } from 'lucide-react';
import { Header } from './components/Header';
import { QuotaAlert } from './components/QuotaAlert';
import { TranscriptionPanel } from './components/TranscriptionPanel';
import { ScriptPanel } from './components/ScriptPanel';
import { SubtitleSettingsPanel } from './components/SubtitleSettingsPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { Tooltip } from './components/Tooltip';
import { useCorrectionPipeline } from './hooks/useCorrectionPipeline';

export default function App() {
  const {
    selectedLanguage,
    setSelectedLanguage,
    gladiaApiKeyInput,
    setGladiaApiKeyInput,
    audioFile,
    handleAudioSelect,
    textB,
    setTextB,
    textA,
    setTextA,
    textC,
    setTextC,
    canRestoreGemini,
    handleRestoreGeminiResult,
    diffText,
    diffLanguage,
    setDiffLanguage,
    subtitleOptions,
    setSubtitleOptions,
    transcriptionUtterances,
    isTranscribing,
    isCorrecting,
    isWakingUp,
    error,
    setError,
    errorInfo,
    setErrorInfo,
    cancelOperation,
    handleProcess,
    handleProcessGeminiOnly,
    handleReformatLines,
    handleExportSrt,
    handleExportTxt,
  } = useCorrectionPipeline();

  const isBusy = isTranscribing || isCorrecting || isWakingUp;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      <Header selectedLanguage={selectedLanguage} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Language Notification Banner */}
        {selectedLanguage === 'es' && (
          <div className="mb-6 p-4 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-start sm:items-center justify-between gap-3 text-amber-900 shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🇪🇸</span>
              <div className="text-xs sm:text-sm">
                <span className="font-semibold">已启用全流程西班牙语核对模式：</span>
                <span className="text-amber-800">
                  自动启用西语语音识别、神圣人称大写（Él, Su, Ti, Mí）、标点规范（¿? ¡! « »）、西语语法断行规则，<strong>核对差异分析报告默认全篇使用西班牙语输出</strong>。
                </span>
              </div>
            </div>
            <span className="hidden sm:inline-block text-[11px] bg-amber-200/70 text-amber-900 px-2.5 py-1 rounded-full font-medium">
              Español
            </span>
          </div>
        )}

        {/* Quota and Error Alert Card */}
        <QuotaAlert
          error={error}
          errorInfo={errorInfo}
          onClose={() => {
            setError(null);
            setErrorInfo(null);
          }}
          onRetry={handleProcessGeminiOnly}
          isRetrying={isCorrecting}
          canRetry={Boolean(textA || textB)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Inputs & Controls */}
          <div className="space-y-6">
            <TranscriptionPanel
              selectedLanguage={selectedLanguage}
              onLanguageChange={setSelectedLanguage}
              gladiaApiKeyInput={gladiaApiKeyInput}
              onGladiaApiKeyChange={setGladiaApiKeyInput}
              audioFile={audioFile}
              onFileSelect={handleAudioSelect}
            />

            <ScriptPanel
              textB={textB}
              onTextBChange={setTextB}
              selectedLanguage={selectedLanguage}
            />

            <SubtitleSettingsPanel
              enableLineBreaks={subtitleOptions.enableLineBreaks}
              onEnableLineBreaksChange={(val) => setSubtitleOptions(prev => ({ ...prev, enableLineBreaks: val }))}
              maxLineLength={subtitleOptions.maxLineLength}
              onMaxLineLengthChange={(val) => setSubtitleOptions(prev => ({ ...prev, maxLineLength: val }))}
              minLineLength={subtitleOptions.minLineLength}
              onMinLineLengthChange={(val) => setSubtitleOptions(prev => ({ ...prev, minLineLength: val }))}
              enableVisualOptimization={subtitleOptions.enableVisualOptimization}
              onEnableVisualOptimizationChange={(val) => setSubtitleOptions(prev => ({ ...prev, enableVisualOptimization: val }))}
              visualOptStart={subtitleOptions.visualOptStart}
              onVisualOptStartChange={(val) => setSubtitleOptions(prev => ({ ...prev, visualOptStart: val }))}
              visualOptEnd={subtitleOptions.visualOptEnd}
              onVisualOptEndChange={(val) => setSubtitleOptions(prev => ({ ...prev, visualOptEnd: val }))}
            />

            <div className="flex flex-col sm:flex-row gap-4">
              <Tooltip 
                content={
                  !audioFile 
                    ? '请先在上方上传一段录音音频（支持 MP3、WAV、M4A 等格式）。' 
                    : '全自动一站式处理：先听录音听写出文字，再由 AI 对照原稿纠正错字错音，最后自动排成整齐规范的一行行字幕。'
                }
                className="flex-1"
              >
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={isBusy || !audioFile}
                  title="完整处理 (Audio + Gemini)"
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl font-medium shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isBusy && audioFile ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      <span>
                        {isWakingUp ? '正在连接服务器...' : 
                         isTranscribing ? '正在识别音频...' : '正在校正文本...'}
                      </span>
                    </>
                  ) : (
                    <span>完整处理 (Audio + Gemini)</span>
                  )}
                </button>
              </Tooltip>
              
              <Tooltip 
                content={
                  !textA.trim() && !textB.trim() 
                    ? '右侧识别框 (Text A) 或左侧文字稿 (Text B) 只要有一处有文字，就可以直接点这里开始校对。' 
                    : '不用传音频。直接拿现有的文字让 AI 帮您纠正错别字、理顺标点与专有名词，并把句子整理成长度合适的一行行字幕。'
                }
                className="flex-1"
              >
                <button
                  type="button"
                  onClick={handleProcessGeminiOnly}
                  disabled={isBusy || (!textA.trim() && !textB.trim())}
                  title="仅运行 Gemini (Text Only)"
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl font-medium shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isCorrecting && !isTranscribing ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      <span>正在校正文本...</span>
                    </>
                  ) : (
                    <span>仅运行 Gemini (Text Only)</span>
                  )}
                </button>
              </Tooltip>

              {isBusy && (
                <Tooltip content="立即停止当前正在进行的录音上传、语音听写或 AI 校对，不再消耗等待时间。">
                  <button
                    type="button"
                    onClick={cancelOperation}
                    title="取消正在进行的操作"
                    className="px-4 py-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <XCircle size={18} />
                    <span>取消</span>
                  </button>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Right Column: Output Results */}
          <ResultsPanel
            selectedLanguage={selectedLanguage}
            textA={textA}
            onTextAChange={setTextA}
            textC={textC}
            onTextCChange={setTextC}
            canRestoreGemini={canRestoreGemini}
            onRestoreGeminiResult={handleRestoreGeminiResult}
            hasGladiaTimestamps={transcriptionUtterances.length > 0}
            diffText={diffText}
            isTranscribing={isTranscribing}
            isCorrecting={isCorrecting}
            maxLineLength={subtitleOptions.maxLineLength}
            minLineLength={subtitleOptions.minLineLength}
            enableVisualOptimization={subtitleOptions.enableVisualOptimization}
            visualOptStart={subtitleOptions.visualOptStart}
            visualOptEnd={subtitleOptions.visualOptEnd}
            onReformatLines={handleReformatLines}
            onExportSrt={handleExportSrt}
            onExportTxt={handleExportTxt}
            diffLanguage={diffLanguage}
            onDiffLanguageChange={setDiffLanguage}
          />
        </div>
      </main>
    </div>
  );
}
