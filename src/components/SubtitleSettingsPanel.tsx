import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface SubtitleSettingsPanelProps {
  enableLineBreaks: boolean;
  onEnableLineBreaksChange: (val: boolean) => void;
  maxLineLength: number;
  onMaxLineLengthChange: (val: number) => void;
  minLineLength: number;
  onMinLineLengthChange: (val: number) => void;
  enableVisualOptimization: boolean;
  onEnableVisualOptimizationChange: (val: boolean) => void;
  visualOptStart: number;
  onVisualOptStartChange: (val: number) => void;
  visualOptEnd: number;
  onVisualOptEndChange: (val: number) => void;
}

export const SubtitleSettingsPanel: React.FC<SubtitleSettingsPanelProps> = ({
  enableLineBreaks,
  onEnableLineBreaksChange,
  maxLineLength,
  onMaxLineLengthChange,
  minLineLength,
  onMinLineLengthChange,
  enableVisualOptimization,
  onEnableVisualOptimizationChange,
  visualOptStart,
  onVisualOptStartChange,
  visualOptEnd,
  onVisualOptEndChange,
}) => {
  return (
    <section className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
      <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
        <CheckCircle2 size={20} className="text-indigo-600" />
        3. 输出设置 (Output Settings)
      </h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <label htmlFor="enableLineBreaks" className="text-sm font-medium text-zinc-700 cursor-pointer">
              启用字幕规范断行 (Subtitle Line Breaks)
            </label>
            <p className="text-xs text-zinc-400">按照自然语法与字符数上限进行优雅断行</p>
          </div>
          <input
            id="enableLineBreaks"
            type="checkbox"
            checked={enableLineBreaks}
            onChange={(e) => onEnableLineBreaksChange(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500 cursor-pointer"
          />
        </div>
        
        {enableLineBreaks && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="maxLength" className="block text-sm font-medium text-zinc-700">
                    每行最长字符数 (Max Chars)
                  </label>
                  <span className="text-xs font-semibold px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100">
                    默认 25
                  </span>
                </div>
                <input
                  id="maxLength"
                  type="number"
                  value={maxLineLength}
                  onChange={(e) => onMaxLineLengthChange(Math.max(10, Number(e.target.value)))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                  min="10"
                />
                <p className="text-[11px] text-zinc-400 mt-0.5">包含字母、标点与空格 (默认: 25)</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="minLength" className="block text-sm font-medium text-zinc-700">
                    每行最小字符数 (Min Chars)
                  </label>
                  <span className="text-xs font-semibold px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100">
                    默认 12
                  </span>
                </div>
                <input
                  id="minLength"
                  type="number"
                  value={minLineLength}
                  onChange={(e) => onMinLineLengthChange(Math.max(4, Number(e.target.value)))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                  min="4"
                />
                <p className="text-[11px] text-zinc-400 mt-0.5">防止单个单词独立成行 (默认: 12)</p>
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] text-zinc-500">常用预设:</span>
              <button
                type="button"
                onClick={() => {
                  onMaxLineLengthChange(25);
                  onMinLineLengthChange(12);
                  onVisualOptStartChange(20);
                  onVisualOptEndChange(24);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all cursor-pointer ${
                  maxLineLength === 25 && minLineLength === 12
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold shadow-xs'
                    : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                ✓ 标准规范 (最长25 / 最小12)
              </button>
              <button
                type="button"
                onClick={() => {
                  onMaxLineLengthChange(30);
                  onMinLineLengthChange(12);
                  onVisualOptStartChange(24);
                  onVisualOptEndChange(29);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all cursor-pointer ${
                  maxLineLength === 30 && minLineLength === 12
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold shadow-xs'
                    : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                宽松排版 (最长30 / 最小12)
              </button>
            </div>

            <div className="pt-2 border-t border-zinc-100">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <label htmlFor="enableVisualOpt" className="text-sm font-medium text-zinc-700 cursor-pointer">
                    视觉排版避险 (Visual Optimization)
                  </label>
                  <p className="text-xs text-zinc-400">避开容易引起视觉不适的不协调断行区间</p>
                </div>
                <input
                  id="enableVisualOpt"
                  type="checkbox"
                  checked={enableVisualOptimization}
                  onChange={(e) => onEnableVisualOptimizationChange(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-zinc-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
              </div>
              
              {enableVisualOptimization && (
                <div className="flex items-center gap-2 text-sm text-zinc-600 bg-zinc-50 p-3 rounded-lg border border-zinc-200">
                  <span>避开区间:</span>
                  <input
                    type="number"
                    value={visualOptStart}
                    onChange={(e) => onVisualOptStartChange(Number(e.target.value))}
                    className="w-16 px-2 py-1 border border-zinc-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center text-sm"
                  />
                  <span>到</span>
                  <input
                    type="number"
                    value={visualOptEnd}
                    onChange={(e) => onVisualOptEndChange(Number(e.target.value))}
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
  );
};
