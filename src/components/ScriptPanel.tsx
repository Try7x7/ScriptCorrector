import React, { useState } from 'react';
import { FileText, Copy, CheckCircle2, Trash2 } from 'lucide-react';
import { SupportedLanguage } from '../types';
import { Tooltip } from './Tooltip';

interface ScriptPanelProps {
  textB: string;
  onTextBChange: (val: string) => void;
  selectedLanguage: SupportedLanguage;
}

export const ScriptPanel: React.FC<ScriptPanelProps> = ({
  textB,
  onTextBChange,
  selectedLanguage,
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    if (!textB.trim()) return;
    try {
      await navigator.clipboard.writeText(textB);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  const getPlaceholder = () => {
    switch (selectedLanguage) {
      case 'es':
        return '在此粘贴西班牙语原始文案稿 (Pega aquí el guion original en español)...';
      case 'fr':
        return '在此粘贴法语原始文案稿 (Collez ici le texte original en français)...';
      default:
        return '在此粘贴原始文案稿 (Paste reference script here)...';
    }
  };

  return (
    <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium flex items-center gap-2">
          <FileText size={20} className="text-indigo-600" />
          2. 输入文字稿 (Reference Script - Text B)
        </h2>
        <div className="flex items-center gap-2">
          {textB.trim() && (
            <Tooltip content="一键清空输入框里的所有参考文字稿，方便您直接粘贴新的一篇文稿进来。">
              <button
                type="button"
                onClick={() => onTextBChange('')}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                title="清空文本"
              >
                <Trash2 size={14} />
                <span>清空</span>
              </button>
            </Tooltip>
          )}
          <Tooltip content="一键复制参考文字稿全文到剪贴板，方便在别处备份或对比。" align="right">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!textB.trim()}
              title="复制文字稿"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-lg text-xs font-medium text-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
            >
              {isCopied ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />}
              <span>{isCopied ? '已复制' : '复制'}</span>
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="relative">
        <textarea
          value={textB}
          onChange={(e) => onTextBChange(e.target.value)}
          placeholder={getPlaceholder()}
          className="w-full h-64 p-4 bg-zinc-50/70 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white outline-none resize-none text-sm leading-relaxed transition-all"
        />
        <div className="absolute bottom-3 right-4 text-xs text-zinc-400 select-none bg-zinc-50/90 px-2 py-0.5 rounded-md">
          {textB.length} 字
        </div>
      </div>
    </section>
  );
};
