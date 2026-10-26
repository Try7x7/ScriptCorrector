import React, { useRef, useState } from 'react';
import { FileAudio, Upload, Globe, Trash2 } from 'lucide-react';
import { SupportedLanguage } from '../types';
import { LANGUAGE_OPTIONS } from '../config/constants';
import { Tooltip } from './Tooltip';

interface TranscriptionPanelProps {
  selectedLanguage: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  gladiaApiKeyInput: string;
  onGladiaApiKeyChange: (key: string) => void;
  audioFile: File | null;
  onFileSelect: (file: File | null) => void;
}

export const TranscriptionPanel: React.FC<TranscriptionPanelProps> = ({
  selectedLanguage,
  onLanguageChange,
  gladiaApiKeyInput,
  onGladiaApiKeyChange,
  audioFile,
  onFileSelect,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('audio/')) {
        onFileSelect(file);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium flex items-center gap-2">
          <FileAudio size={20} className="text-indigo-600" />
          1. 语音识别设置 (Transcription Settings)
        </h2>
        <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100">
          {selectedLanguage === 'es' ? '🇪🇸 西语' : selectedLanguage === 'fr' ? '🇫🇷 法语' : '🇬🇧 英语'}
        </span>
      </div>

      {/* Language Selection Tabs */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-zinc-700 mb-2 flex items-center gap-1.5">
          <Globe size={15} className="text-zinc-500" />
          选择口播语音语言
        </label>
        <div className="grid grid-cols-3 gap-2">
          {LANGUAGE_OPTIONS.map((lang) => (
            <Tooltip
              key={lang.id}
              content={`告诉系统录音里讲的是${lang.label.split(' ')[0]}，系统会按照该语言的发音习惯进行听写，并按其专属规则帮您校对错字和断句。`}
              className="w-full"
            >
              <button
                type="button"
                onClick={() => onLanguageChange(lang.id)}
                title={`切换为 ${lang.label}`}
                className={`w-full flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  selectedLanguage === lang.id
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs font-semibold'
                    : 'bg-zinc-50/60 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <span className="text-lg mb-1">{lang.flag}</span>
                <span className="truncate max-w-full">{lang.label.split(' ')[0]}</span>
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Optional Gladia API Key */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-zinc-700 mb-1.5">
          Gladia API Key <span className="text-xs text-zinc-400 font-normal">(可选 - 自定义或应急切换)</span>
        </label>
        <input
          type="text"
          value={gladiaApiKeyInput}
          onChange={(e) => onGladiaApiKeyChange(e.target.value)}
          placeholder="在此粘贴自定义 Gladia API Key..."
          className={`w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono transition-colors ${
            gladiaApiKeyInput.trim() ? 'border-emerald-500 bg-emerald-50/50' : 'border-zinc-300'
          }`}
        />
        {gladiaApiKeyInput.trim() && (
          <p className="text-[10px] text-emerald-600 mt-1 font-medium">
            ✓ 已启用自定义 API Key
          </p>
        )}
      </div>

      {/* Audio File Drag & Drop Area */}
      <div 
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
          isDragging
            ? 'border-indigo-500 bg-indigo-50 scale-[1.01]'
            : audioFile 
              ? 'border-emerald-500 bg-emerald-50/70' 
              : 'border-zinc-300 hover:bg-zinc-50/80 hover:border-zinc-400'
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
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-3 text-emerald-600 shadow-xs">
              <FileAudio className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-emerald-900 truncate max-w-full px-4">
              {audioFile.name}
            </p>
            <p className="text-xs text-emerald-700 mt-1">
              {(audioFile.size / 1024 / 1024).toFixed(2)} MB • 已准备就绪
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Tooltip content="从电脑中重新选择其他录音文件进行替换。">
                <span className="text-xs text-zinc-500 underline hover:text-zinc-700 cursor-pointer">
                  点击更换音频文件
                </span>
              </Tooltip>
              <Tooltip content="移除当前选中的录音文件，恢复为空白状态。">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileSelect(null);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded transition-colors"
                  title="移除音频"
                >
                  <Trash2 size={12} />
                  <span>清除</span>
                </button>
              </Tooltip>
            </div>
          </div>
        ) : (
          <Tooltip content="点击选择电脑里的录音文件，或者直接把录音文件拖进这个框里（支持 MP3、WAV、M4A 等格式，文件大小在 50MB 以内）。">
            <div className="py-2">
              <Upload className="mx-auto h-10 w-10 text-zinc-400 mb-3" />
              <p className="text-sm font-medium text-zinc-700">点击上传音频文件 或 拖拽至此处</p>
              <p className="text-xs text-zinc-500 mt-1">支持 MP3, WAV, M4A, AAC, OGG 等格式 (上限 50MB)</p>
            </div>
          </Tooltip>
        )}
      </div>
    </section>
  );
};
