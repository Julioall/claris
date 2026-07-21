import { describe, expect, it, vi } from 'vitest';

import {
  ApiClientError,
  createEdgeFunctionClient,
  type EdgeFunctionClientDependencies,
} from '../edge-function-client';

function success<T>(data: T, correlationId = 'correlation-1') {
  return { data: { data, correlationId }, error: null };
}

function httpError(status: number, body: unknown) {
  return {
    data: null,
    error: {
      message: `HTTP ${status}`,
      context: Response.json(body, { status }),
    },
  };
}

function dependencies(overrides: Partial<EdgeFunctionClientDependencies> = {}): EdgeFunctionClientDependencies {
  return {
    createCorrelationId: () => 'correlation-1',
    getSession: vi.fn(async () => ({
      data: { session: { access_token: 'access-token-1' } },
      error: null,
    })),
    refreshSession: vi.fn(async () => ({
      data: { session: { access_token: 'access-token-2' } },
      error: null,
    })),
    invoke: vi.fn(async () => success({ ok: true })),
    ...overrides,
  };
}

describe('edgeFunctionClient', () => {
  it('unwraps a successful V1 response and sends contract headers', async () => {
    const deps = dependencies();
    const client = createEdgeFunctionClient(deps);

    await expect(client<{ ok: boolean }>('example', { body: { action: 'read' } }))
      .resolves.toEqual({ ok: true });
    expect(deps.invoke).toHaveBeenCalledWith('example', expect.objectContaining({
      body: { action: 'read' },
      headers: expect.objectContaining({
        Authorization: 'Bearer access-token-1',
        'x-claris-api-version': '1',
        'x-correlation-id': 'correlation-1',
      }),
    }));
  });

  it('maps a V1 functional error', async () => {
    const client = createEdgeFunctionClient(dependencies({
      invoke: vi.fn(async () => httpError(422, {
        error: {
          code: 'validation_failed',
          message: 'Invalid enabled',
          details: { field: 'enabled' },
          correlationId: 'server-correlation',
        },
      })),
    }));

    await expect(client('example')).rejects.toMatchObject({
      code: 'validation_failed',
      status: 422,
      correlationId: 'server-correlation',
      details: { field: 'enabled' },
    });
  });

  it('classifies errors without an HTTP response as network failures', async () => {
    const client = createEdgeFunctionClient(dependencies({
      invoke: vi.fn(async () => ({ data: null, error: { message: 'Failed to fetch' } })),
    }));

    await expect(client('example')).rejects.toMatchObject({ code: 'network_error' });
  });

  it('rejects invalid success payloads', async () => {
    const client = createEdgeFunctionClient(dependencies({
      invoke: vi.fn(async () => ({ data: { ok: true }, error: null })),
    }));

    await expect(client('example')).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('refreshes once and retries after a 401 response', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce(httpError(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(success({ ok: true }));
    const deps = dependencies({ invoke });
    const client = createEdgeFunctionClient(deps);

    await expect(client('example')).resolves.toEqual({ ok: true });
    expect(deps.refreshSession).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenNthCalledWith(2, 'example', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer access-token-2' }),
    }));
  });

  it('reports an expired session before invoking the endpoint', async () => {
    const deps = dependencies({
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: null }, error: new Error('invalid refresh') })),
    });
    const client = createEdgeFunctionClient(deps);

    await expect(client('example')).rejects.toMatchObject({ code: 'session_expired' });
    expect(deps.invoke).not.toHaveBeenCalled();
  });

  it('aborts requests that exceed the timeout', async () => {
    const client = createEdgeFunctionClient(dependencies({
      invoke: vi.fn((_name, options) => new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })),
    }));

    const promise = client('example', { timeoutMs: 5 });
    await expect(promise).rejects.toEqual(expect.objectContaining<ApiClientError>({ code: 'timeout' }));
  });
});
