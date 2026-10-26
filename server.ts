import express from "express";
import http from "http";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import * as dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config();

// Ensure production mode if run via `npm start`
if (!process.env.NODE_ENV && process.env.npm_lifecycle_event === 'start') {
  process.env.NODE_ENV = 'production';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Structured Logger with automatic credential sanitization
const SENSITIVE_KEY_PATTERNS = [
  /key/i,
  /secret/i,
  /token/i,
  /password/i,
  /auth/i,
  /authorization/i,
  /credential/i
];

function sanitizeLogData(data: any, depth = 0): any {
  if (depth > 5) return '[Truncated: Max Depth]';
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => sanitizeLogData(item, depth + 1));
  }

  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(k));
    if (isSensitive && typeof v === 'string') {
      sanitized[k] = `[REDACTED: ${v.length} chars]`;
    } else if (typeof v === 'object' && v !== null) {
      sanitized[k] = sanitizeLogData(v, depth + 1);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

function outputLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: any) {
  const timestamp = new Date().toISOString();
  const isProd = process.env.NODE_ENV === 'production';
  const cleanMeta = meta !== undefined ? sanitizeLogData(meta) : undefined;

  if (isProd) {
    const entry: Record<string, any> = {
      timestamp,
      level,
      message,
    };
    if (cleanMeta !== undefined) {
      entry.meta = cleanMeta;
    }
    const logStr = JSON.stringify(entry);
    if (level === 'error') {
      process.stderr.write(logStr + '\n');
    } else {
      process.stdout.write(logStr + '\n');
    }
  } else {
    const tag = `[${timestamp}] [${level.toUpperCase()}]`;
    const metaSuffix = cleanMeta ? ` ${JSON.stringify(cleanMeta)}` : '';
    if (level === 'error') {
      console.error(`${tag} ${message}${metaSuffix}`);
    } else if (level === 'warn') {
      console.warn(`${tag} ${message}${metaSuffix}`);
    } else {
      console.log(`${tag} ${message}${metaSuffix}`);
    }
  }
}

const logger = {
  info: (msg: string, meta?: any) => outputLog('info', msg, meta),
  warn: (msg: string, meta?: any) => outputLog('warn', msg, meta),
  error: (msg: string, meta?: any) => outputLog('error', msg, meta),
  debug: (msg: string, meta?: any) => outputLog('debug', msg, meta),
};

// Error message sanitizer to prevent leaking API keys, tokens, or internal filesystem paths
function sanitizeErrorMessage(msg: unknown): string {
  if (typeof msg !== 'string') {
    if (!msg) return '';
    try {
      msg = JSON.stringify(msg);
    } catch {
      return 'An unexpected error occurred';
    }
  }
  return (msg as string)
    .replace(/((?:key|api_key|token|auth|password|secret)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:AIza[0-9A-Za-z_-]{35}|ghp_[0-9A-Za-z]{36}|sk-[0-9A-Za-z]{20,})\b/gi, '[REDACTED_KEY]')
    .replace(/(?:\/[\w.-]+)+\/node_modules\/[\w.-]+/g, '[INTERNAL_PATH]')
    .replace(/\/app\/applet\/[\w.-]+/g, '[APP_PATH]');
}

// Configure allowed audio MIME types and extensions for upload validation
const ALLOWED_AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/ogg",
  "audio/vorbis",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mp4",
  "audio/aac",
  "audio/flac",
  "audio/webm",
  "application/ogg",
  // P3 fix: Added missing MIME types matching allowed extensions (.wma, .oga) and media containers (.mp4, .webm)
  "audio/x-ms-wma",
  "audio/wma",
  "audio/oga",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska"
]);

const ALLOWED_AUDIO_EXTS = new Set([
  ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".webm", ".wma", ".oga", ".mp4", ".mov", ".mkv"
]);

// Configure multer for memory storage with a 50MB limit
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const isMimeValid = ALLOWED_AUDIO_MIMES.has(file.mimetype.toLowerCase()) || file.mimetype.startsWith("audio/");
    const isExtValid = ALLOWED_AUDIO_EXTS.has(ext);

    // Security Fix: Require BOTH valid audio MIME type AND recognized audio extension
    if (!isMimeValid || !isExtValid) {
      return cb(new Error("Invalid file type. Only standard audio files (MP3, WAV, M4A, OGG, AAC, FLAC, WEBM, WMA, OGA, MP4) are permitted."));
    }
    cb(null, true);
  }
});

// In-memory rate limiter with isolated state and automatic cleanup
function createRateLimiter(maxRequests: number, windowMs: number, customCode = "RATE_LIMIT_EXCEEDED", customMsg = "Rate limit exceeded") {
  const localMap = new Map<string, { count: number; resetTime: number }>();

  // Periodically clean up expired entries to prevent memory leaks
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of localMap.entries()) {
      if (now > val.resetTime) localMap.delete(key);
    }
  }, Math.max(30000, windowMs));
  timer.unref();

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (process.env.DISABLE_RATE_LIMIT === "true") {
      return next();
    }
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    // Bound map size to prevent unbounded memory growth
    if (localMap.size > 5000) {
      for (const [key, val] of localMap.entries()) {
        if (now > val.resetTime) localMap.delete(key);
      }
    }

    const record = localMap.get(ip);

    if (!record || now > record.resetTime) {
      localMap.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: customMsg,
        errorCode: customCode,
        errorReason: `短时间内请求过于频繁，已触发防抖保护（限制 ${maxRequests} 次 / ${Math.round(windowMs / 1000)} 秒）。此限制由本地服务触发，并非 Google 账号配额耗尽。`,
        retryAfterSeconds: retryAfter,
        quotaTip: "请等待倒计时结束后再试，防抖限制期间未消耗任何外部模型配额。"
      });
    }

    record.count++;
    next();
  };
}

const apiRateLimiter = createRateLimiter(120, 60 * 1000, "GENERAL_RATE_LIMIT", "请求频率过高，请稍候再试");
const correctionRateLimiter = createRateLimiter(6, 60 * 1000, "LOCAL_RATE_LIMIT", "文本校正点击过于频繁，为保护配额已触发防抖保护");

// Active upload concurrency limiter to prevent memory exhaustion
let activeUploads = 0;
const MAX_CONCURRENT_UPLOADS = 2;

export function getActiveUploadsCount(): number {
  return activeUploads;
}

export function setActiveUploadsForTesting(val: number): void {
  activeUploads = val;
}

// Clean supported models list
const SUPPORTED_MODELS = [
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-flash-latest"
] as const;
const ALLOWED_GEMINI_MODELS = new Set<string>(SUPPORTED_MODELS);

// Structured Gemini error mapping table
interface ErrorMapping {
  errorCode: string;
  errorReason: string;
  quotaTip: string;
  userMessage: string;
}

const GEMINI_ERROR_MAP: Record<number, ErrorMapping> = {
  401: {
    errorCode: "HTTP 401 / PERMISSION_DENIED",
    errorReason: "GEMINI_API_KEY 无效或已失效。",
    quotaTip: "请在 AI Studio Secrets 面板中核对并配置有效的 API Key。",
    userMessage: "API Key 认证失败 (Permission Denied)"
  },
  403: {
    errorCode: "HTTP 403 / PERMISSION_DENIED",
    errorReason: "GEMINI_API_KEY 未被授予该模型访问权限或权限不足。",
    quotaTip: "请检查 Google AI Studio 控制台项目权限设置。",
    userMessage: "权限不足 (Permission Denied)"
  },
  404: {
    errorCode: "HTTP 404 / NOT_FOUND",
    errorReason: "调用的模型在该项目中不可用或已停用。",
    quotaTip: "请检查 Google AI Studio 控制台中的模型可用性。",
    userMessage: "模型不存在或已停用 (404 Not Found)"
  },
  429: {
    errorCode: "HTTP 429 / RESOURCE_EXHAUSTED",
    errorReason: "已触发 Google Gemini API 配额速率限制（通常因超过 5 RPM 突发上限或耗尽了今日 20 RPD 免费总额）。",
    quotaTip: "请前往 Google AI Studio (aistudio.google.com) 控制台检查您当天的 RPD (Requests Per Day) 剩余次数。若已达当日上限需等待次日重置或绑定计费项目。",
    userMessage: "Gemini API 配额已耗尽 (429 Quota Exceeded)"
  },
  503: {
    errorCode: "HTTP 503 / UNAVAILABLE",
    errorReason: "Google Gemini 官方服务器当前出现突发高并发负载（Service Unavailable）。为了保护您的宝贵每日配额，系统未在后台发起额外的自动重试。",
    quotaTip: "免费层额度紧张（5 RPM / 20 RPD）。请稍候 1~2 分钟待 Google 负载回落后再手动点击重试，并在 Google AI Studio 控制台查看当前使用量。",
    userMessage: "Gemini 官方服务暂时过载 (503 Service Unavailable)"
  }
};

// Lazy initialize Gemini API client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY is not configured or is a placeholder. Please set a valid API key in Secrets.");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: 120000, // 120s timeout to prevent hanging connections
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

export async function startServer(port: number = PORT): Promise<{ app: express.Application; server: http.Server; port: number }> {
  const app = express();
  const server = http.createServer(app);

  // Trust first proxy hop in Cloud Run / Nginx
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Security Headers: prevent MIME-type sniffing, configure CSP, and set safe referrer policy
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    // CSP allowing AI Studio preview iframe embedding
    res.setHeader("Content-Security-Policy", "frame-ancestors 'self' https://*.google.com https://*.run.app;");
    next();
  });

  // Cross-Site Request Defense for API mutations (Anti-CSRF & Quota drain defense)
  app.use("/api", (req, res, next) => {
    // Only check state-changing methods
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return next();
    }

    const secFetchSite = req.headers["sec-fetch-site"];
    const origin = req.headers["origin"];

    // If sec-fetch-site is explicitly cross-site
    if (secFetchSite === "cross-site") {
      if (origin) {
        try {
          const originUrl = new URL(origin);
          const hostname = originUrl.hostname;
          const isAllowedDomain = 
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname.endsWith(".google.com") ||
            hostname.endsWith(".run.app") ||
            hostname.endsWith(".web.app");
          if (!isAllowedDomain) {
            logger.warn(`Blocked cross-site API request from untrusted origin: ${origin}`);
            return res.status(403).json({
              error: "Forbidden: Cross-site API requests are prohibited to protect quota",
              errorCode: "CROSS_SITE_REQUEST_FORBIDDEN"
            });
          }
        } catch {
          return res.status(403).json({
            error: "Forbidden: Invalid origin header",
            errorCode: "INVALID_ORIGIN"
          });
        }
      } else {
        logger.warn("Blocked cross-site API request without valid origin header");
        return res.status(403).json({
          error: "Forbidden: Cross-site API requests are prohibited",
          errorCode: "CROSS_SITE_REQUEST_FORBIDDEN"
        });
      }
    }

    next();
  });

  // Limit JSON/URL-encoded payload size to 5MB to prevent memory exhaustion DoS
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true, limit: "5mb" }));

  // Request logger
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`);
    next();
  });

  logger.info(`Starting server in ${process.env.NODE_ENV || 'development'} mode...`);

  // Health check route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API route to handle audio upload and transcription
  app.post(
    ["/api/transcribe", "/api/transcribe/"],
    apiRateLimiter,
    // Step 1: Pre-upload concurrency check BEFORE buffering audio into memory
    (req, res, next) => {
      if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
        res.setHeader("Retry-After", "30");
        return res.status(503).json({
          error: "系统繁忙，当前已有多个音频正在上传处理中，请稍候 30 秒再试。",
          retryAfterSeconds: 30,
          errorCode: "CONCURRENT_UPLOADS_EXCEEDED"
        });
      }
      activeUploads++;
      let slotReleased = false;
      const release = () => {
        if (!slotReleased) {
          slotReleased = true;
          activeUploads = Math.max(0, activeUploads - 1);
        }
      };
      (req as any).releaseUploadSlot = release;
      // In Node 16+, req 'close' fires as soon as request body is consumed.
      // To catch genuine connection drops before response completes, listen on res 'close'
      res.on("close", () => {
        if (!res.writableEnded) {
          release();
        }
      });
      next();
    },
    // Step 2: Multer audio file parsing with memory storage limit
    (req, res, next) => {
      upload.single("audio")(req, res, (err) => {
        if (err) {
          (req as any).releaseUploadSlot?.();
          logger.error(`Multer upload error: ${err.message}`);
          if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: `Upload error: ${err.message}` });
          }
          return res.status(400).json({ error: `Upload error: ${err.message}` });
        }
        next();
      });
    },
    // Step 3: Handle Gladia transcription pipeline
    async (req, res) => {
      const releaseUploadSlot = (req as any).releaseUploadSlot || (() => {});

    let apiKey = "";
    let isCustomKey = false;
    try {
      logger.info("--- New Transcription Request ---");
      if (!req.file) {
        logger.error("No file in transcription request");
        return res.status(400).json({ error: "No audio file provided" });
      }

      // Check API key exclusively from request header
      const customApiKey = req.headers['x-gladia-api-key'];
      isCustomKey = typeof customApiKey === 'string' && customApiKey.trim().length > 0;
      
      if (isCustomKey) {
        const trimmedKey = (customApiKey as string).trim();
        // Gladia API key format validation: alphanumeric, dash, underscore, 16-128 chars
        if (/^[a-zA-Z0-9_\-]{16,128}$/.test(trimmedKey)) {
          apiKey = trimmedKey;
          logger.info("Using validated customer-provided API key from header.");
        } else {
          return res.status(400).json({ 
            error: "提供的 Gladia API Key 格式不正确，请检查输入 (应为16-128位字母数字破折号组合)。" 
          });
        }
      } else {
        apiKey = process.env.GLADIA_API_KEY || "";
        logger.info("Using default system API key.");
      }

      if (!apiKey || apiKey === "MY_GLADIA_API_KEY") {
        logger.error("Gladia API key is missing or placeholder");
        return res.status(400).json({ 
          error: "Gladia API key is not configured",
          details: "Please configure a valid key or contact the administrator."
        });
      }

      // Sanitize user-provided filename to prevent CRLF injection, header splitting, and directory traversal
      const rawOriginalName = req.file.originalname || "audio.mp3";
      const safeFilename = path.basename(rawOriginalName).replace(/[\r\n"\x00-\x1F\x7F]+/g, "").trim() || "audio.mp3";

      // Step 1: Upload the audio file to Gladia
      const formData = new FormData();
      formData.append("audio", req.file.buffer, {
        filename: safeFilename,
        contentType: req.file.mimetype || "audio/mpeg",
      });

      logger.info(`Uploading file: ${safeFilename} (${req.file.size} bytes) to Gladia...`);
      
      const uploadResponse = await axios.post("https://api.gladia.io/v2/upload", formData, {
        headers: {
          ...formData.getHeaders(),
          "x-gladia-key": apiKey,
        },
        timeout: 180000, // 180s timeout for large audio uploads
        maxContentLength: 60 * 1024 * 1024,
        maxBodyLength: 60 * 1024 * 1024,
        maxRedirects: 3,
      });

      const audioUrl = uploadResponse.data.audio_url;
      logger.info("Upload successful, audio_url received");

      if (!audioUrl || typeof audioUrl !== "string") {
        throw new Error("Failed to get audio_url from Gladia upload response");
      }

      // Security: Validate audio_url protocol is strictly HTTPS to prevent SSRF
      try {
        const parsedAudioUrl = new URL(audioUrl);
        if (parsedAudioUrl.protocol !== "https:") {
          throw new Error("Invalid audio_url protocol returned by upload service");
        }
      } catch (urlErr: any) {
        throw new Error(`Invalid audio_url from upload service: ${urlErr.message}`);
      }

      // Concurrency slot scoping: release memory slot as soon as audio buffer is transferred to Gladia
      releaseUploadSlot();

      // Step 2: Start transcription
      logger.info("Transcription upload successful. Starting transcription task...");
      const rawLanguage = (typeof req.body.language === 'string' && req.body.language.trim()) || 
                          (typeof req.headers['x-target-language'] === 'string' && req.headers['x-target-language'].trim()) || 
                          'es';
      // Whitelist language code format (2-5 lowercase alphanumeric/hyphen)
      const language = /^[a-z]{2}(-[A-Z]{2})?$/.test(rawLanguage) ? rawLanguage : 'es';
      logger.info(`Setting transcription language to: ${language}`);

      const transcriptionPayload: Record<string, any> = {
        audio_url: audioUrl,
        diarization: false,
      };

      if (language) {
        transcriptionPayload.language_config = {
          languages: [language],
          code_switching: false,
        };
      }

      const transcriptionResponse = await axios.post(
        "https://api.gladia.io/v2/transcription",
        transcriptionPayload,
        {
          headers: {
            "x-gladia-key": apiKey,
            "Content-Type": "application/json",
          },
          timeout: 30000, // 30s timeout for starting transcription task
          maxRedirects: 3,
        }
      );

      const resultUrl = transcriptionResponse.data.result_url;
      const taskId = transcriptionResponse.data.id;
      logger.info(`Transcription task started. Task ID: ${taskId}`);

      if (!resultUrl) {
        throw new Error("Failed to get result_url from Gladia transcription response");
      }

      // SSRF & protocol validation on resultUrl: must be https:// and host must be api.gladia.io
      let parsedResultUrl: URL;
      try {
        parsedResultUrl = new URL(resultUrl);
      } catch {
        throw new Error("Invalid result_url returned by transcription provider");
      }

      if (parsedResultUrl.protocol !== "https:" || parsedResultUrl.hostname !== "api.gladia.io") {
        throw new Error(`Untrusted transcription result host: ${parsedResultUrl.hostname}`);
      }

      // Async mode: Return taskId immediately to prevent holding connection open for up to 6 minutes
      if (req.query.async === "true") {
        return res.json({
          taskId,
          status: "queued",
          language,
          customKeyUsed: isCustomKey
        });
      }

      // Step 3: Synchronous Polling Fallback (for clients not using async mode)
      logger.info(`Polling for transcription result (Task ID: ${taskId})...`);
      let status = "queued";
      let transcriptionResult = null;
      let attempts = 0;
      const maxAttempts = 180; // Max 6 minutes (2s * 180)
      let lastSuccessfulPollTime = Date.now();

      while (status !== "done" && attempts < maxAttempts) {
        attempts++;
        if (attempts % 5 === 0) {
          logger.info(`Polling task ${taskId}... Attempt ${attempts}, status: ${status}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        let pollResponse;
        try {
          pollResponse = await axios.get(resultUrl, {
            headers: {
              "x-gladia-key": apiKey,
            },
            timeout: 15000, // 15s timeout for status polling
            maxRedirects: 3,
          });
          lastSuccessfulPollTime = Date.now();
        } catch (pollErr: any) {
          logger.warn(`Error during polling task ${taskId}: ${pollErr.message}`);
          const pollStatus = pollErr.response?.status;
          // Non-transient client errors fail immediately (e.g. 401, 403, 404)
          if (pollStatus >= 400 && pollStatus < 500 && pollStatus !== 408 && pollStatus !== 429) {
            throw pollErr;
          }
          // Circuit breaker: if continuous poll failures exceed 60s, stop polling
          if (Date.now() - lastSuccessfulPollTime > 60000) {
            throw new Error(`Gladia 轮询因网络持续异常中断 (>60s): ${pollErr.message}`);
          }
          continue;
        }

        status = pollResponse.data?.status;
        
        if (status === "done") {
          transcriptionResult = pollResponse.data?.result;
          logger.info(`Task ${taskId} is DONE!`);
          break;
        } else if (status === "error") {
          const detail = typeof pollResponse.data?.error === 'string'
            ? pollResponse.data.error
            : JSON.stringify(pollResponse.data?.error || "Unknown task error");
          logger.error(`Task ${taskId} reported an error: ${detail}`);
          throw new Error(`Gladia task error: ${detail}`);
        }
      }

      // Fix timeout misjudgment: only fail timeout if status is not 'done'
      if (status !== "done") {
        throw new Error("Transcription timed out after 6 minutes");
      }

      if (!transcriptionResult || !transcriptionResult.transcription) {
        throw new Error("No transcription text found in the result");
      }

      const fullText = transcriptionResult.transcription.full_transcript;
      if (!fullText || typeof fullText !== "string") {
        throw new Error("Transcription result did not contain valid text");
      }

      const utterances = transcriptionResult.transcription.utterances || [];
      logger.info(`Transcription completed successfully (${utterances.length} utterances).`);
      res.json({ text: fullText, utterances });
    } catch (error: any) {
      logger.error("Transcription process failed", { error: error.message });
      
      // Explicit Gladia task failure interception
      if (error.message?.startsWith("Gladia task error:")) {
        return res.status(422).json({
          error: "语音转录任务处理失败 (Gladia Task Error)",
          details: error.message.replace(/^Gladia task error:\s*/, ""),
          customKeyUsed: isCustomKey
        });
      }

      let errorMessage = "Transcription failed";
      let errorDetail: any = error.message;
      
      if (error.response) {
        const upstreamStatus = error.response.status;
        logger.error(`Gladia API error status: ${upstreamStatus}`, { data: error.response.data });

        if (upstreamStatus === 402) {
          return res.status(402).json({
            error: "Gladia API 免费额度已耗尽 (Payment Required / Quota Exceeded)",
            details: "当前 Gladia 账号的免费转录时长已全部用完。请在界面设置中填入新的 Gladia API Key 进行应急切换。",
            customKeyUsed: isCustomKey
          });
        }

        if (upstreamStatus === 429) {
          return res.status(429).json({
            error: "Gladia API 请求频率过高 (Too Many Requests)",
            details: "语音识别服务触发了频次限制，请稍候 1~2 分钟再试。",
            customKeyUsed: isCustomKey
          });
        }

        errorMessage = `Gladia API Error (${upstreamStatus})`;
        errorDetail = error.response.data?.message || error.response.data?.error || "Upstream provider error";
        
        const safeUpstreamStatus = Number.isInteger(upstreamStatus) && upstreamStatus >= 400 && upstreamStatus <= 599 ? upstreamStatus : 500;
        return res.status(safeUpstreamStatus).json({
          error: errorMessage,
          details: typeof errorDetail === "string" ? sanitizeErrorMessage(errorDetail) : "Transcription error occurred",
          customKeyUsed: isCustomKey
        });
      } else if (error.request || error.code === 'ECONNABORTED') {
        errorMessage = "No response from Gladia API";
        errorDetail = error.code === 'ECONNABORTED' 
          ? "The request to Gladia timed out." 
          : "The upstream speech-to-text service timed out or was unreachable.";
      }
      
      res.status(500).json({
        error: errorMessage,
        details: typeof errorDetail === "string" ? sanitizeErrorMessage(errorDetail) : "Transcription error occurred",
        customKeyUsed: isCustomKey
      });
    } finally {
      releaseUploadSlot();
    }
  });

  // Status check endpoint for asynchronous transcription polling
  app.get(["/api/transcribe/status/:taskId", "/api/transcribe/status/:taskId/"], apiRateLimiter, async (req, res) => {
    try {
      const { taskId } = req.params;
      if (!taskId || !/^[a-zA-Z0-9_\-]+$/.test(taskId)) {
        return res.status(400).json({ error: "Invalid task ID format" });
      }

      const customApiKey = req.headers['x-gladia-api-key'];
      let apiKey = "";
      if (typeof customApiKey === 'string' && customApiKey.trim().length > 0) {
        const trimmedKey = customApiKey.trim();
        if (/^[a-zA-Z0-9_\-]{16,128}$/.test(trimmedKey)) {
          apiKey = trimmedKey;
        } else {
          return res.status(400).json({ 
            error: "提供的 Gladia API Key 格式不正确，请检查输入 (应为16-128位字母数字破折号组合)。" 
          });
        }
      } else {
        apiKey = process.env.GLADIA_API_KEY || "";
      }

      if (!apiKey || apiKey === "MY_GLADIA_API_KEY") {
        return res.status(400).json({ error: "Gladia API key is not configured" });
      }

      const pollResponse = await axios.get(`https://api.gladia.io/v2/transcription/${taskId}`, {
        headers: { "x-gladia-key": apiKey },
        timeout: 15000,
        maxRedirects: 3,
      });

      const status = pollResponse.data?.status;
      if (status === "done") {
        const fullText = pollResponse.data?.result?.transcription?.full_transcript || "";
        const utterances = pollResponse.data?.result?.transcription?.utterances || [];
        return res.json({ status: "done", text: fullText, utterances });
      } else if (status === "error") {
        const errorDetail = typeof pollResponse.data?.error === 'string'
          ? pollResponse.data.error
          : JSON.stringify(pollResponse.data?.error || "Upstream Gladia task failed");
        return res.json({ status: "error", error: sanitizeErrorMessage(errorDetail) });
      } else {
        return res.json({ status: status || "processing" });
      }
    } catch (err: any) {
      const upstreamStatus = err.response?.status;
      const safeStatus = Number.isInteger(upstreamStatus) && upstreamStatus >= 400 && upstreamStatus <= 599 ? upstreamStatus : 500;
      const rawError = err.response?.data?.message || err.response?.data?.error || err.message || "Failed to check transcription status";
      return res.status(safeStatus).json({
        error: sanitizeErrorMessage(rawError)
      });
    }
  });

  // API route for text correction using Gemini
  app.post(["/api/correct", "/api/correct/"], apiRateLimiter, correctionRateLimiter, async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    try {
      const { prompt, model = "gemini-3.8-flash", systemInstruction } = req.body;

      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        return res.status(400).json({ error: "Prompt is required and must be a non-empty string" });
      }

      // Prevent resource exhaustion from oversized prompts
      if (prompt.length > 100000) {
        return res.status(400).json({ 
          error: "Prompt exceeds maximum allowed length of 100,000 characters",
          errorCode: "HTTP 400 / PAYLOAD_TOO_LARGE",
          errorReason: "提交的文本超过了最大单次处理限制（10万字符）。"
        });
      }

      // Restrict model to verified whitelist
      if (typeof model !== "string" || !ALLOWED_GEMINI_MODELS.has(model)) {
        return res.status(400).json({ error: "Invalid model specified. Only approved Gemini models are supported." });
      }

      // Prevent resource exhaustion from oversized systemInstruction
      if (typeof systemInstruction === "string" && systemInstruction.length > 50000) {
        return res.status(400).json({
          error: "systemInstruction exceeds maximum allowed length of 50,000 characters",
          errorCode: "HTTP 400 / PAYLOAD_TOO_LARGE",
          errorReason: "提交的 systemInstruction 超过了单次最大允许长度（50,000 字符）。"
        });
      }

      let ai: GoogleGenAI;
      try {
        ai = getGeminiClient();
      } catch (err: any) {
        return res.status(500).json({ error: err.message || "Gemini API key is not configured" });
      }

      logger.info(`[Gemini] Correction request using model: ${model} (Retries: 0 to preserve RPM/RPD quota)`);

      const genConfig: Record<string, any> = {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            correctedText: { 
              type: Type.STRING,
              description: "The final corrected transcript (Text C). Continuous flowing text with proper theological and grammatical orthography."
            },
            differences: { 
              type: Type.STRING, 
              description: "Detailed analysis of differences between Text C and Text B (palabras cambiadas, omitidas, añadidas o discrepancias con el guion original). Written in Spanish by default or the language requested in the prompt."
            }
          },
          required: ["correctedText", "differences"]
        }
      };

      if (typeof systemInstruction === "string" && systemInstruction.trim().length > 0) {
        genConfig.systemInstruction = systemInstruction.trim();
      }

      // Zero retries: single attempt only to protect user's limited free tier quota (5 RPM / 20 RPD)
      // Enforce 120s timeout guarantee via AbortController and Promise.race to prevent hung connections
      const timeoutAbort = new AbortController();
      let timeoutTimer: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => {
          timeoutAbort.abort();
          const err: any = new Error("Gemini generateContent timed out after 120 seconds");
          err.code = "ETIMEDOUT";
          reject(err);
        }, 120000);
      });

      let response;
      try {
        response = await Promise.race([
          ai.models.generateContent({ 
            model,
            contents: prompt,
            config: {
              ...genConfig,
              abortSignal: timeoutAbort.signal
            }
          }),
          timeoutPromise
        ]);
      } finally {
        if (timeoutTimer) clearTimeout(timeoutTimer);
      }

      const text = response.text;
      if (!text || typeof text !== "string" || text.trim().length === 0) {
        throw new Error("Gemini API returned an empty or invalid text response");
      }

      logger.info("[Gemini] Correction completed successfully (1 attempt consumed).");
      res.json({ text, model });
    } catch (error: any) {
      logger.error("[Gemini] Correction failed", { error: error.message });
      
      const rawMsg = error.message || "";
      const upstreamErrorCode = error.code || error.cause?.code;
      const isUpstreamNetworkError = 
        ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ENOTFOUND'].includes(upstreamErrorCode) ||
        rawMsg.toLowerCase().includes('fetch failed') ||
        rawMsg.toLowerCase().includes('timed out');

      if (isUpstreamNetworkError) {
        return res.status(504).json({
          error: "连接 Google Gemini 服务器网络超时或中断",
          errorCode: "UPSTREAM_NETWORK_ERROR",
          errorReason: "服务端向 Google Gemini 发起请求时发生网络连接超时或中断。",
          quotaTip: "网络连接在响应完成前中断，本次请求很可能未消耗免费额度。请稍候检查网络后重试。",
          details: sanitizeErrorMessage(rawMsg)
        });
      }

      let rawStatus = typeof error.status === 'number' ? error.status : parseInt(error.status, 10);
      if (!Number.isInteger(rawStatus)) {
        if (error.error?.status === 'RESOURCE_EXHAUSTED') rawStatus = 429;
        else if (error.error?.status === 'UNAVAILABLE') rawStatus = 503;
        else if (error.error?.status === 'PERMISSION_DENIED') rawStatus = 403;
        else if (error.error?.status === 'NOT_FOUND') rawStatus = 404;
        else rawStatus = 500;
      }
      const status = rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;

      const mapped = GEMINI_ERROR_MAP[status];
      if (mapped) {
        return res.status(status).json({
          error: mapped.userMessage,
          errorCode: mapped.errorCode,
          errorReason: mapped.errorReason,
          quotaTip: mapped.quotaTip,
          details: sanitizeErrorMessage(rawMsg)
        });
      }

      res.status(status).json({
        error: "文本校正失败",
        errorCode: `HTTP ${status}`,
        errorReason: "请求 Google Gemini 官方接口时返回异常。",
        quotaTip: "免费层配额上限通常为 5 RPM / 20 RPD。请稍候再试。",
        details: sanitizeErrorMessage(rawMsg),
      });
    }
  });

  // Catch-all for missing API routes (MUST be before Vite/Static)
  app.all("/api/*", (req, res) => {
    logger.warn(`API route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    const isHttps = process.env.APP_URL?.startsWith("https") ?? false;
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        watch: process.env.DISABLE_HMR === 'true' ? null : undefined,
        hmr: { 
          server,
          clientPort: isHttps ? 443 : PORT
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    
    // SPA fallback for production
    app.get("*", (req, res, next) => {
      if (req.url.startsWith("/api/")) return next();
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Error handler: ensure JSON response for all API requests
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error("Express uncaught error", { error: err.message, stack: err.stack });
    if (res.headersSent) {
      return next(err);
    }
    const isApi = (req.originalUrl && req.originalUrl.startsWith("/api/")) || 
                  (req.url && req.url.startsWith("/api/")) || 
                  req.headers.accept?.includes("application/json");
    const rawStatus = typeof err.status === 'number' ? err.status : parseInt(err.status, 10);
    const safeStatus = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
    if (isApi) {
      return res.status(safeStatus).json({ 
        error: sanitizeErrorMessage(err.message) || "Internal Server Error"
      });
    }
    res.status(safeStatus).send("Internal Server Error");
  });

  return new Promise<{ app: express.Application; server: http.Server; port: number }>((resolve, reject) => {
    server.listen(port, "0.0.0.0", () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      logger.info(`Server running on http://0.0.0.0:${actualPort}`);
      server.timeout = 600000;
      resolve({ app, server, port: actualPort });
    });
    server.on("error", reject);
  });
}

// Only auto-start when running as the main entry point (not when imported in tests)
if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
  startServer().catch((err) => {
    logger.error("Failed to start server", { error: err.message });
    process.exit(1);
  });
}
