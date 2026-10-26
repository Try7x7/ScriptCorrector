import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, ApiError, waitForServer } from '../src/utils/apiClient';

describe('apiClient Network & Gateway Resilience (客户端网络与网关容错测试)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Case 2.1: Identifies 200 Starting Server HTML as CONTAINER_STARTING with zero quota consumed', async () => {
    const htmlBooting = '<!DOCTYPE html><html><body><h1>Starting server...</h1><p>Please wait while your application starts</p></body></html>';
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => htmlBooting,
    } as any);

    await expect(apiFetch('/api/correct')).rejects.toThrow(ApiError);
    try {
      await apiFetch('/api/correct');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ApiError);
      expect(e.info.errorCode).toBe('CONTAINER_STARTING');
      expect(e.info.quotaTip).toContain('消耗为 0');
    }
  });

  it('Case 2.2: Identifies 413 Gateway Payload Too Large HTML with zero quota consumed', async () => {
    const html413 = '<!DOCTYPE html><html><body><h1>413 Request Entity Too Large</h1></body></html>';
    global.fetch = vi.fn().mockResolvedValue({
      status: 413,
      ok: false,
      text: async () => html413,
    } as any);

    try {
      await apiFetch('/api/transcribe');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ApiError);
      expect(e.status).toBe(413);
      expect(e.info.errorCode).toBe('GATEWAY_PAYLOAD_TOO_LARGE');
      expect(e.info.quotaTip).toContain('未消耗任何语音识别或模型配额');
    }
  });

  it('Case 2.3: Identifies 504 Gateway Timeout HTML and warns about potential background queueing', async () => {
    const html504 = '<html><body><h1>504 Gateway Time-out</h1></body></html>';
    global.fetch = vi.fn().mockResolvedValue({
      status: 504,
      ok: false,
      text: async () => html504,
    } as any);

    try {
      await apiFetch('/api/transcribe');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ApiError);
      expect(e.status).toBe(504);
      expect(e.info.errorCode).toBe('GATEWAY_TIMEOUT');
      expect(e.info.quotaTip).toContain('可能已到达云端或在排队中');
    }
  });

  it('Case 2.4: Catches browser fetch TypeError as CLIENT_NETWORK_ERROR with zero quota consumed', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    try {
      await apiFetch('/api/correct');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ApiError);
      expect(e.info.errorCode).toBe('CLIENT_NETWORK_ERROR');
      expect(e.info.errorReason).toContain('网络连接中断');
      expect(e.info.quotaTip).toContain('未扣减任何额度');
    }
  });

  it('Case 2.5: waitForServer soft check returns true when server responds, false when timed out', async () => {
    // Attempt 1: fails, Attempt 2: succeeds
    let attempts = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts < 2) throw new TypeError('Failed to fetch');
      return {
        ok: true,
        json: async () => ({ status: 'ok' }),
      } as any;
    });

    const isReady = await waitForServer(undefined, 3);
    expect(isReady).toBe(true);

    // Completely failing endpoint should return false (soft fallback) instead of throwing
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const failedReady = await waitForServer(undefined, 2);
    expect(failedReady).toBe(false);
  });
});
