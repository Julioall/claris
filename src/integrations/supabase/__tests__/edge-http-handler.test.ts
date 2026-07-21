import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../../supabase/functions/_shared/http/api-error.ts';
import { API_VERSION_HEADER } from '../../../../supabase/functions/_shared/http/contract.ts';
import { createHandler } from '../../../../supabase/functions/_shared/http/handler.ts';

const V1_HEADERS = {
  [API_VERSION_HEADER]: '1',
  'content-type': 'application/json',
};

function options(overrides: Record<string, unknown> = {}) {
  return {
    createCorrelationId: () => 'generated-correlation',
    createLogger: () => ({ error: vi.fn(), info: vi.fn() }),
    ...overrides,
  };
}

describe('createHandler', () => {
  it('handles preflight without executing the use case', async () => {
    const useCase = vi.fn(async () => new Response());
    const handler = createHandler(useCase, options());

    const response = await handler(new Request('https://example.test', { method: 'OPTIONS' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('x-correlation-id')).toBe('generated-correlation');
    expect(useCase).not.toHaveBeenCalled();
  });

  it('returns a V1 error for malformed JSON', async () => {
    const handler = createHandler(async () => new Response(), options());
    const response = await handler(new Request('https://example.test', {
      method: 'POST',
      headers: V1_HEADERS,
      body: '{invalid',
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid_json', correlationId: 'generated-correlation' },
    });
  });

  it('returns 401 when authentication cannot resolve a user', async () => {
    const handler = createHandler(async () => new Response(), {
      ...options(),
      requireAuth: true,
      resolveUser: async () => null,
    });
    const response = await handler(new Request('https://example.test', { headers: V1_HEADERS }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('returns 403 when the authorization hook rejects the actor', async () => {
    const handler = createHandler(async () => new Response(), {
      ...options(),
      requireAuth: true,
      resolveUser: async () => ({ id: 'user-1' }),
      authorize: async () => false,
    });
    const response = await handler(new Request('https://example.test', { headers: V1_HEADERS }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'forbidden' } });
  });

  it.each([
    [ApiError.notFound(), 404, 'not_found'],
    [ApiError.conflict('Conflict'), 409, 'conflict'],
    [ApiError.unprocessable('Invalid'), 422, 'validation_failed'],
  ])('maps typed errors to their HTTP status', async (error, status, code) => {
    const handler = createHandler(async () => { throw error; }, options());
    const response = await handler(new Request('https://example.test', { headers: V1_HEADERS }));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  });

  it('propagates a safe incoming correlation ID to the context and response', async () => {
    const handler = createHandler(async ({ correlationId }) => (
      Response.json({ correlationId })
    ), options());
    const response = await handler(new Request('https://example.test', {
      headers: { 'x-correlation-id': 'incoming-123' },
    }));

    expect(response.headers.get('x-correlation-id')).toBe('incoming-123');
    await expect(response.json()).resolves.toEqual({ correlationId: 'incoming-123' });
  });

  it('does not expose unexpected error details', async () => {
    const loggerError = vi.fn();
    const handler = createHandler(async () => {
      throw new Error('database password leaked');
    }, options({ createLogger: () => ({ error: loggerError, info: vi.fn() }) }));
    const response = await handler(new Request('https://example.test', { headers: V1_HEADERS }));
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(body).toContain('Internal server error');
    expect(body).not.toContain('database password leaked');
    expect(loggerError).toHaveBeenCalledWith('unhandled_error', expect.any(Error));
  });
});
