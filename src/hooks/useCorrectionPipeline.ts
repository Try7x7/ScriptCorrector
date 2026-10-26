import { useState, useRef, useEffect, useCallback } from 'react';
import { SupportedLanguage, ReportLanguage, ApiErrorInfo, PromptFormattingOptions, Utterance } from '../types';
import { DEFAULT_GEMINI_MODEL, SUBTITLE_DEFAULTS } from '../config/constants';
import { getStructuredCorrectionPrompt } from '../config/prompts';
import { formatSubtitles, downloadSrtFile, downloadTxtFile } from '../utils/subtitleFormatter';
import { apiFetch, waitForServer, ApiError } from '../utils/apiClient';

interface TranscribeStartResponse {
  taskId?: string;
  text?: string;
  status?: string;
  utterances?: Utterance[];
}

interface TranscribeStatusResponse {
  status: 'queued' | 'processing' | 'done' | 'error';
  text?: string;
  utterances?: Utterance[];
  error?: string;
}

interface GeminiCorrectionResponse {
  text: string;
  model: string;
}

export function useCorrectionPipeline() {
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>('es');
  const [gladiaApiKeyInput, setGladiaApiKeyInput] = useState('');
  
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [textB, setTextB] = useState('');
  const [textA, setTextA] = useState('');
  const [textC, setTextC] = useState('');
  const [originalGeminiText, setOriginalGeminiText] = useState('');
  const [diffText, setDiffText] = useState('');
  const [diffLanguage, setDiffLanguage] = useState<ReportLanguage>('es');
  const [transcriptionUtterances, setTranscriptionUtterances] = useState<Utterance[]>([]);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<ApiErrorInfo | null>(null);

  // Grouped subtitle options
  const [subtitleOptions, setSubtitleOptions] = useState<PromptFormattingOptions>({
    enableLineBreaks: SUBTITLE_DEFAULTS.enableLineBreaks,
    maxLineLength: SUBTITLE_DEFAULTS.maxLineLength,
    minLineLength: SUBTITLE_DEFAULTS.minLineLength,
    enableVisualOptimization: SUBTITLE_DEFAULTS.enableVisualOptimization,
    visualOptStart: SUBTITLE_DEFAULTS.visualOptStart,
    visualOptEnd: SUBTITLE_DEFAULTS.visualOptEnd,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Cancel ongoing operation and clean up on unmount
  const cancelOperation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsTranscribing(false);
    setIsCorrecting(false);
    setIsWakingUp(false);
  }, []);

  useEffect(() => {
    return () => {
      cancelOperation();
    };
  }, [cancelOperation]);

  const handleAudioSelect = useCallback((file: File | null) => {
    setError(null);
    setErrorInfo(null);

    if (!file) {
      setAudioFile(null);
      setAudioDuration(null);
      setTranscriptionUtterances([]);
      return;
    }

    // Enforce 50MB client limit
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setError(`音频文件体积为 ${sizeMb}MB，已超过 50MB 上限。请压缩后重新上传。`);
      setErrorInfo({
        message: `音频文件过大 (${sizeMb}MB)`,
        errorCode: 'CLIENT_PAYLOAD_TOO_LARGE',
        errorReason: `音频文件大小为 ${sizeMb}MB，超过系统 50MB 上限。`,
        quotaTip: '💡 文件已被前端拦截，未发送到云端，消耗额度为 0。'
      });
      setAudioFile(null);
      setAudioDuration(null);
      setTranscriptionUtterances([]);
      return;
    }

    setAudioFile(file);
    setAudioDuration(null);
    setTranscriptionUtterances([]);

    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    audio.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      audio.onloadedmetadata = null;
      audio.onerror = null;
    };

    audio.onloadedmetadata = () => {
      setAudioDuration(audio.duration);
      cleanup();
    };

    audio.onerror = () => {
      cleanup();
    };
  }, []);

  const applyFormat = useCallback((raw: string, opts = subtitleOptions): string => {
    if (!opts.enableLineBreaks || !raw.trim()) return raw;
    return formatSubtitles(raw, {
      maxLen: opts.maxLineLength,
      minLen: opts.minLineLength,
      enableVisualOpt: opts.enableVisualOptimization,
      visualOptStart: opts.visualOptStart,
      visualOptEnd: opts.visualOptEnd,
    });
  }, [subtitleOptions]);

  const runGemini = useCallback(async (transcribedText: string, signal?: AbortSignal) => {
    setIsCorrecting(true);
    setError(null);
    try {
      const referenceScript = textB.trim() || transcribedText.trim();
      const { systemInstruction, userPrompt } = getStructuredCorrectionPrompt(
        selectedLanguage,
        transcribedText,
        referenceScript,
        diffLanguage,
        subtitleOptions
      );

      const response = await apiFetch<GeminiCorrectionResponse>('/api/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          systemInstruction,
          model: DEFAULT_GEMINI_MODEL,
        }),
        signal,
      });

      // Parse JSON from Gemini response (handles optional markdown code blocks)
      let cleanText = response.text.trim();
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      }

      let parsed: { correctedText?: string; differences?: string } = {};
      try {
        const result = JSON.parse(cleanText);
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          if (result.correctedText !== undefined && result.correctedText !== null) {
            parsed = result;
          } else {
            // Missing correctedText in JSON object
            parsed = {
              correctedText: cleanText,
              differences: typeof result.differences === 'string'
                ? result.differences
                : '模型返回的对象中缺少 correctedText 字段，已直接呈现原始响应。'
            };
          }
        } else {
          parsed = {
            correctedText: typeof result === 'string' ? result : cleanText,
            differences: '模型未按约定格式返回对象，已直接提取输出内容。'
          };
        }
      } catch {
        // Fallback 1: Closed quotes regex match
        const correctedMatch = cleanText.match(/"correctedText"\s*:\s*"((?:\\.|[^"\\])*)"/);
        const diffMatch = cleanText.match(/"differences"\s*:\s*"((?:\\.|[^"\\])*)"/);
        if (correctedMatch) {
          try {
            parsed = {
              correctedText: JSON.parse(`"${correctedMatch[1]}"`),
              differences: diffMatch ? JSON.parse(`"${diffMatch[1]}"`) : '差异报告（已部分提取）'
            };
          } catch {
            parsed = { correctedText: correctedMatch[1], differences: diffMatch ? diffMatch[1] : '' };
          }
        } else {
          // Fallback 2: Truncated without closing quote (e.g. output cut off at token limit)
          const unclosedMatch = cleanText.match(/"correctedText"\s*:\s*"((?:\\.|[^"\\])*)$/);
          if (unclosedMatch) {
            const raw = unclosedMatch[1];
            // Strip any trailing hanging backslash
            const sanitized = raw.replace(/(\\+)$/, (match) => match.length % 2 === 1 ? match.slice(0, -1) : match);
            let recovered = '';
            try {
              recovered = JSON.parse(`"${sanitized}"`);
            } catch {
              recovered = sanitized
                .replace(/\\\\/g, '\0')
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '')
                .replace(/\\t/g, '\t')
                .replace(/\\"/g, '"')
                .replace(/\0/g, '\\');
            }
            parsed = {
              correctedText: recovered,
              differences: '校正文本输出过长导致末尾截断，已自动抢救并提取截断前的全部文本。'
            };
          } else {
            // Fallback 3: Raw response
            parsed = { correctedText: cleanText, differences: '差异报告解析失败，已直接呈现校正文本。' };
          }
        }
      }

      // Safe string conversion for correctedText: prevent TypeError if non-string type returned
      let rawCorrected = typeof parsed.correctedText === 'string'
        ? parsed.correctedText.trim()
        : (parsed.correctedText != null ? String(parsed.correctedText).trim() : '');
      let finalCorrected = rawCorrected;

      if (subtitleOptions.enableLineBreaks) {
        // Safety Fallback: If Gemini omitted line breaks completely on a long text, fallback to client-side DP formatter
        if (!rawCorrected.includes('\n') && rawCorrected.length > subtitleOptions.maxLineLength) {
          finalCorrected = applyFormat(rawCorrected);
        }
      } else {
        // If line breaks disabled, collapse any unexpected line breaks into continuous text
        finalCorrected = rawCorrected.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
      }

      setTextC(finalCorrected);
      setOriginalGeminiText(finalCorrected);
      setDiffText(parsed.differences || '');
    } catch (err: unknown) {
      if (signal?.aborted) return;
      if (err instanceof ApiError) {
        setErrorInfo(err.info);
        setError(`文本校正失败: ${err.message}`);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`文本校正失败: ${msg}`);
      }
    } finally {
      if (!signal?.aborted) {
        setIsCorrecting(false);
      }
    }
  }, [selectedLanguage, textB, diffLanguage, subtitleOptions, applyFormat]);

  const handleProcess = useCallback(async () => {
    if (!audioFile) {
      setError('请上传音频文件 (Please upload an audio file)');
      return;
    }
    if (audioFile.size > 50 * 1024 * 1024) {
      const sizeMb = (audioFile.size / (1024 * 1024)).toFixed(1);
      setError(`音频文件体积为 ${sizeMb}MB，超过了 50MB 上限。请压缩后重新上传。`);
      return;
    }

    cancelOperation();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    setError(null);
    setErrorInfo(null);
    setTextA('');
    setTextC('');
    setDiffText('');
    setTranscriptionUtterances([]);

    // Step 0: Warm up / check server status
    setIsWakingUp(true);
    try {
      await waitForServer(signal);
    } catch {
      if (signal.aborted) return;
    } finally {
      setIsWakingUp(false);
    }

    // Step 1: Transcribe Audio
    setIsTranscribing(true);
    let transcribed = '';
    let utterances: Utterance[] = [];
    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('language', selectedLanguage);

      const headers: Record<string, string> = {
        'X-Target-Language': selectedLanguage,
      };
      if (gladiaApiKeyInput.trim()) {
        headers['X-Gladia-API-Key'] = gladiaApiKeyInput.trim();
      }

      // Request async task start
      const startRes = await apiFetch<TranscribeStartResponse>('/api/transcribe?async=true', {
        method: 'POST',
        headers,
        body: formData,
        signal,
      });

      if (startRes.text) {
        transcribed = startRes.text;
        utterances = startRes.utterances || [];
      } else if (startRes.taskId) {
        // Poll for task status
        const taskId = startRes.taskId;
        let isFinished = false;
        let attempts = 0;
        const maxAttempts = 180; // Max 6 minutes (2s interval)
        let lastSuccessfulPollTime = Date.now();

        while (!isFinished && !signal.aborted && attempts < maxAttempts) {
          attempts++;
          await new Promise(r => setTimeout(r, 2000));
          if (signal.aborted) return;

          let pollRes: TranscribeStatusResponse;
          try {
            pollRes = await apiFetch<TranscribeStatusResponse>(`/api/transcribe/status/${taskId}`, {
              headers,
              signal,
            });
            lastSuccessfulPollTime = Date.now();
          } catch (pollErr: unknown) {
            if (signal.aborted) return;
            // Tolerates transient network drops, 408/429, 5xx errors, and container cold boot (CONTAINER_STARTING) for up to 60s
            const isApiError = pollErr instanceof ApiError;
            const status = isApiError ? pollErr.status : 0;
            const errorCode = isApiError ? pollErr.info?.errorCode : '';
            const isContainerStarting = errorCode === 'CONTAINER_STARTING' || 
              (pollErr instanceof Error && pollErr.message.includes('Starting Server'));
            const isTransient = isContainerStarting || status === 408 || status === 429 || (status >= 500 && status <= 599) || status === 0;

            if (!isTransient || (Date.now() - lastSuccessfulPollTime > 60000)) {
              throw pollErr;
            }
            continue;
          }

          if (pollRes.status === 'done') {
            transcribed = pollRes.text || '';
            utterances = pollRes.utterances || [];
            isFinished = true;
            break;
          } else if (pollRes.status === 'error') {
            throw new Error(pollRes.error || '语音识别任务失败');
          }
        }

        if (!isFinished && !signal.aborted) {
          throw new Error('语音识别轮询超时（超过 6 分钟）');
        }
      }

      setTextA(transcribed);
      setTranscriptionUtterances(utterances);
      setIsTranscribing(false);

      // Step 2: Run Gemini Correction
      await runGemini(transcribed, signal);
    } catch (err: unknown) {
      if (signal.aborted) return;
      setIsTranscribing(false);
      if (err instanceof ApiError) {
        setErrorInfo(err.info);
        setError(`语音识别失败: ${err.message}`);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`语音识别失败: ${msg}`);
      }
    }
  }, [audioFile, textB, selectedLanguage, gladiaApiKeyInput, cancelOperation, runGemini]);

  const handleProcessGeminiOnly = useCallback(async () => {
    if (!textB.trim() && !textA.trim()) {
      setError('请输入参考文字稿 (Text B) 或提供识别结果 (Text A) 后方可运行 Gemini');
      return;
    }

    cancelOperation();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    setError(null);
    setErrorInfo(null);
    setTextC('');
    setDiffText('');

    // Step 0: Warm up / check server status
    setIsWakingUp(true);
    try {
      await waitForServer(signal);
    } catch {
      if (signal.aborted) return;
    } finally {
      setIsWakingUp(false);
    }

    const textToProcess = textA.trim() ? textA : textB;
    await runGemini(textToProcess, signal);
  }, [textB, textA, cancelOperation, runGemini]);

  const handleReformatLines = useCallback(() => {
    if (textC) {
      setTextC(applyFormat(textC));
    }
  }, [textC, applyFormat]);

  const handleRestoreGeminiResult = useCallback(() => {
    if (originalGeminiText) {
      setTextC(originalGeminiText);
    }
  }, [originalGeminiText]);

  const handleExportSrt = useCallback(() => {
    if (!textC.trim()) return;
    const baseName = audioFile ? audioFile.name.replace(/\.[^/.]+$/, '') : 'subtitles';
    downloadSrtFile(
      textC,
      `${baseName}_${selectedLanguage}.srt`,
      audioDuration || undefined,
      transcriptionUtterances.length > 0 ? transcriptionUtterances : undefined
    );
  }, [textC, audioFile, selectedLanguage, audioDuration, transcriptionUtterances]);

  const handleExportTxt = useCallback(() => {
    if (!textC.trim()) return;
    const baseName = audioFile ? audioFile.name.replace(/\.[^/.]+$/, '') : 'subtitles';
    downloadTxtFile(
      textC,
      `${baseName}_${selectedLanguage}.txt`,
      audioDuration || undefined,
      transcriptionUtterances.length > 0 ? transcriptionUtterances : undefined
    );
  }, [textC, audioFile, selectedLanguage, audioDuration, transcriptionUtterances]);

  return {
    selectedLanguage,
    setSelectedLanguage,
    gladiaApiKeyInput,
    setGladiaApiKeyInput,
    audioFile,
    audioDuration,
    handleAudioSelect,
    textB,
    setTextB,
    textA,
    setTextA,
    textC,
    setTextC,
    originalGeminiText,
    canRestoreGemini: Boolean(originalGeminiText && textC !== originalGeminiText),
    handleRestoreGeminiResult,
    diffText,
    diffLanguage,
    setDiffLanguage,
    subtitleOptions,
    setSubtitleOptions,
    transcriptionUtterances,
    isTranscribing,
    isCorrecting,
    isWakingUp,
    error,
    setError,
    errorInfo,
    setErrorInfo,
    cancelOperation,
    handleProcess,
    handleProcessGeminiOnly,
    handleReformatLines,
    handleExportSrt,
    handleExportTxt,
  };
}
