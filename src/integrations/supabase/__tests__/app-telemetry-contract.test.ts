import { describe, expect, it, vi } from 'vitest';

import {
  APP_TELEMETRY_MAX_BODY_BYTES,
} from '../../../../supabase/functions/app-telemetry/contract.ts';
import {
  parseAppTelemetryPayload,
} from '../../../../supabase/functions/app-telemetry/payload.ts';
import type {
  AppTelemetryRepository,
} from '../../../../supabase/functions/app-telemetry/repository.ts';
import {
  recordAppTelemetry,
} from '../../../../supabase/functions/app-telemetry/service.ts';

function repository(): AppTelemetryRepository {
  return {
    insertErrorLog: vi.fn(async () => undefined),
    insertUsageEvent: vi.fn(async () => undefined),
  };
}

describe('app-telemetry contract', () => {
  it('defines a bounded body and parses a usage event with stable defaults', () => {
    expect(APP_TELEMETRY_MAX_BODY_BYTES).toBe(64 * 1024);
    expect(parseAppTelemetryPayload({
      action: 'track_usage',
      eventType: 'sync_finish',
      route: '/courses',
    })).toEqual({
      action: 'track_usage',
      eventType: 'sync_finish',
      metadata: {},
      resource: undefined,
      route: '/courses',
    });
  });

  it('parses an error log and applies contract defaults', () => {
    expect(parseAppTelemetryPayload({
      action: 'log_error',
      message: 'Moodle request failed',
      payload: { status: 503 },
    })).toEqual({
      action: 'log_error',
      category: 'ui',
      context: {},
      message: 'Moodle request failed',
      payload: { status: 503 },
      severity: 'error',
    });
  });

  it.each([
    { action: 'unknown', eventType: 'event' },
    { action: 'track_usage', eventType: '' },
    { action: 'track_usage', eventType: 'x'.repeat(129) },
    { action: 'log_error', message: 'error', severity: 'fatal' },
    { action: 'log_error', message: 'error', category: 'database' },
    { action: 'log_error', message: 'x'.repeat(4097) },
    { action: 'track_usage', eventType: 'event', metadata: { value: 'x'.repeat(4097) } },
    { action: 'track_usage', eventType: 'event', userId: 'spoofed-user' },
    { action: 'track_usage', eventType: 'event', user_id: 'spoofed-user' },
  ])('rejects invalid or identity-bearing payloads', (payload) => {
    expect(() => parseAppTelemetryPayload(payload)).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });

  it('rejects excessively deep structured attributes', () => {
    const metadata: Record<string, unknown> = {};
    let cursor = metadata;
    for (let depth = 0; depth < 7; depth += 1) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }

    expect(() => parseAppTelemetryPayload({
      action: 'track_usage',
      eventType: 'event',
      metadata,
    })).toThrowError(expect.objectContaining({ status: 422 }));
  });

  it('persists usage with the authenticated identity and redacts secrets recursively', async () => {
    const repo = repository();
    const result = await recordAppTelemetry(repo, 'authenticated-user', parseAppTelemetryPayload({
      action: 'track_usage',
      eventType: 'sync_start',
      metadata: {
        courseCount: 2,
        accessToken: 'access-secret',
        nested: {
          api_key: 'api-secret',
          labels: [{ password: 'password-secret', visible: 'ok' }],
        },
      },
      resource: 'course-1',
    }));

    expect(result).toEqual({ recorded: true });
    expect(repo.insertUsageEvent).toHaveBeenCalledWith({
      eventType: 'sync_start',
      metadata: {
        courseCount: 2,
        accessToken: '[REDACTED]',
        nested: {
          api_key: '[REDACTED]',
          labels: [{ password: '[REDACTED]', visible: 'ok' }],
        },
      },
      resource: 'course-1',
      route: null,
      userId: 'authenticated-user',
    });
  });

  it('persists error defaults, context and payload without exposing sensitive values', async () => {
    const repo = repository();
    await recordAppTelemetry(repo, 'authenticated-user', parseAppTelemetryPayload({
      action: 'log_error',
      message: 'Request failed',
      category: 'integration',
      context: { route: '/messages', authorization: 'Bearer secret' },
      payload: { status: 500, clientSecret: 'secret' },
    }));

    expect(repo.insertErrorLog).toHaveBeenCalledWith({
      category: 'integration',
      context: { route: '/messages', authorization: '[REDACTED]' },
      message: 'Request failed',
      payload: { status: 500, clientSecret: '[REDACTED]' },
      severity: 'error',
      userId: 'authenticated-user',
    });
  });

  it('propagates persistence errors for the shared HTTP runtime to map safely', async () => {
    const persistenceError = new Error('database details');
    const repo = repository();
    vi.mocked(repo.insertUsageEvent).mockRejectedValueOnce(persistenceError);

    await expect(recordAppTelemetry(repo, 'authenticated-user', parseAppTelemetryPayload({
      action: 'track_usage',
      eventType: 'event',
    }))).rejects.toBe(persistenceError);
  });
});
