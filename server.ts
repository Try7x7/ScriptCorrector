import express from "express";
import http from "http";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import * as dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

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
  "application/ogg"
]);

const ALLOWED_AUDIO_EXTS = new Set([
  ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".webm", ".wma", ".oga"
]);

// Configure multer for memory storage with a 50MB limit and strict MIME + extension validation
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const isMimeValid = ALLOWED_AUDIO_MIMES.has(file.mimetype.toLowerCase()) || file.mimetype.startsWith("audio/");
    const isExtValid = ALLOWED_AUDIO_EXTS.has(ext);

    // Security Fix: Require BOTH valid audio MIME type AND recognized audio extension
    if (!isMimeValid || !isExtValid) {
      return cb(new Error("Invalid file type. Only standard audio files (MP3, WAV, M4A, OGG, AAC, FLAC, WEBM) are permitted."));
    }
    cb(null, true);
  }
});

// In-memory rate limiter with isolated state and automatic cleanup
function createRateLimiter(maxRequests: number, windowMs: number) {
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
      return res.status(429).json({
        error: "Too Many Requests",
        details: "Rate limit exceeded. Please wait a moment before sending more requests."
      });
    }

    record.count++;
    next();
  };
}

const apiRateLimiter = createRateLimiter(120, 60 * 1000); // 120 requests per minute per IP

// Whitelist of supported Gemini models
const ALLOWED_GEMINI_MODELS = new Set([
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-1.5-flash",
  "gemini-2.0-flash"
]);

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
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Helper to wait
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // Trust first proxy hop in Cloud Run / Nginx
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Security Headers: prevent MIME-type sniffing and set safe referrer policy
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-XSS-Protection", "0");
    next();
  });

  // Limit JSON/URL-encoded payload size to 5MB to prevent memory exhaustion DoS
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true, limit: "5mb" }));

  // Request logger
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  console.log(`Starting server in ${process.env.NODE_ENV || 'development'} mode...`);

  // Health check route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API route to handle audio upload and transcription
  app.post(["/api/transcribe", "/api/transcribe/"], apiRateLimiter, (req, res, next) => {
    upload.single("audio")(req, res, (err) => {
      if (err) {
        console.error("Multer upload error:", err);
        if (err instanceof multer.MulterError) {
          return res.status(400).json({ error: `Upload error: ${err.message}` });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      next();
    });
  }, async (req, res) => {
    let apiKey = "";
    let isCustomKey = false;
    try {
      console.log("--- New Transcription Request ---");
      if (!req.file) {
        console.error("No file in request");
        return res.status(400).json({ error: "No audio file provided" });
      }

      // Prioritize API key from headers, then request body, then environment variable
      const customApiKey = req.headers['x-gladia-api-key'] || req.body.gladiaApiKey;
      isCustomKey = typeof customApiKey === 'string' && customApiKey.trim().length > 0;
      
      if (isCustomKey) {
        const trimmedKey = (customApiKey as string).trim();
        // Gladia API key format validation: alphanumeric, dash, underscore, 16-128 chars
        if (/^[a-zA-Z0-9_\-]{16,128}$/.test(trimmedKey)) {
          apiKey = trimmedKey;
          console.log("Using validated customer-provided API key.");
        } else {
          return res.status(400).json({ 
            error: "提供的 Gladia API Key 格式不正确，请检查输入 (应为16-128位字母数字破折号组合)。" 
          });
        }
      } else {
        apiKey = process.env.GLADIA_API_KEY || "";
        console.log("Using default system API key.");
      }

      if (!apiKey || apiKey === "MY_GLADIA_API_KEY") {
        console.error("Gladia API key is missing or placeholder");
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

      console.log(`Uploading file: ${safeFilename} (${req.file.size} bytes) to Gladia...`);
      
      const uploadResponse = await axios.post("https://api.gladia.io/v2/upload", formData, {
        headers: {
          ...formData.getHeaders(),
          "x-gladia-key": apiKey,
        },
        maxContentLength: 60 * 1024 * 1024,
        maxBodyLength: 60 * 1024 * 1024,
        maxRedirects: 3,
      });

      const audioUrl = uploadResponse.data.audio_url;
      console.log("Upload successful, audio_url received");

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

      // Step 2: Start transcription
      console.log("Transcription upload successful. Starting transcription task...");
      const rawLanguage = (typeof req.body.language === 'string' && req.body.language.trim()) || 
                          (typeof req.headers['x-target-language'] === 'string' && req.headers['x-target-language'].trim()) || 
                          'es';
      // Whitelist language code format (2-5 lowercase alphanumeric/hyphen)
      const language = /^[a-z]{2}(-[A-Z]{2})?$/.test(rawLanguage) ? rawLanguage : 'es';
      console.log(`Setting transcription language to: ${language}`);

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
          maxRedirects: 3,
        }
      );

      const resultUrl = transcriptionResponse.data.result_url;
      const taskId = transcriptionResponse.data.id;
      console.log(`Transcription task started. Task ID: ${taskId}`);

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

      // Step 3: Poll for the result
      console.log(`Polling for transcription result (Task ID: ${taskId})...`);
      let status = "queued";
      let transcriptionResult = null;
      let attempts = 0;
      const maxAttempts = 180; // Max 6 minutes (2s * 180)

      while (status !== "done" && status !== "error" && attempts < maxAttempts) {
        attempts++;
        if (attempts % 5 === 0) {
          console.log(`Polling task ${taskId}... Attempt ${attempts}, status: ${status}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        try {
          const pollResponse = await axios.get(resultUrl, {
            headers: {
              "x-gladia-key": apiKey,
            },
            maxRedirects: 3,
          });

          status = pollResponse.data.status;
          
          if (status === "done") {
            transcriptionResult = pollResponse.data.result;
            console.log(`Task ${taskId} is DONE!`);
          } else if (status === "error") {
            console.error(`Task ${taskId} reported an error.`);
            throw new Error(`Gladia task error: ${JSON.stringify(pollResponse.data.error || "Unknown task error")}`);
          }
        } catch (pollErr: any) {
          console.error(`Error during polling task ${taskId}:`, pollErr.message);
          // If polling fails with 4xx from Gladia, stop retrying
          if (pollErr.response?.status >= 400 && pollErr.response?.status < 500) {
            throw pollErr;
          }
        }
      }

      if (attempts >= maxAttempts) {
        throw new Error("Transcription timed out after 6 minutes");
      }

      if (!transcriptionResult || !transcriptionResult.transcription) {
        throw new Error("No transcription text found in the result");
      }

      const fullText = transcriptionResult.transcription.full_transcript;
      console.log("Transcription completed successfully.");
      res.json({ text: fullText });
    } catch (error: any) {
      console.error("Transcription process failed!");
      
      let errorMessage = "Transcription failed";
      let errorDetail: any = error.message;
      
      if (error.response) {
        const upstreamStatus = error.response.status;
        console.error("Gladia API error status:", upstreamStatus);

        // Explicit 402 Payment Required handling
        if (upstreamStatus === 402) {
          return res.status(402).json({
            error: "Gladia API 免费额度已耗尽 (Payment Required / Quota Exceeded)",
            details: "当前 Gladia 账号的免费转录时长已全部用完。请在界面设置中填入新的 Gladia API Key 进行应急切换。",
            customKeyUsed: isCustomKey
          });
        }

        // Explicit 429 Rate Limit handling
        if (upstreamStatus === 429) {
          return res.status(429).json({
            error: "Gladia API 请求频率过高 (Too Many Requests)",
            details: "语音识别服务触发了频次限制，请稍候 1~2 分钟再试。",
            customKeyUsed: isCustomKey
          });
        }

        errorMessage = `Gladia API Error (${upstreamStatus})`;
        errorDetail = error.response.data?.message || error.response.data?.error || "Upstream provider error";
        
        return res.status(upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 500).json({
          error: errorMessage,
          details: typeof errorDetail === "string" ? errorDetail : "Transcription error occurred",
          customKeyUsed: isCustomKey
        });
      } else if (error.request) {
        errorMessage = "No response from Gladia API";
        errorDetail = "The upstream speech-to-text service timed out or was unreachable.";
      }
      
      // Do not leak secret key characters in error response
      res.status(500).json({
        error: errorMessage,
        details: typeof errorDetail === "string" ? errorDetail : "Transcription error occurred",
        customKeyUsed: isCustomKey
      });
    }
  });

  // API route for text correction using Gemini
  app.post(["/api/correct", "/api/correct/"], apiRateLimiter, async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    try {
      const { prompt, model = "gemini-3.8-flash" } = req.body;

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

      let ai: GoogleGenAI;
      try {
        ai = getGeminiClient();
      } catch (err: any) {
        return res.status(500).json({ error: err.message || "Gemini API key is not configured" });
      }

      // Map legacy or deprecated aliases to current official recommended models
      let requestedModel = model;
      if (
        model === "gemini-3.6-flash" ||
        model === "gemini-2.5-flash" ||
        model === "gemini-1.5-flash" ||
        model === "gemini-2.0-flash" ||
        model === "gemini-3-flash-preview"
      ) {
        requestedModel = "gemini-3.8-flash";
      }

      console.log(`[Gemini] Correction request using model: ${requestedModel} (Retries: 0 to preserve RPM/RPD quota)`);

      // Zero retries: single attempt only to protect user's limited free tier quota (5 RPM / 20 RPD)
      const response = await ai.models.generateContent({ 
        model: requestedModel,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              correctedText: { 
                type: Type.STRING,
                description: "The final corrected transcript (Text C). If line breaks were requested in the prompt, separate every single line with a newline character (\\n)."
              },
              differences: { 
                type: Type.STRING, 
                description: "Detailed analysis of differences between Text C and Text B (palabras cambiadas, omitidas, añadidas o discrepancias con el guion original). Written in Spanish by default or the language requested in the prompt."
              }
            },
            required: ["correctedText", "differences"]
          }
        }
      });

      const text = response.text;
      console.log("[Gemini] Correction completed successfully (1 attempt consumed).");
      res.json({ text, model: requestedModel });
    } catch (error: any) {
      console.error("[Gemini] Correction failed:", error);
      
      const status = error.status || 500;
      const rawMsg = error.message || "";

      let errorCode = `HTTP ${status}`;
      let errorReason = "请求 Google Gemini 官方接口时返回异常。";
      let quotaTip = "当前免费层配额通常为 5 RPM（每分钟 5 次）与 20 RPD（每日 20 次）。系统已关闭后台自动重试以节约您的限额，请前往 Google AI Studio 检查用量。";

      // 503 Service Unavailable / High demand
      if (status === 503 || rawMsg.includes("503") || rawMsg.includes("UNAVAILABLE") || rawMsg.includes("high demand") || rawMsg.includes("Service Unavailable")) {
        errorCode = "HTTP 503 / UNAVAILABLE";
        errorReason = "Google Gemini 官方服务器当前出现突发高并发负载（Service Unavailable）。为了保护您的宝贵每日配额，系统未在后台发起额外的自动重试。";
        quotaTip = "免费层额度紧张（5 RPM / 20 RPD）。请稍候 1~2 分钟待 Google 负载回落后再手动点击重试，并在 Google AI Studio 控制台查看当前使用量。";
        return res.status(503).json({ 
          error: "Gemini 官方服务暂时过载 (503 Service Unavailable)",
          errorCode,
          errorReason,
          quotaTip,
          details: rawMsg
        });
      }

      // 429 Quota Exceeded / Rate Limit
      if (status === 429 || rawMsg.includes("429") || rawMsg.includes("RESOURCE_EXHAUSTED") || rawMsg.includes("quota") || rawMsg.includes("Quota Exceeded")) {
        errorCode = "HTTP 429 / RESOURCE_EXHAUSTED";
        errorReason = "已触发 Google Gemini API 配额速率限制（通常因超过 5 RPM 突发上限或耗尽了今日 20 RPD 免费总额）。";
        quotaTip = "请前往 Google AI Studio (aistudio.google.com) 控制台检查您当天的 RPD (Requests Per Day) 剩余次数。若已达当日上限需等待次日重置或绑定计费项目。";
        return res.status(429).json({ 
          error: "Gemini API 配额已耗尽 (429 Quota Exceeded)",
          errorCode,
          errorReason,
          quotaTip,
          details: rawMsg
        });
      }

      // 404 Model Not Found
      if (status === 404 || rawMsg.includes("404") || rawMsg.includes("NOT_FOUND")) {
        errorCode = "HTTP 404 / NOT_FOUND";
        errorReason = "调用的模型在该项目中不可用或已弃用。建议确认模型权限与配置。";
        quotaTip = "请检查 Google AI Studio 控制台中的模型可用性。";
        return res.status(404).json({
          error: "模型不存在或已停用 (404 Not Found)",
          errorCode,
          errorReason,
          quotaTip,
          details: rawMsg
        });
      }

      // 401/403 Permission Denied
      if (status === 401 || status === 403 || rawMsg.includes("401") || rawMsg.includes("403") || rawMsg.includes("PERMISSION_DENIED")) {
        errorCode = `HTTP ${status} / PERMISSION_DENIED`;
        errorReason = "GEMINI_API_KEY 无效、已失效或未被授予该模型访问权限。";
        quotaTip = "请在 AI Studio Secrets 面板中核对并配置有效的 API Key。";
        return res.status(status).json({
          error: "API Key 认证失败 (Permission Denied)",
          errorCode,
          errorReason,
          quotaTip,
          details: rawMsg
        });
      }

      res.status(status).json({
        error: "文本校正失败",
        errorCode,
        errorReason,
        quotaTip,
        details: rawMsg,
      });
    }
  });

  // Catch-all for missing API routes (MUST be before Vite/Static)
  app.all("/api/*", (req, res) => {
    console.log(`[404] API route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const isHttps = process.env.APP_URL?.startsWith("https") ?? false;
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        watch: null, // Disables file watching to prevent flickering during edits
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
    console.error("Express error:", err);
    if (res.headersSent) {
      return next(err);
    }
    const isApi = (req.originalUrl && req.originalUrl.startsWith("/api/")) || 
                  (req.url && req.url.startsWith("/api/")) || 
                  req.headers.accept?.includes("application/json");
    if (isApi) {
      return res.status(err.status || 500).json({ 
        error: err.message || "Internal Server Error"
      });
    }
    res.status(err.status || 500).send("Internal Server Error");
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  // Increase timeout for long-running transcription tasks
  server.timeout = 600000; // 10 minutes
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
