import React from 'react';
import { AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { ApiErrorInfo } from '../types';
import { AI_STUDIO_QUOTA_URL } from '../config/constants';
import { Tooltip } from './Tooltip';

interface QuotaAlertProps {
  error: string | null;
  errorInfo: ApiErrorInfo | null;
  onClose: () => void;
  onRetry?: () => void;
  isRetrying?: boolean;
  canRetry?: boolean;
}

export const QuotaAlert: React.FC<QuotaAlertProps> = ({
  error,
  errorInfo,
  onClose,
  onRetry,
  isRetrying = false,
  canRetry = true,
}) => {
  if (!error && !errorInfo) return null;

  return (
    <div className="mb-6 p-5 bg-red-50/90 border border-red-200 rounded-2xl shadow-xs text-red-900 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertCircle className="shrink-0 mt-0.5 text-red-600" size={22} />
          <div>
            <h3 className="font-semibold text-base text-red-950 flex flex-wrap items-center gap-2">
              <span>文本校正请求遇到问题</span>
              {errorInfo?.errorCode && (
                <span className="text-xs font-mono font-bold px-2 py-0.5 bg-red-100 text-red-800 rounded-md border border-red-300">
                  {errorInfo.errorCode}
                </span>
              )}
            </h3>
            <p className="text-sm text-red-800 mt-1">
              {errorInfo?.message || error}
            </p>
          </div>
        </div>
        <Tooltip content="关闭当前错误提示">
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-lg text-sm transition-colors cursor-pointer"
            title="关闭提示"
          >
            ✕
          </button>
        </Tooltip>
      </div>

      {errorInfo?.errorReason && (
        <div className="mt-3.5 pt-3 border-t border-red-200/70 text-xs sm:text-sm">
          <div className="flex items-start gap-2">
            <span className="font-semibold text-red-950 shrink-0">🤔 猜测的原因:</span>
            <span className="text-red-900 leading-relaxed">{errorInfo.errorReason}</span>
          </div>
        </div>
      )}

      {/* Quota tip & usage checking guidance */}
      <div className="mt-3.5 p-3.5 bg-amber-50/90 border border-amber-200 rounded-xl text-amber-900 text-xs sm:text-sm">
        <div className="flex items-start gap-2.5">
          <span className="text-base leading-none shrink-0 mt-0.5">💡</span>
          <div className="space-y-2 flex-1">
            <p className="font-semibold text-amber-950">
              调用配额保护与用量检查提示 (Quota Notice)
            </p>
            <p className="text-amber-900/90 leading-relaxed">
              {errorInfo?.quotaTip || "免费层配额较为有限（通常上限为 5 RPM 每分钟请求数 / 20 RPD 每日请求数）。系统已将后台自动重试次数设为 0 次以避免过度消耗。请前往 Google AI Studio 检查当前用量状态，稍候 1~2 分钟再试。"}
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <a
                href={AI_STUDIO_QUOTA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs transition-colors shadow-xs"
              >
                <span>前往 Google AI Studio 检查使用量 (Check Quota)</span>
                <ExternalLink size={13} />
              </a>
              {canRetry && onRetry && (
                <Tooltip content="刚才只是向 AI 请求校对时网络闪断或服务器拥挤。录音已经听写好了，点这里可以直接重新校对，不用再花时间重新上传录音。">
                  <button
                    type="button"
                    onClick={onRetry}
                    disabled={isRetrying}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-100 text-zinc-800 font-medium text-xs border border-zinc-300 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw size={13} className={isRetrying ? "animate-spin" : ""} />
                    <span>手动重试校对 (不重复语音识别)</span>
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
