import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileAudio, FileText, CheckCircle2, Loader2, AlertCircle, Copy, RefreshCw, Eye, Hash, Download, FileDown } from 'lucide-react';
import { formatSubtitles, downloadSrtFile, downloadTxtFile } from './utils/subtitleFormatter';
import appIcon from './assets/images/script_corrector_icon_1791735239310.jpg';

interface AppErrorInfo {
  title: string;
  statusCode?: number | string;
  suspectedReason: string;
  quotaHint?: string;
  details?: string;
}

export default function App() {
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
  const [errorInfo, setErrorInfo] = useState<AppErrorInfo | null>(null);

  const clearError = () => setErrorInfo(null);
  const setSimpleError = (msg: string) => setErrorInfo({ title: msg, suspectedReason: msg });
  
  // Output Settings
  const [enableLineBreaks, setEnableLineBreaks] = useState(true);
  const [maxLineLength, setMaxLineLength] = useState(32);
  const [minLineLength, setMinLineLength] = useState(12);
  const [enableVisualOptimization, setEnableVisualOptimization] = useState(true);
  const [visualOptStart, setVisualOptStart] = useState(25);
  const [visualOptEnd, setVisualOptEnd] = useState(30);
  const [showLineStats, setShowLineStats] = useState(true);
  
  const [isCopiedA, setIsCopiedA] = useState(false);
  const [isCopiedB, setIsCopiedB] = useState(false);
  const [isCopiedC, setIsCopiedC] = useState(false);
  const [isExportedSrt, setIsExportedSrt] = useState(false);
  const [isExportedTxt, setIsExportedTxt] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractAudioDuration = (file: File) => {
    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.src = url;
      audio.onloadedmetadata = () => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          setAudioDuration(audio.duration);
        }
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
      };
    } catch (err) {
      console.log('Could not extract audio duration', err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('audio/')) {
        setAudioFile(file);
        extractAudioDuration(file);
        clearError();
      } else {
        setSimpleError('请上传音频文件 (Please upload an audio file)');
      }
    }
  };

  // Auto-wake mechanism
  useEffect(() => {
    const checkHealth = async () => {
      try {
        await fetch('/api/health');
      } catch (e) {
        console.log('Server might be sleeping, ping failed');
      }
    };

    // Check on mount
    checkHealth();

    // Check when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkHealth();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const handleCopyText = async (text: string, setCopied: (val: boolean) => void) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAudioFile(file);
      extractAudioDuration(file);
      clearError();
    }
  };

  const handleExportSrt = () => {
    if (!textC.trim()) return;
    const baseName = audioFile
      ? audioFile.name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\.[^/.]+$/, '').slice(0, 80)
      : 'corrected_subtitles';
    const srtFileName = `${baseName}.srt`;
    downloadSrtFile(textC, srtFileName, audioDuration || undefined);
    setIsExportedSrt(true);
    setTimeout(() => setIsExportedSrt(false), 2200);
  };

  const handleExportTxt = () => {
    if (!textC.trim()) return;
    const baseName = audioFile
      ? audioFile.name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\.[^/.]+$/, '').slice(0, 80)
      : 'corrected_subtitles';
    const txtFileName = `${baseName}.txt`;
    downloadTxtFile(textC, txtFileName, audioDuration || undefined);
    setIsExportedTxt(true);
    setTimeout(() => setIsExportedTxt(false), 2200);
  };

  const handleProcess = async () => {
    if (!audioFile) {
      setSimpleError('请上传音频文件 (Please upload an audio file)');
      return;
    }
    if (!textB.trim()) {
      setSimpleError('请输入文字稿 (Please enter the reference text)');
      return;
    }

    if (gladiaApiKeyInput.trim() && !/^[a-zA-Z0-9_\-]{16,128}$/.test(gladiaApiKeyInput.trim())) {
      setSimpleError('自定义 Gladia API Key 格式无效，请检查是否包含空格或特殊字符。');
      return;
    }

    clearError();
    setTextA('');
    setTextC('');
    setDiffText('');

    // Step 0: Wake up server if needed
    setIsWakingUp(true);
    try {
      const healthCheck = await fetch('/api/health');
      if (!healthCheck.ok) throw new Error('Server not responding');
    } catch (e) {
      console.log('Server wake-up retry...');
      // Retry once after 1s
      await new Promise(r => setTimeout(r, 1000));
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

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'X-Gladia-API-Key': gladiaApiKeyInput.trim(),
        },
        body: formData,
      });

      const rawText = await response.text();
      let responseData: any = null;
      try {
        responseData = JSON.parse(rawText);
      } catch {
        if (rawText.includes("Starting Server") || rawText.includes("Please wait while your application starts")) {
          setErrorInfo({
            title: "服务容器正在唤醒中 (Server Starting)",
            statusCode: "Starting (200)",
            suspectedReason: "当前开发环境后端刚刚完成重启或唤醒，网关正在建立连接。本次请求未发送至模型端点，未消耗任何额度。",
            quotaHint: "容器完全就绪通常只需 2~3 秒。请稍候 3 秒后直接重新点击「开始智能校对」。",
            details: "Gateway returned Starting Server HTML page with status 200."
          });
          setIsTranscribing(false);
          return;
        }
        if (rawText.trim().startsWith('<!doctype') || rawText.trim().startsWith('<html')) {
          setErrorInfo({
            title: "服务网关返回非预期页面",
            statusCode: response.status,
            suspectedReason: "请求被上游云端代理网关拦截（返回了 HTML 页面而不是 JSON 数据）。此情况通常发生在网络节点短暂抖动或服务重启瞬间，未实际调用语音识别模型，未消耗配额。",
            quotaHint: "请等待 3 秒后刷新页面或重新尝试。",
            details: rawText.substring(0, 200)
          });
          setIsTranscribing(false);
          return;
        }
        throw new Error(`服务器返回非标准格式 (${response.status}): ${rawText.substring(0, 100)}`);
      }

      if (!response.ok) {
        const errorTitle = responseData?.error || '语音识别请求失败';
        const code = responseData?.statusCode || response.status;
        const reason = responseData?.suspectedReason || responseData?.details || '语音识别服务发生异常。';
        const quotaHint = responseData?.quotaHint || '请前往 Gladia 控制台检查可用时长额度。';
        const details = typeof responseData?.details === 'object' ? JSON.stringify(responseData?.details) : (responseData?.details || rawText);

        setErrorInfo({
          title: errorTitle,
          statusCode: code,
          suspectedReason: reason,
          quotaHint,
          details
        });
        setIsTranscribing(false);
        return;
      }

      transcribedText = responseData.text || '';
      setTextA(transcribedText);
      setIsTranscribing(false);

      // Step 2: Correct Text (Text C) using Gemini via Backend
      await runGemini(transcribedText);
    } catch (err: any) {
      console.error(err);
      setErrorInfo(prev => prev || {
        title: '语音识别请求失败',
        statusCode: 'Client/Network Error',
        suspectedReason: err.message || '网络连接或客户端解析异常。',
        quotaHint: '建议检查网络连接或刷新页面后重试。',
        details: String(err?.stack || err)
      });
      setIsTranscribing(false);
    }
  };

  const runGemini = async (transcribedText: string) => {
    setIsCorrecting(true);
    clearError();
    try {
      const response = await fetch('/api/correct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcribedText,
          referenceText: textB,
          options: {
            enableLineBreaks,
            maxLineLength,
            minLineLength,
            enableVisualOptimization,
            visualOptStart,
            visualOptEnd
          },
          model: 'gemini-3.8-flash',
        }),
      });

      const rawText = await response.text();
      let responseData: any = null;
      try {
        responseData = JSON.parse(rawText);
      } catch {
        if (rawText.includes("Starting Server") || rawText.includes("Please wait while your application starts")) {
          setErrorInfo({
            title: "服务容器正在唤醒中 (Server Starting)",
            statusCode: "Starting (200)",
            suspectedReason: "当前开发环境后端刚刚完成重启或唤醒，网关正在建立连接。本次请求未发送至模型端点，未消耗任何额度。",
            quotaHint: "容器完全就绪通常只需 2~3 秒。请稍候 3 秒后直接重新点击「开始智能校对」。",
            details: "Gateway returned Starting Server HTML page with status 200."
          });
          setIsCorrecting(false);
          return;
        }
        if (rawText.trim().startsWith('<!doctype') || rawText.trim().startsWith('<html')) {
          setErrorInfo({
            title: "服务网关返回非预期页面",
            statusCode: response.status,
            suspectedReason: "请求被上游云端代理网关拦截（返回了 HTML 页面而不是 JSON 数据）。此情况通常发生在网络节点短暂抖动或服务重启瞬间，未实际调用 Gemini 模型，未消耗配额。",
            quotaHint: "请等待 3 秒后刷新页面或重新尝试。",
            details: rawText.substring(0, 200)
          });
          setIsCorrecting(false);
          return;
        }
        throw new Error(`服务返回非标准格式 (${response.status}): ${rawText.substring(0, 100)}`);
      }

      if (!response.ok) {
        const errorTitle = responseData?.error || '文本校对失败';
        const code = responseData?.statusCode || response.status;
        const reason = responseData?.suspectedReason || responseData?.details || '模型在处理校对请求时发生异常。';
        const quotaHint = responseData?.quotaHint || '请前往 Google AI Studio (aistudio.google.com) 控制台检查当前账号的 RPM (每分钟请求数) 与 RPD (每日配额) 使用量。';
        const details = typeof responseData?.details === 'object' ? JSON.stringify(responseData?.details) : (responseData?.details || rawText);

        setErrorInfo({
          title: errorTitle,
          statusCode: code,
          suspectedReason: reason,
          quotaHint,
          details
        });
        setIsCorrecting(false);
        return;
      }

      const responseText = responseData?.text || '{}';
      
      try {
        const result = JSON.parse(responseText);
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
        setDiffText("解析差异失败，请查看原始输出。");
      }
    } catch (err: any) {
      console.error(err);
      setErrorInfo(prev => prev || {
        title: '文本校对异常',
        statusCode: 'Client/Network Error',
        suspectedReason: err.message || '网络连接或客户端处理发生异常。',
        quotaHint: '请前往 Google AI Studio 检查当前账号配额进度条，或刷新页面后重试。',
        details: String(err?.stack || err)
      });
    }
    setIsCorrecting(false);
  };

  const handleProcessGeminiOnly = async () => {
    if (!textB.trim()) {
      setSimpleError('请输入文字稿 (Please enter the reference text)');
      return;
    }

    clearError();
    setTextC('');
    setDiffText('');

    // If we have transcribed text, use it. Otherwise, use textB as the source text.
    const textToProcess = textA.trim() ? textA : textB;
    await runGemini(textToProcess);
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      <header className="bg-white border-b border-zinc-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src={appIcon} 
              alt="Script Corrector Icon" 
              className="w-9 h-9 rounded-xl shadow-xs object-cover border border-zinc-200"
            />
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight">Script Corrector (口播稿校对工具-法语)</h1>
              <span className="px-2 py-0.5 text-xs font-semibold font-mono bg-indigo-50 text-indigo-700 border border-indigo-200/80 rounded-full">
                v1.0.0
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {errorInfo && (
          <div className="mb-6 p-5 bg-red-50/90 border border-red-200 rounded-2xl shadow-xs text-red-900 transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className="p-2.5 bg-red-100 rounded-xl text-red-600 shrink-0 mt-0.5">
                  <AlertCircle size={22} />
                </div>
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="font-semibold text-base text-red-900">{errorInfo.title}</h3>
                    {errorInfo.statusCode && (
                      <span className="px-2.5 py-0.5 text-xs font-mono font-bold bg-red-200/90 text-red-800 rounded-md">
                        HTTP {errorInfo.statusCode}
                      </span>
                    )}
                  </div>
                  
                  <div className="text-sm bg-white/90 p-3.5 rounded-xl border border-red-200/70 text-zinc-800 space-y-1">
                    <p className="font-medium text-red-950 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                      <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span>
                      猜测的错误原因 (Suspected Reason)：
                    </p>
                    <p className="text-zinc-700 pl-3 leading-relaxed text-sm">{errorInfo.suspectedReason}</p>
                  </div>

                  {errorInfo.quotaHint && (
                    <div className="text-xs bg-amber-50/90 p-3.5 rounded-xl border border-amber-200 text-amber-950 space-y-1">
                      <p className="font-semibold text-amber-900 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                        <span>📊</span>
                        使用量与配额检查提示 (Check Quota & Usage)：
                      </p>
                      <p className="pl-4 leading-relaxed text-zinc-700">{errorInfo.quotaHint}</p>
                    </div>
                  )}

                  {errorInfo.details && errorInfo.details !== errorInfo.suspectedReason && (
                    <details className="text-xs text-zinc-500 pt-0.5">
                      <summary className="cursor-pointer hover:text-zinc-700 font-medium select-none">
                        查看技术细节与原始错误信息 (Details)
                      </summary>
                      <pre className="mt-1.5 p-2.5 bg-zinc-100 rounded-lg overflow-x-auto text-[11px] text-zinc-700 font-mono border border-zinc-200 max-h-40 whitespace-pre-wrap">
                        {errorInfo.details}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
              <button 
                onClick={clearError}
                className="text-zinc-400 hover:text-zinc-700 text-xs px-2.5 py-1 rounded-lg hover:bg-red-100 transition-colors shrink-0"
              >
                ✕ 关闭
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Inputs */}
          <div className="space-y-6">
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                <FileAudio size={20} className="text-indigo-600" />
                1. 语音识别设置 (Transcription Settings)
              </h2>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Gladia API Key (可选 - 如果后台未配置或额度耗尽)
                </label>
                <input
                  type="text"
                  value={gladiaApiKeyInput}
                  onChange={(e) => setGladiaApiKeyInput(e.target.value)}
                  placeholder="在此粘贴新的 Gladia API Key..."
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono ${
                    gladiaApiKeyInput.trim() ? 'border-green-500 bg-green-50' : 'border-zinc-300'
                  }`}
                />
                {gladiaApiKeyInput.trim() && (
                  <p className="text-[10px] text-green-600 mt-1 font-medium italic">
                    ✓ 已启用自定义 API Key
                  </p>
                )}
                <p className="text-[10px] text-zinc-400 mt-1">
                  如果你在识别时遇到 402 错误，请尝试填入新获取的 Key。
                </p>
              </div>

              <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50 scale-[1.02]'
                    : audioFile 
                      ? 'border-emerald-500 bg-emerald-50' 
                      : 'border-zinc-300 hover:bg-zinc-50'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="audio/*" 
                  className="hidden" 
                />
                {audioFile ? (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
                      <FileAudio className="h-6 w-6 text-emerald-600" />
                    </div>
                    <p className="text-sm font-semibold text-emerald-800 truncate max-w-full px-4">
                      {audioFile.name}
                    </p>
                    <p className="text-xs text-emerald-600 mt-1">
                      {(audioFile.size / 1024 / 1024).toFixed(2)} MB • 已就绪
                    </p>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto h-10 w-10 text-zinc-400 mb-3" />
                    <p className="text-sm font-medium text-zinc-700">点击上传音频文件</p>
                    <p className="text-xs text-zinc-500 mt-1">支持 MP3, WAV, M4A 等格式</p>
                  </>
                )}
              </div>
            </section>

            <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium flex items-center gap-2">
                  <FileText size={20} className="text-indigo-600" />
                  2. 输入文字稿 (Reference Script - Text B)
                </h2>
                <button
                  onClick={() => handleCopyText(textB, setIsCopiedB)}
                  disabled={!textB.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isCopiedB ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  {isCopiedB ? '已复制' : '复制'}
                </button>
              </div>
              <textarea
                value={textB}
                onChange={(e) => setTextB(e.target.value)}
                placeholder="在此粘贴原始文字稿..."
                className="w-full h-64 p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none text-sm leading-relaxed"
              />
            </section>

            <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                <CheckCircle2 size={20} className="text-indigo-600" />
                3. 输出设置 (Output Settings)
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label htmlFor="enableLineBreaks" className="text-sm font-medium text-zinc-700">启用字幕规范断行 (Subtitle Line Breaks)</label>
                    <p className="text-xs text-zinc-400">按照自然语法与字符数上限进行优雅断行</p>
                  </div>
                  <input
                    id="enableLineBreaks"
                    type="checkbox"
                    checked={enableLineBreaks}
                    onChange={(e) => setEnableLineBreaks(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                  />
                </div>
                
                {enableLineBreaks && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="maxLength" className="block text-sm font-medium text-zinc-700 mb-1">
                          每行最长字符数 (Max Chars)
                        </label>
                        <input
                          id="maxLength"
                          type="number"
                          value={maxLineLength}
                          onChange={(e) => setMaxLineLength(Math.max(10, Number(e.target.value)))}
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          min="10"
                        />
                        <p className="text-[11px] text-zinc-400 mt-0.5">包含字母、标点与空格 (推荐 28-36)</p>
                      </div>
                      <div>
                        <label htmlFor="minLength" className="block text-sm font-medium text-zinc-700 mb-1">
                          每行最小字符数 (Min Chars)
                        </label>
                        <input
                          id="minLength"
                          type="number"
                          value={minLineLength}
                          onChange={(e) => setMinLineLength(Math.max(4, Number(e.target.value)))}
                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          min="4"
                        />
                        <p className="text-[11px] text-zinc-400 mt-0.5">防止单个单词独立成行 (推荐 10-15)</p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-100">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <label htmlFor="enableVisualOpt" className="text-sm font-medium text-zinc-700">视觉排版避险 (Visual Optimization)</label>
                          <p className="text-xs text-zinc-400">避开容易引起视觉不适的不协调断行区间</p>
                        </div>
                        <input
                          id="enableVisualOpt"
                          type="checkbox"
                          checked={enableVisualOptimization}
                          onChange={(e) => setEnableVisualOptimization(e.target.checked)}
                          className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500"
                        />
                      </div>
                      
                      {enableVisualOptimization && (
                        <div className="flex items-center gap-2 text-sm text-zinc-600 bg-zinc-50 p-3 rounded-lg border border-zinc-200">
                          <span>避开区间:</span>
                          <input
                            type="number"
                            value={visualOptStart}
                            onChange={(e) => setVisualOptStart(Number(e.target.value))}
                            className="w-16 px-2 py-1 border border-zinc-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center text-sm"
                          />
                          <span>到</span>
                          <input
                            type="number"
                            value={visualOptEnd}
                            onChange={(e) => setVisualOptEnd(Number(e.target.value))}
                            className="w-16 px-2 py-1 border border-zinc-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center text-sm"
                          />
                          <span>字符</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleProcess}
                disabled={isTranscribing || isCorrecting || isWakingUp || !audioFile || !textB.trim()}
                className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl font-medium shadow-sm transition-all flex items-center justify-center gap-2"
              >
                {(isTranscribing || isWakingUp || (isCorrecting && !textC && !diffText && audioFile)) ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    {isWakingUp ? '正在连接服务器...' : 
                     isTranscribing ? '正在识别音频...' : '正在校正文本...'}
                  </>
                ) : (
                  '完整处理 (Audio + Gemini)'
                )}
              </button>
              
              <button
                onClick={handleProcessGeminiOnly}
                disabled={isTranscribing || isCorrecting || !textB.trim()}
                className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl font-medium shadow-sm transition-all flex items-center justify-center gap-2"
              >
                {isCorrecting ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    正在校正文本...
                  </>
                ) : (
                  '仅运行 Gemini (Text Only)'
                )}
              </button>
            </div>
          </div>

          {/* Right Column: Results */}
          <div className="space-y-6">
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 flex flex-col min-h-[200px]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium flex items-center gap-2">
                  <FileText size={20} className="text-zinc-500" />
                  识别结果 (Transcription - Text A)
                </h2>
                <button
                  onClick={() => handleCopyText(textA, setIsCopiedA)}
                  disabled={!textA.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isCopiedA ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  {isCopiedA ? '已复制' : '复制'}
                </button>
              </div>
              <div className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl p-4 overflow-y-auto max-h-[300px]">
                {isTranscribing ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-400 py-8">
                    <Loader2 className="animate-spin mb-2" size={24} />
                    <p className="text-sm">正在调用 Gladia API...</p>
                  </div>
                ) : textA ? (
                  <p className="text-sm leading-relaxed text-zinc-700 whitespace-pre-wrap">{textA}</p>
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-400 text-sm py-8">
                    暂无识别结果
                  </div>
                )}
              </div>
            </section>

            <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 flex flex-col min-h-[340px]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={20} className="text-emerald-500" />
                  <h2 className="text-lg font-medium">最终校正文本 (Corrected - Text C)</h2>
                  {textC && (
                    <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-medium">
                      共 {textC.split('\n').filter(l => l.trim()).length} 行
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {textC && (
                    <button
                      id="toggle-stats-btn"
                      onClick={() => setShowLineStats(!showLineStats)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 border rounded-lg text-xs font-medium transition-colors ${
                        showLineStats 
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                          : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                      }`}
                      title="切换逐行字符统计与合规分析"
                    >
                      <Hash size={13} />
                      {showLineStats ? '隐藏行统计' : '显示行统计'}
                    </button>
                  )}
                  <button
                    id="reformat-lines-btn"
                    onClick={() => {
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
                    }}
                    disabled={!textC.trim()}
                    title="按当前设定的字符上限与语法规则重新精准排版断行"
                    className="flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <RefreshCw size={14} />
                    重新断行
                  </button>
                  <button
                    id="export-srt-btn"
                    onClick={handleExportSrt}
                    disabled={!textC.trim()}
                    title="根据当前分行与时间戳导出为 .srt 字幕文件并下载"
                    className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium transition-all ${
                      isExportedSrt
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                        : 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:border-zinc-200 disabled:text-zinc-400`}
                  >
                    {isExportedSrt ? <CheckCircle2 size={15} /> : <Download size={15} />}
                    {isExportedSrt ? '已下载 SRT' : '导出为 SRT'}
                  </button>
                  <button
                    id="export-txt-btn"
                    onClick={handleExportTxt}
                    disabled={!textC.trim()}
                    title="根据当前分行与序号/时间戳导出为 .txt 格式文本并下载"
                    className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium transition-all ${
                      isExportedTxt
                        ? 'bg-sky-600 border-sky-600 text-white shadow-sm'
                        : 'bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:border-zinc-200 disabled:text-zinc-400`}
                  >
                    {isExportedTxt ? <CheckCircle2 size={15} /> : <FileText size={15} />}
                    {isExportedTxt ? '已下载 TXT' : '导出为 TXT'}
                  </button>
                  <button
                    id="copy-textc-btn"
                    onClick={() => handleCopyText(textC, setIsCopiedC)}
                    disabled={!textC.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 border border-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isCopiedC ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                    {isCopiedC ? '已复制' : '复制'}
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 overflow-y-auto max-h-[460px]">
                {isCorrecting ? (
                  <div className="h-full flex flex-col items-center justify-center text-emerald-600/60 py-8">
                    <Loader2 className="animate-spin mb-2" size={24} />
                    <p className="text-sm">正在使用 Gemini 进行校正与排版...</p>
                  </div>
                ) : textC ? (
                  showLineStats ? (
                    <div className="space-y-1.5 font-mono text-xs">
                      {textC.split('\n').map((line, idx) => {
                        const trimmed = line.trim();
                        const len = trimmed.length;
                        const isOverMax = len > maxLineLength;
                        const isUnderMin = len > 0 && len < minLineLength;
                        const isVisualOptAlert = enableVisualOptimization && len >= visualOptStart && len <= visualOptEnd;

                        return (
                          <div 
                            key={idx} 
                            className={`flex items-start gap-2 p-1.5 rounded transition-colors ${
                              isOverMax 
                                ? 'bg-red-100/70 text-red-900' 
                                : isVisualOptAlert
                                  ? 'bg-amber-100/60 text-amber-900'
                                  : 'hover:bg-emerald-100/60 text-zinc-800'
                            }`}
                          >
                            <span className="shrink-0 w-8 text-right text-zinc-400 font-sans select-none text-[11px]">
                              {idx + 1}
                            </span>
                            <span className="flex-1 font-sans text-sm leading-snug break-words">
                              {trimmed || <span className="text-zinc-300 italic">(空行)</span>}
                            </span>
                            <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-sans font-medium select-none ${
                              isOverMax 
                                ? 'bg-red-200 text-red-800 font-bold' 
                                : isUnderMin 
                                  ? 'bg-orange-100 text-orange-700'
                                  : isVisualOptAlert
                                    ? 'bg-amber-200 text-amber-800'
                                    : 'bg-emerald-200/80 text-emerald-800'
                            }`}>
                              {len} 字符
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm leading-relaxed text-zinc-800 whitespace-pre-wrap font-medium">
                      {textC}
                    </div>
                  )
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-400 text-sm py-8">
                    暂无校正结果
                  </div>
                )}
              </div>
            </section>

            <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 flex flex-col min-h-[200px]">
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                <FileText size={20} className="text-amber-500" />
                差异分析 (Differences: Text C vs Text B)
              </h2>
              <div className="flex-1 bg-amber-50/50 border border-amber-100 rounded-xl p-4 overflow-y-auto max-h-[300px]">
                {isCorrecting ? (
                  <div className="h-full flex flex-col items-center justify-center text-amber-600/60 py-8">
                    <Loader2 className="animate-spin mb-2" size={24} />
                    <p className="text-sm">正在分析差异...</p>
                  </div>
                ) : diffText ? (
                  <div className="text-sm leading-relaxed text-zinc-800 whitespace-pre-wrap">
                    {diffText}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-400 text-sm py-8">
                    暂无差异分析
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-6 text-center text-xs text-zinc-400 border-t border-zinc-200 mt-12">
        <span>Script Corrector (口播稿校对工具-法语) · 版本 v1.0.0</span>
      </footer>
    </div>
  );
}
