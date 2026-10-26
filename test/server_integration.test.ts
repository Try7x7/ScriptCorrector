import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, getActiveUploadsCount, setActiveUploadsForTesting } from "../server";
import http from "http";

describe("Live Server Integration Tests (真实服务端端到端集成测试)", () => {
  let serverInstance: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Disable rate limiting during automated integration tests
    process.env.DISABLE_RATE_LIMIT = "true";
    // Ensure fallback key so local machines without GEMINI_API_KEY execute cleanly
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
      process.env.GEMINI_API_KEY = "dummy-test-gemini-api-key-for-local-runs";
    }

    // Start real server instance on ephemeral port (0)
    const { server, port } = await startServer(0);
    serverInstance = server;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (serverInstance) {
      await new Promise<void>((resolve) => serverInstance.close(() => resolve()));
    }
  });

  it("Case 1: GET /api/health returns 200 and sets required security headers", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty("status", "ok");
    expect(json).toHaveProperty("timestamp");

    // Verify critical security response headers
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("Case 2: 404 handler returns clean JSON error for undefined /api routes", async () => {
    const res = await fetch(`${baseUrl}/api/non_existent_endpoint`);
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json).toHaveProperty("error");
    expect(json.error).toContain("API route not found");
  });

  it("Case 3: POST /api/correct rejects empty prompt with 400 Bad Request", async () => {
    const res = await fetch(`${baseUrl}/api/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "   " })
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Prompt is required");
  });

  it("Case 4: POST /api/correct rejects prompt exceeding 100,000 characters", async () => {
    const hugePrompt = "a".repeat(100005);
    const res = await fetch(`${baseUrl}/api/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: hugePrompt })
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.errorCode).toBe("HTTP 400 / PAYLOAD_TOO_LARGE");
  });

  it("Case 5: POST /api/correct rejects systemInstruction exceeding 50,000 characters", async () => {
    const res = await fetch(`${baseUrl}/api/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Valid prompt",
        systemInstruction: "s".repeat(50005)
      })
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.errorCode).toBe("HTTP 400 / PAYLOAD_TOO_LARGE");
  });

  it("Case 6: POST /api/correct rejects unapproved model names with 400", async () => {
    const res = await fetch(`${baseUrl}/api/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Valid prompt",
        model: "malicious-arbitrary-model"
      })
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid model specified");
  });

  it("Case 7: GET /api/transcribe/status/:taskId rejects invalid taskId regex with 400", async () => {
    // Tests invalid task ID characters (dots, slashes, punctuation)
    const resTraversal = await fetch(`${baseUrl}/api/transcribe/status/invalid..traversal`);
    expect(resTraversal.status).toBe(400);
    const jsonTraversal = await resTraversal.json();
    expect(jsonTraversal.error).toContain("Invalid task ID format");

    const resSpecial = await fetch(`${baseUrl}/api/transcribe/status/invalid@task!`);
    expect(resSpecial.status).toBe(400);
    const jsonSpecial = await resSpecial.json();
    expect(jsonSpecial.error).toContain("Invalid task ID format");
  });

  it("Case 8: Cross-site protection blocks POST requests from untrusted external origins", async () => {
    const res = await fetch(`${baseUrl}/api/correct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Sec-Fetch-Site": "cross-site",
        "Origin": "https://malicious-website.xyz"
      },
      body: JSON.stringify({ prompt: "Hello world" })
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.errorCode).toBe("CROSS_SITE_REQUEST_FORBIDDEN");
  });

  it("Case 9: /api/transcribe enforces pre-upload concurrency limits (503 and Retry-After: 30)", async () => {
    try {
      // Simulate that active upload slots are exhausted
      setActiveUploadsForTesting(2);
      expect(getActiveUploadsCount()).toBe(2);

      const res = await fetch(`${baseUrl}/api/transcribe`, {
        method: "POST"
      });

      expect(res.status).toBe(503);
      expect(res.headers.get("retry-after")).toBe("30");
      const json = await res.json();
      expect(json.errorCode).toBe("CONCURRENT_UPLOADS_EXCEEDED");
    } finally {
      // Restore active uploads count to 0
      setActiveUploadsForTesting(0);
      expect(getActiveUploadsCount()).toBe(0);
    }
  });
});
