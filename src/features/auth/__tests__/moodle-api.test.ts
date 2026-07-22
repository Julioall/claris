import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeLegacyMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  ApiClientError: class ApiClientError extends Error {},
  invokeLegacyEdgeFunction: invokeLegacyMock,
}));

import { invokeMoodleFunctionWithTimeout } from '@/features/auth/infrastructure/moodle-api';

describe('legacy Moodle operation adapter', () => {
  beforeEach(() => invokeLegacyMock.mockReset());

  it('delegates authenticated operation calls without implementing Moodle login', async () => {
    invokeLegacyMock.mockResolvedValue({ activitiesCount: 3 });
    await expect(invokeMoodleFunctionWithTimeout({
      functionName: 'moodle-grade-suggestions',
      body: { connectionId: 'connection-1', courseId: 42 },
      timeoutMs: 1000,
    })).resolves.toEqual({ data: { activitiesCount: 3 }, error: null });
    expect(invokeLegacyMock).toHaveBeenCalledWith('moodle-grade-suggestions', {
      body: { connectionId: 'connection-1', courseId: 42 },
      timeoutMs: 1000,
    });
  });

});
