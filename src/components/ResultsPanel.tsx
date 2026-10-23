import React, { useState } from 'react';
import { FileText, CheckCircle2, Copy, Download, RefreshCw, Hash, Loader2 } from 'lucide-react';
import { SupportedLanguage, ReportLanguage } from '../types';

interface ResultsPanelProps {
  selectedLanguage: SupportedLanguage;
  textA: string;
  textC: string;
  diffText: string;
  isTranscribing: boolean;
  isCorrecting: boolean;
  maxLineLength: number;
  minLineLength: number;
  enableVisualOptimization: boolean;
  visualOptStart: number;
  visualOptEnd: number;
  onReformatLines: () => void;
  onExportSrt: () => void;
  onExportTxt: () => void;
  diffLanguage: ReportLanguage;
  onDiffLanguageChange: (lang: ReportLanguage) => void;
}

export const ResultsPanel: React.FC<ResultsPanelProps> = ({
  selectedLanguage,
  textA,
  textC,
  diffText,
  isTranscribing,
  isCorrecting,
  maxLineLength,
  minLineLength,
  enableVisualOptimization,
  visualOptStart,
  visualOptEnd,
  onReformatLines,
  onExportSrt,
  onExportTxt,
  diffLanguage,
  onDiffLanguageChange,
}) => {
  const [showLineStats, setShowLineStats] = useState(true);
  const [isCopiedA, setIsCopiedA] = useState(false);
  const [isCopiedC, setIsCopiedC] = useState(false);
  const [isCopiedDiff, setIsCopiedDiff] = useState(false);

  const handleCopy = async (text: string, setCopied: (v: boolean) => void) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  const langLabel = selectedLanguage === 'es' ? '西语' : selectedLanguage === 'fr' ? '法语' : '英语';

  return (
    <div className="space-y-6">
      {/* 1. Text A - Transcription */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 flex flex-col min-h-[200px]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <FileText size={20} className="text-zinc-500" />
            识别结果 (Transcription - Text A {langLabel})
          </h2>
          <button
            onClick={() => handleCopy(textA, setIsCopiedA)}
            disabled={!textA.trim()}
            className="flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
          >
            {isCopiedA ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
            <span>{isCopiedA ? '已复制' : '复制'}</span>
          </button>
        </div>
        <div className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl p-4 overflow-y-auto max-h-[300px]">
          {isTranscribing ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400 py-8">
              <Loader2 className="animate-spin mb-2" size={24} />
              <p className="text-sm">正在调用 Gladia API 进行{selectedLanguage === 'es' ? '西班牙语' : selectedLanguage === 'fr' ? '法语' : '英语'}转录...</p>
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

      {/* 2. Text C - Corrected & Formatted Subtitles */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 flex flex-col min-h-[340px]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-emerald-500" />
            <h2 className="text-lg font-medium">最终校正文本 (Corrected - Text C {langLabel})</h2>
            {textC && (
              <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-medium">
                共 {textC.split('\n').filter(l => l.trim()).length} 行
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {textC && (
              <button
                onClick={() => setShowLineStats(!showLineStats)}
                className={`flex items-center gap-1 px-2.5 py-1.5 border rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  showLineStats 
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                    : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                }`}
                title="切换逐行字符统计与合规分析"
              >
                <Hash size={13} />
                <span>{showLineStats ? '隐藏行统计' : '显示行统计'}</span>
              </button>
            )}
            <button
              onClick={onReformatLines}
              disabled={!textC.trim()}
              title="按当前设定的字符上限与语法规则重新精准排版断行"
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
            >
              <RefreshCw size={14} />
              <span>重新断行</span>
            </button>
            <button
              onClick={onExportSrt}
              disabled={!textC.trim()}
              title="根据当前分行与时间戳导出为 .srt 字幕文件并下载"
              className="flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:border-zinc-200 disabled:text-zinc-400 cursor-pointer shadow-xs"
            >
              <Download size={15} />
              <span>导出为 SRT</span>
            </button>
            <button
              onClick={onExportTxt}
              disabled={!textC.trim()}
              title="根据当前分行与序号/时间戳导出为 .txt 格式文本并下载"
              className="flex items-center gap-1.5 px-3 py-1.5 border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:border-zinc-200 disabled:text-zinc-400 cursor-pointer shadow-xs"
            >
              <FileText size={15} />
              <span>导出为 TXT</span>
            </button>
            <button
              onClick={() => handleCopy(textC, setIsCopiedC)}
              disabled={!textC.trim()}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
            >
              {isCopiedC ? <CheckCircle2 size={16} /> : <Copy size={16} />}
              <span>{isCopiedC ? '已复制' : '复制'}</span>
            </button>
          </div>
        </div>

        <div className="flex-1 bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 overflow-y-auto max-h-[460px]">
          {isCorrecting ? (
            <div className="h-full flex flex-col items-center justify-center text-emerald-600/60 py-8">
              <Loader2 className="animate-spin mb-2" size={24} />
              <p className="text-sm">正在使用 Gemini 进行智能校正与精准排版...</p>
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

      {/* 3. Differences Report */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 flex flex-col min-h-[200px]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <FileText size={20} className="text-amber-500" />
            核对差异分析 (Análisis de Diferencias: Texto C vs Texto B)
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200 text-xs">
              <button
                onClick={() => onDiffLanguageChange('es')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                  diffLanguage === 'es'
                    ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
                title="使用西班牙语输出差异核对报告"
              >
                🇪🇸 西语报告
              </button>
              <button
                onClick={() => onDiffLanguageChange('zh')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                  diffLanguage === 'zh'
                    ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
                title="使用中文输出差异核对报告"
              >
                🇨🇳 中文报告
              </button>
            </div>
            <button
              onClick={() => handleCopy(diffText, setIsCopiedDiff)}
              disabled={!diffText.trim()}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
            >
              {isCopiedDiff ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
              <span>{isCopiedDiff ? '已复制' : '复制'}</span>
            </button>
          </div>
        </div>
        <div className="flex-1 bg-amber-50/50 border border-amber-100 rounded-xl p-4 overflow-y-auto max-h-[300px]">
          {isCorrecting ? (
            <div className="h-full flex flex-col items-center justify-center text-amber-600/60 py-8">
              <Loader2 className="animate-spin mb-2" size={24} />
              <p className="text-sm">
                {diffLanguage === 'es' 
                  ? '正在生成西班牙语核对与差异分析报告 (Generando análisis en español)...' 
                  : '正在分析核对差异...'}
              </p>
            </div>
          ) : diffText ? (
            <div className="text-sm leading-relaxed text-zinc-800 whitespace-pre-wrap">
              {diffText}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-400 text-sm py-8">
              暂无核对分析结果 (Sin análisis de diferencias aún)
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
