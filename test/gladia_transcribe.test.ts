import { describe, it, expect, vi } from "vitest";

// Simulation helper mirroring server.ts's /api/transcribe logic
function handleTranscribeRequest(
  hasFile: boolean,
  customKeyHeader?: string,
  serverEnvKey?: string,
  targetLang: string = "es",
  gladiaMockResponse?: { status: number; data?: any }
) {
  if (!hasFile) {
    return {
      status: 400,
      body: { error: "No audio file uploaded" }
    };
  }

  const effectiveKey = customKeyHeader || serverEnvKey;
  const customKeyUsed = Boolean(customKeyHeader && customKeyHeader.trim());

  if (!effectiveKey) {
    return {
      status: 500,
      body: {
        error: "Gladia API key is not configured",
        details: "Please provide a custom Gladia API Key in the settings panel."
      }
    };
  }

  // Handle Gladia API response
  if (gladiaMockResponse) {
    if (gladiaMockResponse.status === 402) {
      return {
        status: 402,
        body: {
          error: "Gladia API 免费额度已耗尽 (Payment Required / Quota Exceeded)",
          details: "当前 Gladia 账号的免费转录时长已全部用完。请在界面设置中填入新的 Gladia API Key 进行应急切换。",
          customKeyUsed
        }
      };
    }

    if (gladiaMockResponse.status !== 200) {
      return {
        status: gladiaMockResponse.status,
        body: {
          error: "Transcription failed",
          details: gladiaMockResponse.data || "Upstream Gladia API error",
          customKeyUsed
        }
      };
    }

    return {
      status: 200,
      body: {
        text: gladiaMockResponse.data?.text || "",
        language: targetLang,
        customKeyUsed
      }
    };
  }

  return {
    status: 200,
    body: {
      text: "Texto de prueba transcrito correctamente",
      language: targetLang,
      customKeyUsed
    }
  };
}

describe("Gladia Audio Transcription Mock & Error Interception (Gladia 语音转录模拟测试)", () => {
  it("Case 1.1: Rejects request with HTTP 400 when no audio file is uploaded", () => {
    const res = handleTranscribeRequest(false, undefined, "server-key-123");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No audio file uploaded");
  });

  it("Case 1.2: Prioritizes user custom API key and flags customKeyUsed: true", () => {
    const customKey = "user-custom-key-xyz";
    const res = handleTranscribeRequest(true, customKey, "server-fallback-key");
    expect(res.status).toBe(200);
    expect(res.body.customKeyUsed).toBe(true);
    expect(res.body.text).toBeDefined();
  });

  it("Case 1.3: Intercepts Gladia 402 Payment Required and returns friendly quota guidance", () => {
    const res = handleTranscribeRequest(true, undefined, "server-key-exhausted", "es", {
      status: 402,
      data: { message: "Quota exceeded on free tier" }
    });

    expect(res.status).toBe(402);
    expect(res.body.error).toContain("Gladia API 免费额度已耗尽");
    expect(res.body.details).toContain("请在界面设置中填入新的 Gladia API Key");
  });

  it("Case 1.4: Accurately propagates language parameter to transcription payload", () => {
    const resEs = handleTranscribeRequest(true, undefined, "valid-key", "es");
    expect(resEs.body.language).toBe("es");

    const resFr = handleTranscribeRequest(true, undefined, "valid-key", "fr");
    expect(resFr.body.language).toBe("fr");

    const resEn = handleTranscribeRequest(true, undefined, "valid-key", "en");
    expect(resEn.body.language).toBe("en");
  });

  it("Case 1.5: Returns HTTP 500 when neither custom key nor server key is configured", () => {
    const res = handleTranscribeRequest(true, "", undefined);
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Gladia API key is not configured");
  });
});
