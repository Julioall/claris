import { describe, expect, it } from 'vitest';

import {
  API_VERSION_HEADER,
  CORRELATION_ID_HEADER,
  isApiV1Request,
} from '../../../../supabase/functions/_shared/http/contract.ts';
import {
  apiErrorResponse,
  apiSuccessResponse,
} from '../../../../supabase/functions/_shared/http/response.ts';

describe('Edge HTTP V1 contract', () => {
  it('detects opt-in V1 requests', () => {
    const v1Request = new Request('https://example.test', {
      headers: { [API_VERSION_HEADER]: '1' },
    });
    const legacyRequest = new Request('https://example.test');

    expect(isApiV1Request(v1Request)).toBe(true);
    expect(isApiV1Request(legacyRequest)).toBe(false);
  });

  it('wraps successful responses and propagates the correlation ID', async () => {
    const response = apiSuccessResponse({ enabled: true }, 'correlation-123');

    expect(response.status).toBe(200);
    expect(response.headers.get(API_VERSION_HEADER)).toBe('1');
    expect(response.headers.get(CORRELATION_ID_HEADER)).toBe('correlation-123');
    await expect(response.json()).resolves.toEqual({
      data: { enabled: true },
      correlationId: 'correlation-123',
    });
  });

  it('returns the standard error envelope', async () => {
    const response = apiErrorResponse(
      { code: 'validation_failed', message: 'Invalid enabled', details: { field: 'enabled' } },
      422,
      'correlation-456',
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'validation_failed',
        message: 'Invalid enabled',
        details: { field: 'enabled' },
        correlationId: 'correlation-456',
      },
    });
  });
});
