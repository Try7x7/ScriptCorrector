import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { SupportedLanguage } from '../types';

interface HeaderProps {
  selectedLanguage: SupportedLanguage;
}

export const Header: React.FC<HeaderProps> = ({ selectedLanguage }) => {
  return (
    <header className="bg-white border-b border-zinc-200 px-6 py-4 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img 
            src="/script_corrector_icon.jpg" 
            alt="Script Corrector Icon" 
            className="w-9 h-9 rounded-xl object-cover shadow-xs border border-zinc-200/80" 
            onError={(e) => {
              // Fallback to div if image fails
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Script Corrector · 口播稿校对与字幕工具</h1>
            <p className="text-xs text-zinc-500">Gladia 语音转录 + Gemini 双重标准智能审校</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 rounded-full text-xs font-medium text-zinc-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Gemini 3.8 Flash 就绪</span>
          </div>
          <div className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
            {selectedLanguage === 'es' ? '🇪🇸 西语' : selectedLanguage === 'fr' ? '🇫🇷 法语' : '🇬🇧 英语'}
          </div>
        </div>
      </div>
    </header>
  );
};
