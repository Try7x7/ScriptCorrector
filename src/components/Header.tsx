import React from 'react';
import { ExternalLink, GitBranch } from 'lucide-react';
import { SupportedLanguage } from '../types';
import { Tooltip } from './Tooltip';

interface HeaderProps {
  selectedLanguage: SupportedLanguage;
}

const GITHUB_CHANGELOG_URL = "https://github.com/Try7x7/ScriptCorrector/blob/main/CHANGELOG.md";

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
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">Script Corrector · 口播稿校对与字幕工具</h1>
              <a
                href={GITHUB_CHANGELOG_URL}
                target="_blank"
                rel="noopener noreferrer"
                title="在 GitHub 查看 CHANGELOG.md"
                className="text-xs px-2 py-0.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 rounded-full font-mono font-medium transition-colors"
              >
                v1.2
              </a>
            </div>
            <p className="text-xs text-zinc-500">Gladia 语音转录 + Gemini 双重标准智能审校</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          <Tooltip content="打开 GitHub 仓库查看完整的 v1.2 更新日志（CHANGELOG.md）">
            <a
              href={GITHUB_CHANGELOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200/80 rounded-full text-xs font-medium transition-colors cursor-pointer shadow-2xs"
              title="查看 GitHub 仓库更新日志"
            >
              <GitBranch size={13} className="text-zinc-500" />
              <span>v1.2 更新日志</span>
              <ExternalLink size={12} className="text-zinc-400" />
            </a>
          </Tooltip>

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
