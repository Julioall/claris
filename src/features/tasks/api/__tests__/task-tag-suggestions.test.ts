import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeEdgeFunctionMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: invokeEdgeFunctionMock,
}));

import { searchTaskTagSuggestions } from '../task-tag-suggestions';

describe('searchTaskTagSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeEdgeFunctionMock.mockResolvedValue({
      items: [{
        entityId: 'student-1',
        entityType: 'aluno',
        label: 'Ana',
        prefix: 'aluno',
      }],
    });
  });

  it('uses the versioned Edge Function client without sending identity or course scope', async () => {
    const controller = new AbortController();
    await expect(searchTaskTagSuggestions('aluno', 'Ana', controller.signal)).resolves.toEqual([
      expect.objectContaining({ entityId: 'student-1', label: 'Ana' }),
    ]);

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('task-tag-suggestions', {
      auth: 'required',
      body: {
        action: 'search_suggestions',
        prefix: 'aluno',
        query: 'Ana',
      },
      signal: controller.signal,
      timeoutMs: 8_000,
    });
  });
});
