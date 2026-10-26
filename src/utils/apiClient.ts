import { ApiErrorInfo } from '../types';

export class ApiError extends Error {
  info: ApiErrorInfo;
  status: number;

  constructor(message: string, info: ApiErrorInfo, status = 500) {
    super(message);
    this.name = 'ApiError';
    this.info = info;
    this.status = status;
  }
}

/**
 * Robust fetch wrapper that checks for HTML gateway responses, handles AbortSignal,
 * detects local client network failures, and formats API errors predictably.
 */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err: unknown) {
    if (init?.signal?.aborted) {
      throw err;
    }
    const isNetworkError = err instanceof TypeError || (err instanceof Error && err.name === 'TypeError');
    if (isNetworkError) {
      throw new ApiError('本地网络连接失败', {
        message: '本地网络连接失败',
        errorCode: 'CLIENT_NETWORK_ERROR',
        errorReason: '您的浏览器与服务器之间的网络连接中断（请检查本地网络或 Wi-Fi 连接）。',
        quotaTip: '💡 本地请求未触达云端，本次操作完全未扣减任何额度（消耗为 0）。'
      }, 0);
    }
    throw err;
  }

  const rawText = await response.text();
  const rawLower = rawText.trim().toLowerCase();

  // Detect HTML gateway / container booting / proxy pages
  const isHtml = rawLower.startsWith('<!doctype') || rawLower.startsWith('<html');
  if (isHtml) {
    const isBooting = rawLower.includes('starting server') || rawLower.includes('please wait while your application starts');
    
    if (isBooting || response.status === 200) {
      const msg = '服务容器正在唤醒中 (Starting Server)：本次未消耗任何额度，请稍候 2~3 秒后重试。';
      throw new ApiError(msg, {
        message: msg,
        errorCode: 'CONTAINER_STARTING',
        errorReason: '服务容器正在冷启动中，请求未触达后台核心接口，本次调用未消耗任何外部额度。',
        quotaTip: '💡 本次操作完全未扣减任何额度（消耗为 0）。'
      }, response.status);
    }

    if (response.status === 413) {
      const msg = '音频文件超出云端网关限制 (HTTP 413)';
      throw new ApiError(msg, {
        message: msg,
        errorCode: 'GATEWAY_PAYLOAD_TOO_LARGE',
        errorReason: '音频文件超过了云端网关请求体上限（最大允许 50MB）。',
        quotaTip: '💡 请求被云端网关直接拦截，未消耗任何语音识别或模型配额。'
      }, 413);
    }

    if (response.status === 502 || response.status === 504) {
      const msg = `网关超时或服务不可用 (HTTP ${response.status})`;
      throw new ApiError(msg, {
        message: msg,
        errorCode: 'GATEWAY_TIMEOUT',
        errorReason: '云端网关等待后端处理超时，可能请求仍在后台处理中，或服务正在重启。',
        quotaTip: '⚠️ 请求可能已到达云端或在排队中，请稍候 1~2 分钟再刷新或检查，避免重复消耗配额。'
      }, response.status);
    }

    const msg = `服务器连接异常 (收到网关 HTML 页面，HTTP ${response.status})。`;
    throw new ApiError(msg, {
      message: msg,
      errorCode: `GATEWAY_HTML_${response.status}`,
      errorReason: '网关或代理返回了 HTML 页面，请求未到达目标 API。',
      quotaTip: '💡 本次操作未触达后台业务处理。'
    }, response.status);
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new ApiError(`服务器返回了非 JSON 格式响应 (HTTP ${response.status}): ${rawText.substring(0, 100)}`, {
      message: `非 JSON 响应 (HTTP ${response.status})`,
      errorCode: `HTTP_${response.status}_NON_JSON`,
    }, response.status);
  }

  if (!response.ok) {
    const errorMsg = data.error || `请求失败 (HTTP ${response.status})`;
    const info: ApiErrorInfo = {
      message: errorMsg,
      errorCode: data.errorCode || `HTTP ${response.status}`,
      errorReason: data.errorReason || (typeof data.details === 'string' ? data.details : undefined),
      quotaTip: data.quotaTip,
      details: typeof data.details === 'object' ? JSON.stringify(data.details) : data.details,
      model: data.model
    };
    throw new ApiError(errorMsg, info, response.status);
  }

  return data as T;
}

/**
 * Checks server health with retry, non-blocking fallback if timeout occurs.
 */
export async function waitForServer(signal?: AbortSignal, maxAttempts = 4): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('操作已取消');
    try {
      const res = await fetch('/api/health', { signal });
      if (res.ok) {
        const json = await res.json();
        if (json?.status === 'ok') return true;
      }
    } catch (err: unknown) {
      if (signal?.aborted) throw new Error('操作已取消');
    }
    if (attempt < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  // Non-blocking fallback: do not throw a hard error so the main request can attempt.
  // If the container is still waking up, apiFetch will gracefully capture the HTML booting page.
  return false;
}

