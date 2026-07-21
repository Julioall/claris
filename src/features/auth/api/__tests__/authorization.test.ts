import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: invokeMock,
}));

import { getAuthorizationContext } from '../authorization';

describe('authorization HTTP adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeMock.mockResolvedValue({
      contractVersion: 1,
      isAdmin: false,
      group: null,
      permissions: [],
    });
  });

  it('loads the authenticated actor context without browser-controlled identity', async () => {
    await getAuthorizationContext();

    expect(invokeMock).toHaveBeenCalledWith('access-control', {
      body: { action: 'get_context' },
    });
    expect(JSON.stringify(invokeMock.mock.calls[0])).not.toMatch(/actor|userId|user_id/i);
  });
});
