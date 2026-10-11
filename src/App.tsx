import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileAudio, FileText, CheckCircle2, Loader2, AlertCircle, Copy, RefreshCw, Eye, Hash, Download, FileDown } from 'lucide-react';
import { formatSubtitles, downloadSrtFile, downloadTxtFile } from './utils/subtitleFormatter';
import appIcon from './assets/images/script_corrector_icon_1791735239310.jpg';

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
  const [error, setError] = useState<string | null>(null);
  
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
        setError(null);
      } else {
        setError('请上传音频文件 (Please upload an audio file)');
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
      setError(null);
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
      setError('请上传音频文件 (Please upload an audio file)');
      return;
    }
    if (!textB.trim()) {
      setError('请输入文字稿 (Please enter the reference text)');
      return;
    }

    if (gladiaApiKeyInput.trim() && !/^[a-zA-Z0-9_\-]{16,128}$/.test(gladiaApiKeyInput.trim())) {
      setError('自定义 Gladia API Key 格式无效，请检查是否包含空格或特殊字符。');
      return;
    }

    setError(null);
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

      if (!response.ok) {
        let errorMsg = 'Transcription failed';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
          if (errorData.details) {
            errorMsg += ` (${typeof errorData.details === 'object' ? JSON.stringify(errorData.details) : errorData.details})`;
          }
        } catch (e) {
          const text = await response.text();
          errorMsg = `Server error (${response.status}): ${text.substring(0, 100)}`;
        }
        throw new Error(errorMsg);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        if (text.trim().startsWith('<!doctype html') || text.trim().startsWith('<html')) {
           throw new Error('服务器连接异常 (Server returned HTML)。请尝试刷新页面或稍后重试。');
        }
        throw new Error(`Unexpected response format (expected JSON, got ${contentType}): ${text.substring(0, 200)}`);
      }

      const data = await response.json();
      transcribedText = data.text;
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
          model: 'gemini-3.6-flash',
        }),
      });

      if (!response.ok) {
        let errorMsg = 'Correction failed';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorData.details || errorMsg;
          if (errorData.details) {
            errorMsg += ` (${errorData.details})`;
          }
        } catch (e) {
          const text = await response.text();
          errorMsg = `Server error (${response.status}): ${text.substring(0, 100)}`;
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const responseText = data.text || '{}';
      
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
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700">
            <AlertCircle className="shrink-0 mt-0.5" size={20} />
            <p className="text-sm">{error}</p>
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
