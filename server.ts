import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import * as dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import rateLimit from "express-rate-limit";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

// Security: Standard rate limiters using express-rate-limit to mitigate DoS (CodeQL js/missing-rate-limiting)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "请求过于频繁 (Too Many Requests)",
    details: "超出常规访问速率限制，请稍后再试。"
  }
});

const transcribeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 12, // 12 transcription uploads per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "请求过于频繁 (Too Many Requests)",
    details: "已超出音频转录速率限制，请稍后再试。"
  }
});

const correctLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 text corrections per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "请求过于频繁 (Too Many Requests)",
    details: "已超出文本校对速率限制，请稍后再试。"
  }
});

// Security: Allowed audio MIME types and file extensions
const ALLOWED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/x-pn-wav',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'audio/x-flac',
  'audio/mp4',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm', '.flac', '.mp4'
]);

// Configure multer with strict file filtering and limits
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isMimeAllowed = ALLOWED_MIME_TYPES.has(file.mimetype) || file.mimetype.startsWith('audio/');
    const isExtAllowed = ALLOWED_EXTENSIONS.has(ext);

    // Security: Enforce strict AND logic (both valid audio MIME and valid extension required)
    if (isMimeAllowed && isExtAllowed) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式。请上传合法的音频文件 (支持格式: ${Array.from(ALLOWED_EXTENSIONS).join(', ')})`));
    }
  }
});

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

// Built-in resilient fallback prompt template
const FALLBACK_PROMPT_TEMPLATE = `你是一个专业的音频转录编辑，专门处理法语神学内容的字幕校对。
你的任务是将语音识别生成的原始文本（文本A）修正为准确、通顺且符合神学规范的字幕文本（文本C），同时参考文案原稿（文本B）进行核对。

### 核心原则：采用“双重标准”处理策略
1. **经文与神话语部分 (Strict Mode)**：严格对齐文案（文本B）。
2. **口语讲解部分 (Faithful Mode)**：忠实还原语音（文本A），仅修复错误。

### 详细修正规则：

#### 1. 经文与神话语部分 (Strict Mode)
- **适用范围**：引用圣经经文、直接引用上帝的话（Dieu dit / Jésus dit...）、祷告词。
- **绝对权威**：此部分的拼写、标点、措辞必须 100% 严格按照文本B执行。即使说话人读错或稍微改词，优先修正为文本B的标准写法。
- **神性代词大写 (Capitalisation Divine)**：所有指代上帝、耶稣、圣灵的代词必须首字母大写（如：Il, Son, Lui, Ton, Moi）。
- **标点符号**：必须使用法语引号 « ... » 包裹经文或神的话语。严格跟随文本B的逗号、句号位置。
- **专有名词与章节**：书卷名必须准确且大写（如 Matthieu, Ésaïe）。章节格式统一为“书名 章:节”（如 Jean 3:16）。

#### 2. 口语讲解/非经文部分 (Faithful Mode)
- **适用范围**：讲员的解释、见证、引导语、结尾问候。
- **忠实还原语音**：不要照搬文本B。如果说话人改词、加词或换了说法，必须记录说话人实际说的内容。
- **保留口语特征**：保留连接词和语气词（如：et bah, en fait, donc, alors, du coup）和口语语法结构。
- **修复 ASR 错误**：修复同音词错误（如 verre -> ver, encre -> ancre）、动词变位错误、以及无意义的听辨错误。

#### 3. 通用格式规范
- **数字**：将数字 1, 2, 3 改为单词 un/une, deux, trois（除非是章节号或年份）。
- **缩写**：N° -> numéro。
{{lineBreakRule}}

### 输出要求：
- 请以 JSON 格式输出，包含以下两个字段：
  - \`correctedText\`: 最终的文本C。特别注意：如果启用了断行，行与行之间必须使用换行符 (\\n) 分隔。
  - \`differences\`: 文本C与文本B（文案原稿）的差异分析。请列出说话人改词、加词、漏词或与文案不一致的地方（**请务必使用中文回复此字段**）。
- 不要包含 markdown 代码块标记（如 \\\`\\\`\\\`json），直接输出 JSON 字符串。

---
**文本A (原始识别结果)：**
{{transcribedText}}

**文本B (文案原稿)：**
{{referenceText}}`;

// Prompt template path and in-memory cache
const PROMPT_TEMPLATE_PATH = path.join(__dirname, "config", "promptTemplate.md");
let cachedPromptTemplate: string = "";

function loadPromptTemplate(): string {
  if (cachedPromptTemplate) {
    return cachedPromptTemplate;
  }
  try {
    if (fs.existsSync(PROMPT_TEMPLATE_PATH)) {
      cachedPromptTemplate = fs.readFileSync(PROMPT_TEMPLATE_PATH, "utf-8");
      console.log(`[PromptTemplate] Successfully loaded prompt template from ${PROMPT_TEMPLATE_PATH} (${cachedPromptTemplate.length} chars)`);
      return cachedPromptTemplate;
    } else {
      console.warn(`[PromptTemplate] Warning: ${PROMPT_TEMPLATE_PATH} not found, falling back to built-in template.`);
    }
  } catch (err: any) {
    console.error(`[PromptTemplate] Error reading prompt template from ${PROMPT_TEMPLATE_PATH}:`, err?.message || err);
  }

  // Resilient fallback
  cachedPromptTemplate = FALLBACK_PROMPT_TEMPLATE;
  return cachedPromptTemplate;
}

// Pre-load prompt template into memory at startup
loadPromptTemplate();

// Helper to construct correction prompt safely on the server side using the external Markdown template
function buildCorrectionPrompt(
  transcribedText: string,
  referenceText: string,
  options: {
    enableLineBreaks?: boolean;
    maxLineLength?: number;
    minLineLength?: number;
    enableVisualOptimization?: boolean;
    visualOptStart?: number;
    visualOptEnd?: number;
  }
): string {
  const enableLineBreaks = Boolean(options.enableLineBreaks);
  const maxLineLength = Math.max(10, Math.min(100, Number(options.maxLineLength) || 32));
  const minLineLength = Math.max(4, Math.min(maxLineLength, Number(options.minLineLength) || 12));
  const enableVisualOpt = Boolean(options.enableVisualOptimization);
  const visualOptStart = Number(options.visualOptStart) || 25;
  const visualOptEnd = Number(options.visualOptEnd) || 30;

  const lineBreakRule = enableLineBreaks
    ? `- **强制断行要求 (字幕排版关键准则，必须使用 \\n 换行符)**：
  - **逐行输出**：请务必在 \`correctedText\` 中**使用换行符 (\\n)** 将整篇文本分割为一行一行的标准字幕，不要输出为一整段不换行的长篇文本！
  - **字符数严格限制 (以字母、标点和空格总字符数为准)**：
    - 每行最长不得超过 ${maxLineLength} 个字符（包含标点与空格）。
    - 每行最短建议不低于 ${minLineLength} 个字符（避免单个词独立成行）。
${enableVisualOpt ? `    - **避开视觉盲区**：尽量避免单行字符数落在 ${Math.min(visualOptStart, maxLineLength - 2)} 到 ${Math.min(visualOptEnd, maxLineLength)} 个字符的区间。` : ''}
  - **语义断行法则**：
    1. 优先在句子与分句标点处（句号 .、问号 ?、感叹号 !、逗号 ,、分号 ;、冒号 :、省略号 …、法语引号 « »）自然停顿断行。
    2. 依据语法结构（主谓宾、关系从句、介词短语）合理断行，切勿在单词中间截断。
    3. 严禁单字介词/冠词在行末悬挂或孤立（如 « et », « de », « le », « la », « un », « une », « à », « pour » 必须与后接名词或从句在同一行）。
    4. 对称平衡：长句拆分为两行时，前后两行字符数尽量均衡。`
    : '- **断行要求**：不需要换行，直接输出为一整段连续文本（不包含换行符）。';

  const template = loadPromptTemplate();
  return template
    .replace('{{lineBreakRule}}', lineBreakRule)
    .replace('{{transcribedText}}', transcribedText)
    .replace('{{referenceText}}', referenceText);
}

async function startServer() {
  const app = express();

  // Security & Networking: Trust reverse proxy (nginx/Cloud Run) for accurate client IP in rate limiting
  app.set("trust proxy", 1);

  // Security: Disable X-Powered-By header
  app.disable("x-powered-by");

  // Security: Apply defensive HTTP security headers compatible with AI Studio iframe embedding
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    next();
  });

  // Security: Apply general rate limiter across all requests to protect file serving & mitigate DoS (CodeQL js/missing-rate-limiting)
  app.use(generalLimiter);

  // Security: Limit JSON payload to 2MB to prevent memory exhaustion DoS
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  // Request logger
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  console.log(`Starting server in ${process.env.NODE_ENV || 'development'} mode...`);

  // Health check route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", version: "1.1.0", timestamp: new Date().toISOString() });
  });

  // API route to handle audio upload and transcription
  app.post(["/api/transcribe", "/api/transcribe/"], transcribeLimiter, (req, res, next) => {
    upload.single("audio")(req, res, (err) => {
      if (err) {
        console.error("Multer error:", err);
        if (err instanceof multer.MulterError) {
          return res.status(400).json({ error: `上传错误: ${err.message}` });
        }
        return res.status(400).json({ error: err.message || "上传音频校验失败" });
      }
      next();
    });
  }, async (req, res) => {
    let apiKey = "";
    try {
      console.log("--- New Transcription Request ---");
      if (!req.file) {
        console.error("No file in request");
        return res.status(400).json({ error: "请上传音频文件 (No audio file provided)" });
      }

      // Security: Validate and sanitize custom API key if provided
      const rawCustomApiKey = req.headers['x-gladia-api-key'] || req.body.gladiaApiKey;
      let customApiKey = "";
      if (typeof rawCustomApiKey === 'string' && rawCustomApiKey.trim()) {
        const trimmed = rawCustomApiKey.trim();
        // Gladia API key validation: alphanumeric, dash, underscore, 16-128 chars
        if (/^[a-zA-Z0-9_\-]{16,128}$/.test(trimmed)) {
          customApiKey = trimmed;
        } else {
          return res.status(400).json({ error: "提供的 Gladia API Key 格式不正确，请检查输入。" });
        }
      }

      apiKey = customApiKey || process.env.GLADIA_API_KEY || "";

      if (!apiKey || apiKey === "MY_GLADIA_API_KEY") {
        console.error("Gladia API key is missing or placeholder");
        return res.status(400).json({ 
          error: "Gladia API key is not configured",
          details: "Please provide a valid key in the settings above or contact the administrator."
        });
      }

      // Security: Sanitize original filename before passing to multipart form
      const rawName = path.basename(req.file.originalname || "audio.mp3");
      const safeFilename = rawName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "audio.mp3";

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
        timeout: 60000,
      });

      const audioUrl = uploadResponse.data.audio_url;

      if (!audioUrl || typeof audioUrl !== "string") {
        throw new Error("Failed to get audio_url from Gladia upload response");
      }

      const parsedAudioUrl = new URL(audioUrl);
      if (parsedAudioUrl.protocol !== "https:") {
        throw new Error("Invalid audio_url protocol returned by upload service");
      }

      // Step 2: Start transcription
      console.log("Transcription upload successful. Starting transcription task...");
      const transcriptionResponse = await axios.post(
        "https://api.gladia.io/v2/transcription",
        {
          audio_url: audioUrl,
          diarization: false,
        },
        {
          headers: {
            "x-gladia-key": apiKey,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      const resultUrl = transcriptionResponse.data.result_url;
      const taskId = transcriptionResponse.data.id;
      console.log(`Transcription task started. Task ID: ${taskId}`);

      if (!resultUrl || typeof resultUrl !== "string") {
        throw new Error("Failed to get result_url from Gladia transcription response");
      }

      // Security: Validate resultUrl host and protocol is strictly HTTPS to Gladia API to prevent SSRF
      const parsedResultUrl = new URL(resultUrl);
      if (parsedResultUrl.protocol !== "https:" || parsedResultUrl.hostname !== "api.gladia.io") {
        throw new Error("Invalid result_url returned by transcription service");
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
            timeout: 15000,
          });

          status = pollResponse.data.status;
          
          if (status === "done") {
            transcriptionResult = pollResponse.data.result;
            console.log(`Task ${taskId} is DONE!`);
          } else if (status === "error") {
            console.error(`Task ${taskId} failed:`, pollResponse.data);
            const errInfo = pollResponse.data.error?.message || "Transcription processing failed";
            throw new Error(`Gladia task error: ${errInfo}`);
          }
        } catch (pollErr: any) {
          console.error(`Error during polling task ${taskId}:`, pollErr.message);
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
      let errorDetail = "An unexpected error occurred during audio transcription.";
      const upstreamStatus = error.response?.status;
      
      if (error.response) {
        console.error("Gladia API error response status:", upstreamStatus);
        if (upstreamStatus === 401 || upstreamStatus === 403) {
          errorMessage = "Gladia API 认证失败，请检查 API Key 是否有效。";
          errorDetail = "API Key 无效或权限不足。";
        } else if (upstreamStatus === 402) {
          errorMessage = "Gladia 账户额度不足 (402 Payment Required)。";
          errorDetail = "账户免费或订阅点数已耗尽，请更换 API Key。";
        } else if (upstreamStatus === 429) {
          errorMessage = "Gladia API 请求速率超出限制 (429 Too Many Requests)。";
          errorDetail = "请稍后重试。";
        } else {
          errorMessage = `Gladia API 错误 (${upstreamStatus})`;
          errorDetail = typeof error.response.data?.message === 'string' 
            ? error.response.data.message 
            : "上游服务处理失败";
        }
      } else if (error.request) {
        errorMessage = "无法连接至 Gladia 语音服务 (No response received)";
        errorDetail = "网络连接超时或上游服务无响应。";
      } else {
        errorMessage = error.message || "音频处理初始化异常";
        errorDetail = error.message || "Internal error";
      }
      
      // Security: Never leak full or masked system keys to the client
      const statusCode = upstreamStatus || 500;
      res.status(statusCode).json({
        error: errorMessage,
        statusCode,
        suspectedReason: errorDetail,
        quotaHint: upstreamStatus === 402 || upstreamStatus === 429 
          ? "请前往 Gladia 控制台 (app.gladia.io) 检查当前账户的转录时长额度，或在左侧面板填入新的有效 API Key。" 
          : "请检查音频文件格式或网络连接状态。",
        details: errorDetail,
      });
    }
  });

  // API route for text correction using Gemini
  // Allowed models allowlist to prevent arbitrary model specification
  const ALLOWED_MODELS = new Set([
    "gemini-3.8-flash",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-flash-latest",
    "gemini-3.6-flash",
  ]);

  app.post("/api/correct", correctLimiter, async (req, res) => {
    // Explicitly set JSON content-type header for API response
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    let targetModel = "gemini-3.8-flash";

    try {
      const { 
        transcribedText, 
        referenceText, 
        options = {}, 
        model = "gemini-3.8-flash" 
      } = req.body;

      // Model validation - map legacy gemini-3.6-flash to gemini-3.8-flash
      const validatedModel = ALLOWED_MODELS.has(model) ? model : "gemini-3.8-flash";
      targetModel = validatedModel === "gemini-3.6-flash" ? "gemini-3.8-flash" : validatedModel;

      // Security: Closed-loop prompt construction. Disallow client-provided raw prompts to prevent arbitrary LLM proxying.
      if (typeof transcribedText !== "string" || typeof referenceText !== "string") {
        return res.status(400).json({ error: "缺少必要的文本参数 (Missing transcribedText or referenceText)" });
      }

      // Enforce maximum length of 100,000 characters to prevent buffer exhaustion DoS
      if (transcribedText.length > 100000 || referenceText.length > 100000) {
        return res.status(400).json({ error: "文本长度超过最大限制 (Text exceeds 100,000 characters limit)" });
      }

      const finalPrompt = buildCorrectionPrompt(transcribedText, referenceText, options);

      let ai: GoogleGenAI;
      try {
        ai = getGeminiClient();
      } catch (err: any) {
        return res.status(500).json({ error: err.message || "Gemini API key is not configured" });
      }

      console.log(`--- New Correction Request using ${targetModel} (0 retries mode) ---`);

      // 0 retries mode: execute exactly 1 single attempt to conserve daily quota (RPD/RPM)
      const response = await ai.models.generateContent({ 
        model: targetModel,
        contents: finalPrompt,
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
                description: "Analysis of differences between Text C and Text B in Chinese"
              }
            },
            required: ["correctedText", "differences"]
          }
        }
      });

      const text = response.text;
      console.log("Correction completed successfully.");
      return res.json({ text });
    } catch (error: any) {
      console.error("Gemini correction failed:", error?.message || error);
      
      const rawStatus = error?.status || error?.statusCode;
      const statusMsg = String(error?.message || "");

      let statusCode = 500;
      let errorTitle = "文本校对处理失败";
      let suspectedReason = "模型在处理请求时发生内部异常。";
      let quotaHint = "请前往 Google AI Studio (aistudio.google.com) 检查您的账号使用量与额度。";

      if (rawStatus === 429 || statusMsg.includes("429") || statusMsg.includes("RESOURCE_EXHAUSTED")) {
        statusCode = 429;
        errorTitle = "Gemini API 配额超限或并发过快 (Quota / Rate Limit Exceeded)";
        suspectedReason = "每分钟请求频率超出限制（如超出免费层 5 RPM 限制）或每日请求总额度已用尽（如超出 20 RPD 限制）。";
        quotaHint = "请前往 Google AI Studio (aistudio.google.com) 控制台检查当前账号的 RPM (每分钟请求数) 与 RPD (每日请求数) 进度条。免费层每分钟最多支持 5 次请求，请等待 1 分钟后重试。";
      } else if (rawStatus === 503 || statusMsg.includes("503") || statusMsg.includes("Service Unavailable") || statusMsg.includes("overloaded")) {
        statusCode = 503;
        errorTitle = "Gemini 模型服务暂时不可用 (Service Unavailable)";
        suspectedReason = "Google 云端该模型服务器当前遭遇突发高峰流量、节点拥堵或正在进行临时扩容维护。当前已按要求配置为 0 次自动重试，本次报错未额外浪费您的宝贵额度。";
        quotaHint = "请稍候 10~30 秒后重试。同时请留意 Google AI Studio 状态，并检查当前时间段的 RPM / TPM 用量。";
      } else if (rawStatus === 403 || statusMsg.includes("403") || statusMsg.includes("PERMISSION_DENIED")) {
        statusCode = 403;
        errorTitle = "API 访问权限受限 (Permission Denied)";
        suspectedReason = "当前 API 凭据无效、权限不足，或当前 IP 所在网络区域不受 Gemini 服务支持。";
        quotaHint = "请在 Google AI Studio 控制台中检查当前工作区注入的 API Key 状态是否正常。";
      } else if (rawStatus === 404 || statusMsg.includes("404") || statusMsg.includes("NOT_FOUND")) {
        statusCode = 404;
        errorTitle = "模型不存在或已停用 (Model Not Found)";
        suspectedReason = `请求的模型 ${targetModel} 在当前服务节点不可用。`;
        quotaHint = "系统已选用最新的 gemini-3.8-flash 模型，请检查模型支持列表。";
      } else if (statusMsg.includes("fetch failed") || statusMsg.includes("ENOTFOUND") || statusMsg.includes("ETIMEDOUT")) {
        statusCode = 504;
        errorTitle = "模型服务器网络连接超时";
        suspectedReason = "后端连接 Google AI 端点时发生网络连接超时或中断。";
        quotaHint = "请检查容器外网访问状态或稍候重试。";
      }

      // Security: Strip potential credentials, API keys or sensitive paths from error message
      const rawDetails = String(error?.message || error || "Unknown error");
      const safeDetails = rawDetails
        .replace(/([a-zA-Z0-9_\-]{32,})/g, (m) => m.slice(0, 4) + "****" + m.slice(-4))
        .replace(/([A-Za-z]:\\[^:\s]+|\/[^:\s]+\/[^:\s]+)/g, "[REDACTED_PATH]");

      return res.status(statusCode).json({
        error: errorTitle,
        statusCode,
        suspectedReason,
        quotaHint,
        details: safeDetails
      });
    }
  });

  // Catch-all for missing API routes (MUST be before Vite/Static)
  app.all("/api/*", (req, res) => {
    console.log(`[404] API route not found: ${req.method} ${req.path}`);
    res.status(404).json({ error: "API route not found" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    
    // SPA fallback for production (rate limited to resolve CodeQL js/missing-rate-limiting)
    app.get("*", generalLimiter, (req, res, next) => {
      if (req.url.startsWith("/api/")) return next();
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Error handler: never leak stack traces to untrusted clients
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express error:", err);
    if (res.headersSent) {
      return next(err);
    }
    // Ensure we always return JSON for API errors
    if (req.url.startsWith("/api/") || req.headers.accept?.includes("application/json")) {
      return res.status(err.status || 500).json({ 
        error: err.message || "Internal Server Error"
      });
    }
    res.status(err.status || 500).send("Internal Server Error");
  });

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  // Set timeout for long-running transcription tasks
  server.timeout = 600000; // 10 minutes
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
