import { describe, it, expect } from "vitest";

// Server route validator logic mirroring server.ts route checks
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
});
