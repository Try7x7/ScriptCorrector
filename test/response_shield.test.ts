import { describe, it, expect } from "vitest";

// Client-side response parser mirroring App.tsx's runGemini defensive logic
async function parseServerResponse(mockResponse: {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}) {
  const rawResponseText = await mockResponse.text();
  let responseJson: any = null;

  try {
    responseJson = JSON.parse(rawResponseText);
  } catch (parseErr) {
    if (rawResponseText.trim().startsWith("<!doctype") || rawResponseText.trim().startsWith("<html")) {
      throw new Error(`服务器响应异常 (返回了 HTML 页面，HTTP ${mockResponse.status})。可能是后台服务冷启动中，请稍候几秒后重试。`);
    }
    throw new Error(`服务器返回了非 JSON 格式响应 (HTTP ${mockResponse.status}): ${rawResponseText.substring(0, 120)}`);
  }

  if (!mockResponse.ok) {
    const errorMsg = responseJson.error || responseJson.details || `校正失败 (HTTP ${mockResponse.status})`;
    const err = new Error(errorMsg);
    (err as any).errorCode = responseJson.errorCode || `HTTP ${mockResponse.status}`;
    (err as any).errorReason = responseJson.errorReason;
    (err as any).quotaTip = responseJson.quotaTip;
    throw err;
  }

  return responseJson;
}

describe("Response Shield & Anti-HTML-Crash Verification (网关HTML防御与流安全测试)", () => {
  it("Case 2.1: Intercepts 504 Gateway Timeout HTML page gracefully without SyntaxError", async () => {
    const html504 = `<!doctype html>
<html lang="en">
<head><title>504 Gateway Time-out</title></head>
<body><h1>504 Gateway Time-out</h1>The server didn't respond in time.</body>
</html>`;

    let readCount = 0;
    const mockResponse = {
      ok: false,
      status: 504,
      text: async () => {
        readCount++;
        return html504;
      }
    };

    let caughtError: any;
    try {
      await parseServerResponse(mockResponse);
    } catch (e: any) {
      caughtError = e;
    }

    expect(caughtError).toBeDefined();
    // Must NOT be SyntaxError: Unexpected token '<'
    expect(caughtError.name).not.toBe("SyntaxError");
    expect(caughtError.message).not.toContain("Unexpected token '<'");
    // Must contain friendly Chinese explanation
    expect(caughtError.message).toContain("返回了 HTML 页面，HTTP 504");
    expect(caughtError.message).toContain("可能是后台服务冷启动中");
    // Verify stream was read only once
    expect(readCount).toBe(1);
  });

  it("Case 2.2: Intercepts 502 Bad Gateway HTML page from proxy cleanly", async () => {
    const html502 = `<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN"><html><head><title>502 Bad Gateway</title></head><body><h1>Bad Gateway</h1></body></html>`;

    const mockResponse = {
      ok: false,
      status: 502,
      text: async () => html502
    };

    let caughtError: any;
    try {
      await parseServerResponse(mockResponse);
    } catch (e: any) {
      caughtError = e;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.message).toContain("HTTP 502");
    expect(caughtError.message).not.toContain("Unexpected token '<'");
  });

  it("Case 2.3: Properly extracts structured error info when server returns JSON 503 error", async () => {
    const errorJson = JSON.stringify({
      error: "Gemini 官方服务暂时过载 (503 Service Unavailable)",
      errorCode: "HTTP 503 / UNAVAILABLE",
      errorReason: "Google Gemini 官方服务器当前出现突发高并发负载。已关闭后台重试。",
      quotaTip: "免费层配额上限通常为 5 RPM / 20 RPD。请前往 Google AI Studio 检查用量。"
    });

    const mockResponse = {
      ok: false,
      status: 503,
      text: async () => errorJson
    };

    let caughtError: any;
    try {
      await parseServerResponse(mockResponse);
    } catch (e: any) {
      caughtError = e;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.errorCode).toBe("HTTP 503 / UNAVAILABLE");
    expect(caughtError.errorReason).toContain("高并发负载");
    expect(caughtError.quotaTip).toContain("5 RPM / 20 RPD");
  });

  it("Case 2.4: Parses successful JSON payload seamlessly", async () => {
    const successJson = JSON.stringify({
      text: JSON.stringify({
        correctedText: "Dios ha bendecido a todos.",
        differences: "Corrección gramatical."
      }),
      model: "gemini-3.8-flash"
    });

    const mockResponse = {
      ok: true,
      status: 200,
      text: async () => successJson
    };

    const res = await parseServerResponse(mockResponse);
    expect(res).toBeDefined();
    expect(res.model).toBe("gemini-3.8-flash");
    const inner = JSON.parse(res.text);
    expect(inner.correctedText).toBe("Dios ha bendecido a todos.");
  });
});
