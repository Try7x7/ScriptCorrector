import { describe, it, expect } from "vitest";

// Server route validator logic mirroring server.ts route checks
const ALLOWED_GEMINI_MODELS = new Set([
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-flash-latest"
]);

function validateCorrectionRequest(body: any): { status: number; body: any } | null {
  const { prompt, model = "gemini-3.8-flash" } = body || {};

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return {
      status: 400,
      body: {
        error: "Prompt is required and must be a non-empty string",
        errorCode: "HTTP 400 / BAD_REQUEST",
        errorReason: "前端提交的校对提示词为空或格式不合法。"
      }
    };
  }

  // Max 100,000 characters boundary enforcement
  if (prompt.length > 100000) {
    return {
      status: 400,
      body: {
        error: "Prompt exceeds maximum allowed length of 100,000 characters",
        errorCode: "HTTP 400 / PAYLOAD_TOO_LARGE",
        errorReason: "提交的文本超过了最大单次处理限制（10万字符）。"
      }
    };
  }

  const { systemInstruction } = body || {};
  if (typeof systemInstruction === "string" && systemInstruction.length > 50000) {
    return {
      status: 400,
      body: {
        error: "systemInstruction exceeds maximum allowed length of 50,000 characters",
        errorCode: "HTTP 400 / PAYLOAD_TOO_LARGE",
        errorReason: "提交的 systemInstruction 超过了单次最大允许长度（50,000 字符）。"
      }
    };
  }

  if (typeof model !== "string" || !ALLOWED_GEMINI_MODELS.has(model)) {
    return {
      status: 400,
      body: {
        error: "Invalid model specified. Only approved Gemini models are supported.",
        errorCode: "HTTP 400 / INVALID_MODEL",
        errorReason: `指定的模型名称 (${String(model).substring(0, 50)}) 不在允许的白名单内。`
      }
    };
  }

  return null; // Valid request
}

// In-memory rate limiter logic mirroring server.ts
function createRateLimiter(maxRequests: number, windowMs: number) {
  const ipRequests = new Map<string, { count: number; resetTime: number }>();

  return function checkRateLimit(ip: string, now: number = Date.now()) {
    const record = ipRequests.get(ip);

    if (!record || now > record.resetTime) {
      ipRequests.set(ip, { count: 1, resetTime: now + windowMs });
      return { allowed: true };
    }

    if (record.count >= maxRequests) {
      return {
        allowed: false,
        status: 429,
        body: {
          error: "Too Many Requests",
          details: "Rate limit exceeded. Please wait a moment before sending more requests."
        }
      };
    }

    record.count++;
    return { allowed: true };
  };
}

describe("Server Route Parameter & Defense Validation (服务端路由校验与限流测试)", () => {
  it("Case 1.1: Rejects empty or whitespace-only prompt with HTTP 400", () => {
    const resEmpty = validateCorrectionRequest({ prompt: "" });
    expect(resEmpty).not.toBeNull();
    expect(resEmpty?.status).toBe(400);
    expect(resEmpty?.body.errorCode).toBe("HTTP 400 / BAD_REQUEST");

    const resWhitespace = validateCorrectionRequest({ prompt: "    \n\t   " });
    expect(resWhitespace).not.toBeNull();
    expect(resWhitespace?.status).toBe(400);

    const resMissing = validateCorrectionRequest({});
    expect(resMissing).not.toBeNull();
    expect(resMissing?.status).toBe(400);
  });

  it("Case 1.2: Rejects prompt exceeding 100,000 characters with HTTP 400 PAYLOAD_TOO_LARGE", () => {
    // 100,001 characters
    const hugePrompt = "a".repeat(100001);
    const res = validateCorrectionRequest({ prompt: hugePrompt });

    expect(res).not.toBeNull();
    expect(res?.status).toBe(400);
    expect(res?.body.errorCode).toBe("HTTP 400 / PAYLOAD_TOO_LARGE");
    expect(res?.body.errorReason).toContain("10万字符");
  });

  it("Case 1.3: Accepts prompt within 100,000 characters limit", () => {
    const validPrompt = "a".repeat(99999);
    const res = validateCorrectionRequest({ prompt: validPrompt });
    expect(res).toBeNull(); // Valid!
  });

  it("Case 1.4: Rejects unauthorized or unknown model names with HTTP 400", () => {
    const res = validateCorrectionRequest({
      prompt: "Valid prompt content",
      model: "gpt-4-malicious-input"
    });

    expect(res).not.toBeNull();
    expect(res?.status).toBe(400);
    expect(res?.body.errorCode).toBe("HTTP 400 / INVALID_MODEL");
    expect(res?.body.errorReason).toContain("白名单");
  });

  it("Case 1.5: Enforces IP rate limiting threshold", () => {
    // Rate limiter allowing 5 requests per 1000ms
    const limiter = createRateLimiter(5, 1000);
    const clientIp = "192.168.1.100";
    const now = 100000;

    // First 5 requests must pass
    for (let i = 0; i < 5; i++) {
      const result = limiter(clientIp, now);
      expect(result.allowed).toBe(true);
    }

    // 6th request within window must be rejected with 429
    const blocked = limiter(clientIp, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.status).toBe(429);
    expect(blocked.body?.error).toBe("Too Many Requests");

    // After window expires (1000ms later), next request passes
    const nextWindow = limiter(clientIp, now + 1001);
    expect(nextWindow.allowed).toBe(true);
  });

  it("Case 1.6: Normalizes invalid or out-of-range error status codes to safe HTTP range (400-599)", () => {
    function sanitizeStatusCode(statusInput: any): number {
      const rawStatus = typeof statusInput === 'number' ? statusInput : parseInt(statusInput, 10);
      return Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
    }

    expect(sanitizeStatusCode(400)).toBe(400);
    expect(sanitizeStatusCode(429)).toBe(429);
    expect(sanitizeStatusCode(503)).toBe(503);
    // Out of range or non-integer codes fall back safely to 500
    expect(sanitizeStatusCode(200)).toBe(500); // 2xx in error handler is invalid
    expect(sanitizeStatusCode(999)).toBe(500);
    expect(sanitizeStatusCode(-1)).toBe(500);
    expect(sanitizeStatusCode("invalid_code")).toBe(500);
    expect(sanitizeStatusCode(undefined)).toBe(500);
  });

  it("Case 1.7: Does not misjudge timeout when task completes exactly on max attempt (attempt 180)", () => {
    let status = "queued";
    let attempts = 0;
    const maxAttempts = 180;
    let timedOut = false;

    // Simulate task taking exactly 180 attempts to complete
    while (status !== "done" && attempts < maxAttempts) {
      attempts++;
      if (attempts === 180) {
        status = "done";
        break;
      }
    }

    // Buggy condition was: if (attempts >= maxAttempts) -> true!
    // Correct condition: if (status !== "done") -> false!
    if (status !== "done") {
      timedOut = true;
    }

    expect(attempts).toBe(180);
    expect(status).toBe("done");
    expect(timedOut).toBe(false); // Succeeded on attempt 180, not timed out!
  });

  it("Case 1.8: Rejects empty or whitespace-only response.text to prevent frontend fallback to empty object", () => {
    function validateModelText(text: any): string {
      if (!text || typeof text !== "string" || text.trim().length === 0) {
        throw new Error("Gemini API returned an empty or invalid text response");
      }
      return text;
    }

    expect(() => validateModelText("")).toThrow("empty or invalid text response");
    expect(() => validateModelText("   \n  ")).toThrow("empty or invalid text response");
    expect(() => validateModelText(undefined)).toThrow("empty or invalid text response");
    expect(() => validateModelText(null)).toThrow("empty or invalid text response");
    expect(validateModelText("Valid text response")).toBe("Valid text response");
  });

  it("Case 1.9: Classifies upstream network timeouts and connection resets as UPSTREAM_NETWORK_ERROR", () => {
    function classifyError(error: any) {
      const rawMsg = error.message || "";
      const upstreamErrorCode = error.code || error.cause?.code;
      const isUpstreamNetworkError = 
        ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ENOTFOUND'].includes(upstreamErrorCode) ||
        rawMsg.toLowerCase().includes('fetch failed');

      if (isUpstreamNetworkError) {
        return {
          status: 504,
          errorCode: "UPSTREAM_NETWORK_ERROR",
          quotaTip: "网络连接在响应完成前中断，本次请求很可能未消耗免费额度。"
        };
      }
      return { status: 500, errorCode: "GENERAL_ERROR" };
    }

    const resetErr = new Error("Connection reset by peer");
    (resetErr as any).code = "ECONNRESET";
    expect(classifyError(resetErr).errorCode).toBe("UPSTREAM_NETWORK_ERROR");
    expect(classifyError(resetErr).status).toBe(504);

    const fetchFailedErr = new Error("TypeError: fetch failed");
    expect(classifyError(fetchFailedErr).errorCode).toBe("UPSTREAM_NETWORK_ERROR");

    const regularErr = new Error("Some business logic error");
    expect(classifyError(regularErr).errorCode).toBe("GENERAL_ERROR");
  });

  it("Case 1.10: Upload concurrency slot releases immediately upon upload completion, not held during transcription", () => {
    let activeUploads = 0;
    const MAX_CONCURRENT = 2;

    const simulateUploadAndTranscribe = (onUploadDone: () => void) => {
      if (activeUploads >= MAX_CONCURRENT) {
        return { allowed: false, status: 503, retryAfter: 30 };
      }
      activeUploads++;

      let released = false;
      const releaseSlot = () => {
        if (!released) {
          released = true;
          activeUploads = Math.max(0, activeUploads - 1);
        }
      };

      // Simulating audio upload to Gladia finishing
      onUploadDone();
      releaseSlot();

      return { allowed: true, releaseSlot };
    };

    // Client 1 uploads
    const req1 = simulateUploadAndTranscribe(() => {});
    expect(req1.allowed).toBe(true);
    // Because slot is released after upload step, activeUploads is back to 0
    expect(activeUploads).toBe(0);

    // Client 2 and 3 can both upload sequentially or concurrently without being locked out
    // for 5 minutes during transcription
    const req2 = simulateUploadAndTranscribe(() => {});
    expect(req2.allowed).toBe(true);
    expect(activeUploads).toBe(0);
  });

  it("Case 1.11: Polling loop circuit breaker terminates only when continuous failures exceed 60s", () => {
    let lastSuccessfulPollTime = 1000;
    const nowWithinWindow = 1000 + 40000; // 40s elapsed (<60s)
    const nowExceededWindow = 1000 + 65000; // 65s elapsed (>60s)

    function checkCircuitBreaker(now: number, lastSuccess: number) {
      if (now - lastSuccess > 60000) {
        throw new Error("Circuit breaker triggered (>60s)");
      }
      return "continue_polling";
    }

    // Within 60s window: tolerates transient failures
    expect(checkCircuitBreaker(nowWithinWindow, lastSuccessfulPollTime)).toBe("continue_polling");

    // Beyond 60s continuous failures: trips circuit breaker
    expect(() => checkCircuitBreaker(nowExceededWindow, lastSuccessfulPollTime)).toThrow("Circuit breaker triggered (>60s)");
  });

  it("Case 1.12: Rejects oversized systemInstruction exceeding 50,000 characters with HTTP 400", () => {
    const hugeInstruction = "x".repeat(50001);
    const res = validateCorrectionRequest({
      prompt: "Valid prompt",
      systemInstruction: hugeInstruction
    });

    expect(res).not.toBeNull();
    expect(res?.status).toBe(400);
    expect(res?.body.errorCode).toBe("HTTP 400 / PAYLOAD_TOO_LARGE");

    const validInstruction = "x".repeat(1000);
    const validRes = validateCorrectionRequest({
      prompt: "Valid prompt",
      systemInstruction: validInstruction
    });
    expect(validRes).toBeNull();
  });

  it("Case 1.13: sanitizeErrorMessage strips API keys, Bearer tokens, and internal filesystem paths", () => {
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

    const errorWithApiKey = "Request failed with URL: https://api.service.com/v1?key=AIzaSyD9TestSecretKey1234567890abcdefg";
    const sanitized1 = sanitizeErrorMessage(errorWithApiKey);
    expect(sanitized1).not.toContain("AIzaSyD9TestSecretKey1234567890abcdefg");
    expect(sanitized1).toContain("[REDACTED");

    const errorWithBearer = "Authorization failure: Bearer ya29.a0AfH6SMA...";
    const sanitized2 = sanitizeErrorMessage(errorWithBearer);
    expect(sanitized2).not.toContain("ya29.a0AfH6SMA");
    expect(sanitized2).toContain("Bearer [REDACTED]");

    const errorWithPath = "Failed at /app/applet/server.ts:45:10 in /root/project/node_modules/express/lib/router.js";
    const sanitized3 = sanitizeErrorMessage(errorWithPath);
    expect(sanitized3).toContain("[APP_PATH]");
    expect(sanitized3).toContain("[INTERNAL_PATH]");
  });

  it("Case 1.14: Pre-upload concurrency guard rejects requests BEFORE buffering file into memory", () => {
    let activeUploads = 2; // Maximum concurrent limit reached
    const MAX_CONCURRENT = 2;
    let memoryAllocated = false;

    function handleUploadRequest() {
      // Step 1: Pre-upload guard check
      if (activeUploads >= MAX_CONCURRENT) {
        return { status: 503, retryAfter: 30, body: "CONCURRENT_UPLOADS_EXCEEDED" };
      }
      // Step 2: Multer parses and buffers file
      memoryAllocated = true;
      activeUploads++;
      return { status: 200, body: "OK" };
    }

    const res = handleUploadRequest();
    expect(res.status).toBe(503);
    // Crucial security invariant: Memory buffer was NEVER allocated for the rejected request!
    expect(memoryAllocated).toBe(false);
  });

  it("Case 1.15: Cross-site request check blocks unauthorized external origins from calling API endpoints", () => {
    function validateCrossSite(method: string, secFetchSite?: string, origin?: string): { allowed: boolean; status?: number } {
      if (method === "GET" || method === "OPTIONS") return { allowed: true };

      if (secFetchSite === "cross-site") {
        if (origin) {
          try {
            const originUrl = new URL(origin);
            const hostname = originUrl.hostname;
            const isAllowed = 
              hostname === "localhost" ||
              hostname === "127.0.0.1" ||
              hostname.endsWith(".google.com") ||
              hostname.endsWith(".run.app") ||
              hostname.endsWith(".web.app");
            if (!isAllowed) return { allowed: false, status: 403 };
          } catch {
            return { allowed: false, status: 403 };
          }
        } else {
          return { allowed: false, status: 403 };
        }
      }
      return { allowed: true };
    }

    // Malicious attacker website trying to drain API quota via CSRF
    expect(validateCrossSite("POST", "cross-site", "https://evil-attacker.com").allowed).toBe(false);
    expect(validateCrossSite("POST", "cross-site", "https://evil-attacker.com").status).toBe(403);

    // Legitimate AI Studio preview environments
    expect(validateCrossSite("POST", "cross-site", "https://ais-preview.run.app").allowed).toBe(true);
    expect(validateCrossSite("POST", "cross-site", "https://aistudio.google.com").allowed).toBe(true);
    expect(validateCrossSite("POST", "cross-site", "http://localhost:3000").allowed).toBe(true);

    // Standard same-origin requests
    expect(validateCrossSite("POST", "same-origin", undefined).allowed).toBe(true);
  });

  it("Case 1.13: Validates taskId and custom Gladia API key format against injection", () => {
    const isValidTaskId = (id: string) => /^[a-zA-Z0-9_\-]+$/.test(id);
    const isValidGladiaKey = (key: string) => /^[a-zA-Z0-9_\-]{16,128}$/.test(key);

    expect(isValidTaskId("abc-123_XYZ")).toBe(true);
    expect(isValidTaskId("../../../etc/passwd")).toBe(false);
    expect(isValidTaskId("task;DROP TABLE;")).toBe(false);
    expect(isValidTaskId("task id with spaces")).toBe(false);

    expect(isValidGladiaKey("a".repeat(16))).toBe(true);
    expect(isValidGladiaKey("valid-gladia-key_1234567890")).toBe(true);
    expect(isValidGladiaKey("short")).toBe(false); // < 16 chars
    expect(isValidGladiaKey("a".repeat(129))).toBe(false); // > 128 chars
    expect(isValidGladiaKey("bad key with spaces!")).toBe(false);
    expect(isValidGladiaKey("bad\r\nheader:injection")).toBe(false);
  });
});

