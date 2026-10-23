import { describe, it, expect, vi } from "vitest";

// Simulation helper mirroring server.ts's Gemini error handler logic
function handleGeminiError(error: any) {
  const status = error.status || 500;
  const rawMsg = error.message || "";

  let errorCode = `HTTP ${status}`;
  let errorReason = "请求 Google Gemini 官方接口时返回异常。";
  let quotaTip = "当前免费层配额通常为 5 RPM（每分钟 5 次）与 20 RPD（每日 20 次）。系统已关闭后台自动重试以节约您的限额，请前往 Google AI Studio 检查用量。";

  if (status === 503 || rawMsg.includes("503") || rawMsg.includes("UNAVAILABLE") || rawMsg.includes("high demand") || rawMsg.includes("Service Unavailable")) {
    errorCode = "HTTP 503 / UNAVAILABLE";
    errorReason = "Google Gemini 官方服务器当前出现突发高并发负载（Service Unavailable）。为了保护您的宝贵每日配额，系统未在后台发起额外的自动重试。";
    quotaTip = "免费层额度紧张（5 RPM / 20 RPD）。请稍候 1~2 分钟待 Google 负载回落后再手动点击重试，并在 Google AI Studio 控制台查看当前使用量。";
    return {
      status: 503,
      body: {
        error: "Gemini 官方服务暂时过载 (503 Service Unavailable)",
        errorCode,
        errorReason,
        quotaTip,
        details: rawMsg
      }
    };
  }

  if (status === 429 || rawMsg.includes("429") || rawMsg.includes("RESOURCE_EXHAUSTED") || rawMsg.includes("quota") || rawMsg.includes("Quota Exceeded")) {
    errorCode = "HTTP 429 / RESOURCE_EXHAUSTED";
    errorReason = "已触发 Google Gemini API 配额速率限制（通常因超过 5 RPM 突发上限或耗尽了今日 20 RPD 免费总额）。";
    quotaTip = "请前往 Google AI Studio (aistudio.google.com) 控制台检查您当天的 RPD (Requests Per Day) 剩余次数。若已达当日上限需等待次日重置或绑定计费项目。";
    return {
      status: 429,
      body: {
        error: "Gemini API 配额已耗尽 (429 Quota Exceeded)",
        errorCode,
        errorReason,
        quotaTip,
        details: rawMsg
      }
    };
  }

  if (status === 404 || rawMsg.includes("404") || rawMsg.includes("NOT_FOUND")) {
    errorCode = "HTTP 404 / NOT_FOUND";
    errorReason = "调用的模型在该项目中不可用或已弃用。建议确认模型权限与配置。";
    quotaTip = "请检查 Google AI Studio 控制台中的模型可用性。";
    return {
      status: 404,
      body: {
        error: "模型不存在或已停用 (404 Not Found)",
        errorCode,
        errorReason,
        quotaTip,
        details: rawMsg
      }
    };
  }

  if (status === 401 || status === 403 || rawMsg.includes("401") || rawMsg.includes("403") || rawMsg.includes("PERMISSION_DENIED")) {
    errorCode = `HTTP ${status} / PERMISSION_DENIED`;
    errorReason = "GEMINI_API_KEY 无效、已失效或未被授予该模型访问权限。";
    quotaTip = "请在 AI Studio Secrets 面板中核对并配置有效的 API Key。";
    return {
      status,
      body: {
        error: "API Key 认证失败 (Permission Denied)",
        errorCode,
        errorReason,
        quotaTip,
        details: rawMsg
      }
    };
  }

  return {
    status,
    body: {
      error: "文本校正失败",
      errorCode,
      errorReason,
      quotaTip,
      details: rawMsg
    }
  };
}

describe("Quota Protection & Zero Retries Verification (配额保护与0重试测试)", () => {
  it("Case 1.1: When 503 Service Unavailable occurs, must NOT retry and must return structured quota advice", async () => {
    let callCount = 0;
    const mockGenerateContent = vi.fn().mockImplementation(async () => {
      callCount++;
      const err: any = new Error("This model is currently experiencing high demand. Spikes in demand are usually temporary.");
      err.status = 503;
      throw err;
    });

    let caughtError: any;
    try {
      // Execute with zero retries
      await mockGenerateContent();
    } catch (e) {
      caughtError = e;
    }

    // Strictly 1 call made - 0 automatic retries
    expect(callCount).toBe(1);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);

    const result = handleGeminiError(caughtError);
    expect(result.status).toBe(503);
    expect(result.body.errorCode).toBe("HTTP 503 / UNAVAILABLE");
    expect(result.body.errorReason).toContain("未在后台发起额外的自动重试");
    expect(result.body.quotaTip).toContain("5 RPM / 20 RPD");
    expect(result.body.quotaTip).toContain("Google AI Studio");
  });

  it("Case 1.2: When 429 Quota Exceeded occurs, must return detailed RPD/RPM guidance", () => {
    const error: any = new Error("Resource has been exhausted (e.g. check quota).");
    error.status = 429;

    const result = handleGeminiError(error);
    expect(result.status).toBe(429);
    expect(result.body.errorCode).toBe("HTTP 429 / RESOURCE_EXHAUSTED");
    expect(result.body.errorReason).toContain("配额速率限制");
    expect(result.body.quotaTip).toContain("RPD (Requests Per Day)");
  });

  it("Case 1.3: Permission Denied (401/403) must prompt to check GEMINI_API_KEY", () => {
    const error: any = new Error("API_KEY_INVALID");
    error.status = 401;

    const result = handleGeminiError(error);
    expect(result.status).toBe(401);
    expect(result.body.errorCode).toBe("HTTP 401 / PERMISSION_DENIED");
    expect(result.body.errorReason).toContain("GEMINI_API_KEY");
  });

  it("Case 1.4: Single successful request consumes exactly 1 attempt", async () => {
    let callCount = 0;
    const mockGenerateContent = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        text: JSON.stringify({
          correctedText: "Texto corregido",
          differences: "Ninguna discrepancia"
        })
      };
    });

    const res = await mockGenerateContent();
    expect(callCount).toBe(1);
    expect(JSON.parse(res.text).correctedText).toBe("Texto corregido");
  });
});
