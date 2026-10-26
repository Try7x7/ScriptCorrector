export type SupportedLanguage = 'es' | 'fr' | 'en';
export type ReportLanguage = 'es' | 'zh';

export interface ApiErrorInfo {
  message: string;
  errorCode?: string;
  errorReason?: string;
  quotaTip?: string;
  model?: string;
  details?: string;
}

export interface PromptFormattingOptions {
  enableLineBreaks: boolean;
  maxLineLength: number;
  minLineLength: number;
  enableVisualOptimization: boolean;
  visualOptStart: number;
  visualOptEnd: number;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface Utterance {
  start: number;
  end: number;
  text: string;
  words?: WordTimestamp[];
}

export interface Cue {
  index: number;
  start: number;
  end: number;
  text: string;
}
