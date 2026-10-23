import { SupportedLanguage } from '../types';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export const AI_STUDIO_QUOTA_URL = 'https://aistudio.google.com/app/plan_information';

export const LANGUAGE_OPTIONS: Array<{
  id: SupportedLanguage;
  label: string;
  flag: string;
  description: string;
}> = [
  { id: 'es', label: '西班牙语 (Español)', flag: '🇪🇸', description: '神圣代词大写，西语标点 « » ¿ ? ¡ ! 规范' },
  { id: 'fr', label: '法语 (Français)', flag: '🇫🇷', description: '神圣代词大写，法语书名引号 « » 规范' },
  { id: 'en', label: '英语 (English)', flag: '🇬🇧', description: '双重标准校对与标点规范' },
];

export const SUBTITLE_DEFAULTS = {
  enableLineBreaks: true,
  maxLineLength: 25,
  minLineLength: 12,
  enableVisualOptimization: true,
  visualOptStart: 20,
  visualOptEnd: 24,
  showLineStats: true,
};
