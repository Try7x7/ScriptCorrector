import React, { useState } from 'react';
import { 
  FileText, 
  CheckCircle2, 
  Copy, 
  Download, 
  RefreshCw, 
  Hash, 
  Loader2, 
  RotateCcw, 
  Edit3, 
  Trash2,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { SupportedLanguage, ReportLanguage } from '../types';
import { Tooltip } from './Tooltip';

interface ResultsPanelProps {
  selectedLanguage: SupportedLanguage;
  textA: string;
  onTextAChange?: (val: string) => void;
  textC: string;
  onTextCChange?: (val: string) => void;
  canRestoreGemini?: boolean;
  onRestoreGeminiResult?: () => void;
  hasGladiaTimestamps?: boolean;
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
  onTextAChange,
  textC,
  onTextCChange,
  canRestoreGemini = false,
  onRestoreGeminiResult,
  hasGladiaTimestamps = false,
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
  const [isEditModeC, setIsEditModeC] = useState(false);
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
  const linesC = textC.split('\n').filter(l => l.trim());

  return (
    <div className="space-y-6">
      {/* 1. Text A - Transcription */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 flex flex-col min-h-[220px]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-zinc-500" />
            <h2 className="text-lg font-medium flex items-center gap-2">
              <span>识别结果 (Transcription - Text A {langLabel})</span>
              {textA.trim() && (
                <span className="text-xs px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded-full font-sans">
                  {textA.length} 字
                </span>
              )}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {textA.trim() && onTextAChange && (
              <Tooltip content="清空当前识别出来的文字内容，方便您直接粘贴从其他软件拿到的现成文稿进行校对。">
                <button
                  type="button"
                  onClick={() => onTextAChange('')}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title="清空识别结果"
                >
                  <Trash2 size={14} />
                  <span>清空</span>
                </button>
              </Tooltip>
            )}
            <Tooltip content="一键复制语音识别出来的原始文字全文到剪贴板，方便在别处备份或对比。">
              <button
                type="button"
                onClick={() => handleCopy(textA, setIsCopiedA)}
                disabled={!textA.trim()}
                title="复制识别结果文本"
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
              >
                {isCopiedA ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
                <span>{isCopiedA ? '已复制' : '复制'}</span>
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl relative overflow-hidden flex flex-col min-h-[140px]">
          {isTranscribing ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400 py-8">
              <Loader2 className="animate-spin mb-2" size={24} />
              <p className="text-sm">正在调用 Gladia API 进行{selectedLanguage === 'es' ? '西班牙语' : selectedLanguage === 'fr' ? '法语' : '英语'}转录...</p>
            </div>
          ) : onTextAChange ? (
            <div className="relative flex-1 flex flex-col">
              <textarea
                value={textA}
                onChange={(e) => onTextAChange(e.target.value)}
                placeholder="音频识别完成后将在此显示结果；若已有文稿，也可直接在此粘贴或手动修改（有文字即可直接运行 Gemini 校对）..."
                className="w-full flex-1 min-h-[140px] max-h-[300px] p-4 bg-transparent outline-none resize-y text-sm leading-relaxed text-zinc-700 placeholder:text-zinc-400"
              />
              <div className="px-4 py-1.5 bg-zinc-100/70 border-t border-zinc-200/60 text-[11px] text-zinc-500 flex justify-between items-center select-none">
                <span>💡 识别结果可直接手动编辑或在此粘贴已转录文本</span>
                <span>{textA.length} 字符</span>
              </div>
            </div>
          ) : textA ? (
            <p className="p-4 text-sm leading-relaxed text-zinc-700 whitespace-pre-wrap">{textA}</p>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-400 text-sm py-8">
              暂无识别结果
            </div>
          )}
        </div>
      </section>

      {/* 2. Text C - Corrected & Formatted Subtitles */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 flex flex-col min-h-[340px]">
        {/* Tips Bubble Notification */}
        {textC && (
          <div className="mb-4 p-3.5 bg-indigo-50/90 border border-indigo-200/80 rounded-xl flex items-start gap-2.5 text-xs text-indigo-950 leading-relaxed shadow-xs">
            <HelpCircle size={16} className="text-indigo-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold text-indigo-800">💡 提示说明：</span>
              您可以在此直接<strong>手动修改校对文字</strong>（切换「手动编辑」即可自由打字修正）。
              修改后若需要按字数与语法规范重新自动排版，请点击<strong className="text-indigo-700">「重新断行」</strong>；
              若想放弃修改并一键撤销，随时点击边上的<strong className="text-indigo-700">「恢复 Gemini 结果」</strong>即可还原为最初的 AI 校对文本。
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-emerald-500" />
            <h2 className="text-lg font-medium">最终校正文本 (Corrected - Text C {langLabel})</h2>
            {textC && (
              <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-medium">
                共 {linesC.length} 行
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {textC && (
              <Tooltip content={isEditModeC ? "切换为行统计视图，直观查看每一行字幕具体有多少个字，一眼看出哪行字数太长或太短。" : "切换到文本输入框模式，您可以像在写字板里一样，直接在上面自由修改错别字、润色词句或微调换行。"}>
                <button
                  type="button"
                  onClick={() => setIsEditModeC(!isEditModeC)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 border rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    isEditModeC 
                      ? 'bg-amber-50 border-amber-300 text-amber-800 font-semibold' 
                      : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  }`}
                  title="切换编辑/统计模式"
                >
                  {isEditModeC ? <Hash size={13} /> : <Edit3 size={13} />}
                  <span>{isEditModeC ? '查看行统计' : '手动编辑文本'}</span>
                </button>
              </Tooltip>
            )}

            <Tooltip content="根据您设定的每行字数要求，把整篇文字重新整理切成整齐合适的一行行字幕。如果您刚才手动修改了错别字或调整了内容，点这里可以让系统自动帮您重新排好分行。">
              <button
                type="button"
                onClick={onReformatLines}
                disabled={!textC.trim()}
                title="按当前设定的字符上限与语法规则重新精准排版断行"
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
              >
                <RefreshCw size={14} className="text-indigo-600" />
                <span>重新断行</span>
              </button>
            </Tooltip>

            {onRestoreGeminiResult && (
              <Tooltip content={canRestoreGemini ? "如果不小心改错了，或者对重新断行的排版不满意，点这里可以一键撤销所有手动改动，恢复成最初 AI 帮您校对好的版本。" : "当前文本与最初 AI 校对出来的结果完全一致，无需恢复。"}>
                <button
                  type="button"
                  onClick={onRestoreGeminiResult}
                  disabled={!canRestoreGemini}
                  title="恢复为 Gemini 原始校对结果"
                  className="flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
                >
                  <RotateCcw size={14} className="text-amber-600" />
                  <span>恢复 Gemini 结果</span>
                </button>
              </Tooltip>
            )}

            <Tooltip 
              content={
                hasGladiaTimestamps
                  ? "把校对好的字幕导出为通用的 SRT 字幕文件。每行字幕都与刚才上传的音频录音说话时刻精确对应，可以直接拖进剪映、Premiere 等剪辑软件使用。"
                  : "把校对好的文字生成 SRT 字幕文件。因为本次没有上传音频录音，系统无法得知实际说话的声音快慢，因此每一行的时间轴是按字数平均估算出来的，方便您导入剪辑软件作为字幕模板再手动微调。"
              }
            >
              <button
                type="button"
                onClick={onExportSrt}
                disabled={!textC.trim()}
                title={
                  hasGladiaTimestamps
                    ? "导出为 SRT 字幕文件（包含真实录音时间轴）"
                    : "导出为 SRT 字幕文件（无音频，按字数估算时间轴）"
                }
                className="flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:border-zinc-200 disabled:text-zinc-400 cursor-pointer shadow-xs"
              >
                <Download size={15} />
                <span>导出为 SRT</span>
                {!hasGladiaTimestamps && textC.trim() && (
                  <span className="text-[10px] bg-indigo-200/80 text-indigo-800 font-normal px-1 rounded">
                    估算时间
                  </span>
                )}
              </button>
            </Tooltip>

            <Tooltip content="把整理校对好的全部文字直接保存为纯文本文档（.txt）。格式干净整齐，不受音频影响，方便您直接复制到文档、写演讲稿或发送给其他人查看。">
              <button
                type="button"
                onClick={onExportTxt}
                disabled={!textC.trim()}
                title="导出为 TXT 纯文本文档"
                className="flex items-center gap-1.5 px-3 py-1.5 border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:border-zinc-200 disabled:text-zinc-400 cursor-pointer shadow-xs"
              >
                <FileText size={15} />
                <span>导出为 TXT</span>
              </button>
            </Tooltip>

            <Tooltip content="一键把校对并排版好的全部字幕文字复制到剪贴板，方便您直接粘贴到微信、文档或剪辑软件中使用。" align="right">
              <button
                type="button"
                onClick={() => handleCopy(textC, setIsCopiedC)}
                disabled={!textC.trim()}
                title="复制校正文本"
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
              >
                {isCopiedC ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                <span>{isCopiedC ? '已复制' : '复制'}</span>
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="flex-1 bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 overflow-y-auto max-h-[480px]">
          {isCorrecting ? (
            <div className="h-full flex flex-col items-center justify-center text-emerald-600/60 py-8">
              <Loader2 className="animate-spin mb-2" size={24} />
              <p className="text-sm">正在使用 Gemini 进行智能校正与精准排版...</p>
            </div>
          ) : textC ? (
            isEditModeC && onTextCChange ? (
              <div className="flex flex-col h-full space-y-2">
                <textarea
                  value={textC}
                  onChange={(e) => onTextCChange(e.target.value)}
                  placeholder="在此直接手动编辑或修改校对结果文本..."
                  className="w-full h-72 p-4 bg-white/90 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-y text-sm font-sans leading-relaxed text-zinc-800 transition-all shadow-inner"
                />
                <div className="flex justify-between items-center text-xs text-zinc-500 px-1">
                  <span>💡 手动修改后可随时点击右上角「重新断行」规整排版，或点击「恢复 Gemini 结果」还原</span>
                  <span className="font-medium text-emerald-700">{textC.length} 字符 • {linesC.length} 行</span>
                </div>
              </div>
            ) : (
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
            <Sparkles size={20} className="text-amber-500" />
            核对差异分析 (Análisis de Diferencias: Texto C vs Texto B)
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200 text-xs">
              <Tooltip content="让 AI 用西班牙语列出详细清单，告诉您文稿哪里改动了、修了哪些生僻词和标点。">
                <button
                  type="button"
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
              </Tooltip>
              <Tooltip content="让 AI 用中文为您解释改动原因，清楚列出纠正了哪些错别字、改了哪些经文专有名词。">
                <button
                  type="button"
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
              </Tooltip>
            </div>
            <Tooltip content="一键复制这份 AI 差异校对报告全文，方便汇报或团队内部核对审核。" align="right">
              <button
                type="button"
                onClick={() => handleCopy(diffText, setIsCopiedDiff)}
                disabled={!diffText.trim()}
                title="复制差异核对报告"
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
              >
                {isCopiedDiff ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
                <span>{isCopiedDiff ? '已复制' : '复制'}</span>
              </button>
            </Tooltip>
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
