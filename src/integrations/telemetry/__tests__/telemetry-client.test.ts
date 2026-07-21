import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeEdgeFunctionMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: invokeEdgeFunctionMock,
}));

import { telemetryClient } from '../telemetry-client';

describe('telemetryClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeEdgeFunctionMock.mockResolvedValue({ accepted: true });
  });

  it('tracks usage through the authenticated telemetry endpoint', async () => {
    await expect(telemetryClient.trackUsage({
      eventType: 'page_view',
      route: '/dashboard',
      resource: 'course-1',
      metadata: { source: 'menu' },
    })).resolves.toBeUndefined();

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('app-telemetry', {
      auth: 'required',
      timeoutMs: 2_000,
      body: {
        action: 'track_usage',
        eventType: 'page_view',
        route: '/dashboard',
        resource: 'course-1',
        metadata: { source: 'menu' },
      },
    });
  });

  it('logs errors using stable defaults', async () => {
    await expect(telemetryClient.logError({
      message: 'Falha ao carregar',
      payload: { code: 'network_error' },
    })).resolves.toBeUndefined();

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('app-telemetry', {
      auth: 'required',
      timeoutMs: 2_000,
      body: {
        action: 'log_error',
        severity: 'error',
        category: 'ui',
        message: 'Falha ao carregar',
        payload: { code: 'network_error' },
        context: {},
      },
    });
  });

  it('keeps telemetry failures best-effort for every operation', async () => {
    invokeEdgeFunctionMock.mockRejectedValue(new Error('offline'));

    await expect(telemetryClient.trackUsage({ eventType: 'login' })).resolves.toBeUndefined();
    await expect(telemetryClient.logError({ message: 'offline' })).resolves.toBeUndefined();
    expect(invokeEdgeFunctionMock).toHaveBeenCalledTimes(2);
  });
});
