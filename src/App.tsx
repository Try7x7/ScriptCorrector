import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Header } from './components/Header';
import { QuotaAlert } from './components/QuotaAlert';
import { TranscriptionPanel } from './components/TranscriptionPanel';
import { ScriptPanel } from './components/ScriptPanel';
import { SubtitleSettingsPanel } from './components/SubtitleSettingsPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { getCorrectionPrompt } from './config/prompts';
import { DEFAULT_GEMINI_MODEL, SUBTITLE_DEFAULTS } from './config/constants';
import { SupportedLanguage, ReportLanguage, ApiErrorInfo } from './types';
import { formatSubtitles, downloadSrtFile, downloadTxtFile } from './utils/subtitleFormatter';

export default function App() {
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>('es');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [textB, setTextB] = useState('');
  const [textA, setTextA] = useState('');
  const [textC, setTextC] = useState('');
  const [diffText, setDiffText] = useState('');
  const [gladiaApiKeyInput, setGladiaApiKeyInput] = useState('');
  
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<ApiErrorInfo | null>(null);
  
  // Output Settings
  const [enableLineBreaks, setEnableLineBreaks] = useState(SUBTITLE_DEFAULTS.enableLineBreaks);
  const [maxLineLength, setMaxLineLength] = useState(SUBTITLE_DEFAULTS.maxLineLength);
  const [minLineLength, setMinLineLength] = useState(SUBTITLE_DEFAULTS.minLineLength);
  const [enableVisualOptimization, setEnableVisualOptimization] = useState(SUBTITLE_DEFAULTS.enableVisualOptimization);
  const [visualOptStart, setVisualOptStart] = useState(SUBTITLE_DEFAULTS.visualOptStart);
  const [visualOptEnd, setVisualOptEnd] = useState(SUBTITLE_DEFAULTS.visualOptEnd);
  
  const [diffLanguage, setDiffLanguage] = useState<ReportLanguage>('es');

  const handleAudioSelect = (file: File | null) => {
    setAudioFile(file);
    if (file) {
      const audio = new Audio();
      audio.src = URL.createObjectURL(file);
      audio.onloadedmetadata = () => {
        setAudioDuration(audio.duration);
        URL.revokeObjectURL(audio.src);
      };
    } else {
      setAudioDuration(null);
    }
  };

  const handleProcess = async () => {
    if (!audioFile) {
      setError('请上传音频文件 (Please upload an audio file)');
      return;
    }
    if (!textB.trim()) {
      setError('请输入文字稿 (Please enter the reference text)');
      return;
    }

    setError(null);
    setErrorInfo(null);
    setTextA('');
    setTextC('');
    setDiffText('');

    // Step 0: Wake up server if needed and verify it returns JSON status: ok
    setIsWakingUp(true);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const healthCheck = await fetch('/api/health');
        const text = await healthCheck.text();
        if (healthCheck.ok && text.includes('"ok"')) {
          break;
        }
      } catch (e) {
        console.log(`Server wake-up check attempt ${attempt + 1}...`);
      }
      await new Promise(r => setTimeout(r, 1200));
    }
    setIsWakingUp(false);

    // Step 1: Transcribe Audio (Text A)
    setIsTranscribing(true);
    let transcribedText = '';
    try {
      const formData = new FormData();
      if (gladiaApiKeyInput.trim()) {
        formData.append('gladiaApiKey', gladiaApiKeyInput.trim());
      }
      formData.append('audio', audioFile);
      formData.append('language', selectedLanguage);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'X-Gladia-API-Key': gladiaApiKeyInput.trim(),
          'X-Target-Language': selectedLanguage,
        },
        body: formData,
      });

      const rawResponseText = await response.text();
      const rawLower = rawResponseText.trim().toLowerCase();
      const isHtmlResponse = rawLower.startsWith('<!doctype') || 
                             rawLower.startsWith('<html') ||
                             rawLower.includes('starting server') ||
                             rawLower.includes('please wait while your application starts');

      if (isHtmlResponse) {
        const isStartingServer = rawLower.includes('starting server') || 
                                 rawLower.includes('please wait while your application starts') ||
                                 response.status === 200;
        
        const startingServerTip = '服务容器正在唤醒中 (Starting Server)：本次未消耗任何额度，容器就绪通常只需 2~3 秒，请稍后直接重试。';
        const generalHtmlTip = `服务器连接异常 (收到网关 HTML 页面，HTTP ${response.status})。服务可能正在冷启动，本次未消耗任何额度，请稍等几秒重试。`;
        const msg = isStartingServer ? startingServerTip : generalHtmlTip;

        setErrorInfo({
          message: msg,
          errorCode: isStartingServer ? 'CONTAINER_STARTING (HTTP 200)' : `GATEWAY_HTML (HTTP ${response.status})`,
          errorReason: isStartingServer 
            ? '服务容器正在冷启动或重启过渡期（收到网关 Starting Server 页面）。请求未触达转录后台，本次调用未消耗任何外部额度。'
            : '网关或代理返回了过渡 HTML 页面，请求尚未到达后台。',
          quotaTip: '💡 本次操作完全未扣减任何额度（消耗为 0）。容器就绪通常只需 2~3 秒，请稍后直接重新提交。'
        });
        setError(msg);
        throw new Error(msg);
      }

      let responseData: any = null;
      try {
        responseData = JSON.parse(rawResponseText);
      } catch (parseErr) {
        throw new Error(`服务器返回了非 JSON 格式响应 (HTTP ${response.status}): ${rawResponseText.substring(0, 150)}`);
      }

      if (!response.ok) {
        let errorMsg = responseData.error || 'Transcription failed';
        if (responseData.details) {
          errorMsg += ` (${typeof responseData.details === 'object' ? JSON.stringify(responseData.details) : responseData.details})`;
        }
        if (responseData.customKeyUsed) {
          errorMsg += ' [使用自定义 API Key]';
        }
        throw new Error(errorMsg);
      }

      transcribedText = responseData.text || '';
      setTextA(transcribedText);
      setIsTranscribing(false);

      // Step 2: Correct Text (Text C) using Gemini via Backend
      await runGemini(transcribedText);
    } catch (err: any) {
      console.error(err);
      setError(`语音识别失败: ${err.message}`);
      setIsTranscribing(false);
    }
  };

  const runGemini = async (transcribedText: string) => {
    setIsCorrecting(true);
    setError(null);
    try {
      const prompt = getCorrectionPrompt(selectedLanguage, transcribedText, textB, diffLanguage, {
        enableLineBreaks,
        maxLineLength,
        minLineLength,
        enableVisualOptimization,
        visualOptStart,
        visualOptEnd,
      });

      const response = await fetch('/api/correct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          model: DEFAULT_GEMINI_MODEL,
        }),
      });

      const rawResponseText = await response.text();
      const rawLower = rawResponseText.trim().toLowerCase();
      const isHtmlResponse = rawLower.startsWith('<!doctype') || 
                             rawLower.startsWith('<html') ||
                             rawLower.includes('starting server') ||
                             rawLower.includes('please wait while your application starts');

      if (isHtmlResponse) {
        const isStartingServer = rawLower.includes('starting server') || 
                                 rawLower.includes('please wait while your application starts') ||
                                 response.status === 200;

        const startingServerTip = '服务容器正在唤醒中 (Starting Server)：本次未消耗任何额度，容器就绪通常只需 2~3 秒，请稍后直接重试。';
        const generalHtmlTip = `服务器响应异常 (收到网关 HTML 页面，HTTP ${response.status})。服务可能正在冷启动，本次未消耗任何额度，请稍等几秒重试。`;
        const msg = isStartingServer ? startingServerTip : generalHtmlTip;

        const startingErrInfo: ApiErrorInfo = {
          message: msg,
          errorCode: isStartingServer ? 'CONTAINER_STARTING (HTTP 200)' : `GATEWAY_HTML (HTTP ${response.status})`,
          errorReason: isStartingServer 
            ? '服务容器正在冷启动或重启过渡期（收到网关 Starting Server 页面）。请求未触达 Gemini 核心服务，本次调用消耗的配额为 0！'
            : '网关或代理返回了过渡 HTML 页面，请求尚未到达模型后台。',
          quotaTip: '💡 本次操作完全未扣减任何 Gemini API 额度（消耗为 0）。容器就绪通常只需 2~3 秒，请稍后直接点击下方「手动重试校对」继续。',
          model: DEFAULT_GEMINI_MODEL
        };
        setErrorInfo(startingErrInfo);
        setError(msg);
        throw new Error(msg);
      }

      let responseJson: any = null;
      try {
        responseJson = JSON.parse(rawResponseText);
      } catch (parseErr) {
        throw new Error(`服务器返回了非 JSON 格式响应 (HTTP ${response.status}): ${rawResponseText.substring(0, 120)}`);
      }

      if (!response.ok) {
        const errInfo: ApiErrorInfo = {
          message: responseJson.error || `校正失败 (HTTP ${response.status})`,
          errorCode: responseJson.errorCode || `HTTP ${response.status}`,
          errorReason: responseJson.errorReason || "服务返回异常，可能受配额限制或网络拥塞影响。",
          quotaTip: responseJson.quotaTip || "免费层配额上限通常为 5 RPM / 20 RPD。系统已将后台重试设置为 0 次以节约用量。请前往 Google AI Studio 检查用量。",
          details: typeof responseJson.details === 'object' ? JSON.stringify(responseJson.details) : responseJson.details
        };
        setErrorInfo(errInfo);
        setError(errInfo.message);
        throw new Error(errInfo.message);
      }

      const responseText = responseJson.text || '{}';
      
      // Robust JSON parser for Gemini output: strips markdown code fences and extracts JSON object
      try {
        let cleanText = responseText.trim();
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        }
        
        let result: any = null;
        try {
          result = JSON.parse(cleanText);
        } catch (firstErr) {
          const match = cleanText.match(/\{[\s\S]*\}/);
          if (match) {
            result = JSON.parse(match[0]);
          } else {
            throw firstErr;
          }
        }

        let corrected = result.correctedText || '';
        if (enableLineBreaks && corrected) {
          corrected = formatSubtitles(corrected, {
            maxLen: maxLineLength,
            minLen: minLineLength,
            enableVisualOpt: enableVisualOptimization,
            visualOptStart,
            visualOptEnd
          });
        }
        setTextC(corrected);
        setDiffText(result.differences || '');
      } catch (e) {
        console.error("JSON Parse Error", e);
        let corrected = responseText;
        if (enableLineBreaks && corrected) {
          corrected = formatSubtitles(corrected, {
            maxLen: maxLineLength,
            minLen: minLineLength,
            enableVisualOpt: enableVisualOptimization,
            visualOptStart,
            visualOptEnd
          });
        }
        setTextC(corrected);
        setDiffText("差异报告解析失败，已直接呈现校正文本。请检查内容格式。");
      }
    } catch (err: any) {
      console.error(err);
      setErrorInfo(prev => prev || {
        message: err.message || "请求失败",
        errorCode: 'REQUEST_FAILED',
        errorReason: err.message?.includes('HTML') 
          ? '云服务代理返回了 HTML 页面（可能由于冷启动或请求超时）。'
          : '网络通信中断或服务未响应。',
        quotaTip: '后台重试已设为 0 次以保护您的配额。请前往 Google AI Studio 查看当前使用量状态。'
      });
      setError(`文本校正失败: ${err.message}`);
    }
    setIsCorrecting(false);
  };

  const handleProcessGeminiOnly = async () => {
    if (!textB.trim()) {
      setError('请输入文字稿 (Please enter the reference text)');
      return;
    }

    setError(null);
    setErrorInfo(null);
    setTextC('');
    setDiffText('');

    // Step 0: Wake up server if needed and verify it returns JSON status: ok
    setIsWakingUp(true);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const healthCheck = await fetch('/api/health');
        const text = await healthCheck.text();
        if (healthCheck.ok && text.includes('"ok"')) {
          break;
        }
      } catch (e) {
        console.log(`Server wake-up check attempt ${attempt + 1}...`);
      }
      await new Promise(r => setTimeout(r, 1200));
    }
    setIsWakingUp(false);

    // If we have transcribed text, use it. Otherwise, use textB as the source text.
    const textToProcess = textA.trim() ? textA : textB;
    await runGemini(textToProcess);
  };

  const handleReformatLines = () => {
    if (textC) {
      const formatted = formatSubtitles(textC, {
        maxLen: maxLineLength,
        minLen: minLineLength,
        enableVisualOpt: enableVisualOptimization,
        visualOptStart,
        visualOptEnd
      });
      setTextC(formatted);
    }
  };

  const handleExportSrt = () => {
    if (!textC.trim()) return;
    const baseName = audioFile ? audioFile.name.replace(/\.[^/.]+$/, '') : 'subtitles';
    downloadSrtFile(textC, `${baseName}_${selectedLanguage}.srt`, audioDuration || undefined);
  };

  const handleExportTxt = () => {
    if (!textC.trim()) return;
    const baseName = audioFile ? audioFile.name.replace(/\.[^/.]+$/, '') : 'subtitles';
    downloadTxtFile(textC, `${baseName}_${selectedLanguage}.txt`, audioDuration || undefined);
  };

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
          onClose={() => { setError(null); setErrorInfo(null); }}
          onRetry={() => {
            const textToProcess = textA.trim() ? textA : textB;
            runGemini(textToProcess);
          }}
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
              enableLineBreaks={enableLineBreaks}
              onEnableLineBreaksChange={setEnableLineBreaks}
              maxLineLength={maxLineLength}
              onMaxLineLengthChange={setMaxLineLength}
              minLineLength={minLineLength}
              onMinLineLengthChange={setMinLineLength}
              enableVisualOptimization={enableVisualOptimization}
              onEnableVisualOptimizationChange={setEnableVisualOptimization}
              visualOptStart={visualOptStart}
              onVisualOptStartChange={setVisualOptStart}
              visualOptEnd={visualOptEnd}
              onVisualOptEndChange={setVisualOptEnd}
            />

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleProcess}
                disabled={isTranscribing || isCorrecting || isWakingUp || !audioFile || !textB.trim()}
                className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl font-medium shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {(isTranscribing || isWakingUp || (isCorrecting && !textC && !diffText && audioFile)) ? (
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
              
              <button
                onClick={handleProcessGeminiOnly}
                disabled={isTranscribing || isCorrecting || !textB.trim()}
                className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl font-medium shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isCorrecting ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    <span>正在校正文本...</span>
                  </>
                ) : (
                  <span>仅运行 Gemini (Text Only)</span>
                )}
              </button>
            </div>
          </div>

          {/* Right Column: Output Results */}
          <ResultsPanel
            selectedLanguage={selectedLanguage}
            textA={textA}
            textC={textC}
            diffText={diffText}
            isTranscribing={isTranscribing}
            isCorrecting={isCorrecting}
            maxLineLength={maxLineLength}
            minLineLength={minLineLength}
            enableVisualOptimization={enableVisualOptimization}
            visualOptStart={visualOptStart}
            visualOptEnd={visualOptEnd}
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
