import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acceptClarisSuggestion,
  dismissClarisSuggestion,
  fetchPendingClarisSuggestions,
  generateClarisSuggestions,
} from '@/features/claris/api/suggestions';

const invokeEdgeFunctionMock = vi.fn();

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: (...args: unknown[]) => invokeEdgeFunctionMock(...args),
}));

const SUGGESTION_ID = '11111111-1111-4111-8111-111111111111';
const suggestion = {
  actionType: 'create_task',
  analysis: 'Risco elevado',
  body: 'Sem contato recente.',
  entityId: 'student-1',
  entityName: 'Ana Silva',
  entityType: 'student',
  expectedImpact: 'Melhoria no engajamento',
  expiresAt: null,
  id: SUGGESTION_ID,
  priority: 'high',
  reason: '30 dias sem contato',
  status: 'pending',
  suggestedAt: '2026-07-21T12:00:00.000Z',
  title: 'Retomar contato',
  triggerEngine: 'communication',
  type: 'interrupted_contact',
};

describe('Claris suggestions HTTP client', () => {
  beforeEach(() => invokeEdgeFunctionMock.mockReset());

  it('lists DTOs without exposing trigger or action payload internals', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({ contractVersion: 1, items: [suggestion] });

    await expect(fetchPendingClarisSuggestions()).resolves.toEqual([suggestion]);
    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('claris-suggestions', {
      body: { action: 'list_pending', limit: 10 },
    });
  });

  it('sends accept and dismiss intent with only the suggestion id', async () => {
    invokeEdgeFunctionMock
      .mockResolvedValueOnce({
        actionType: 'create_task',
        contractVersion: 1,
        createdEntityId: '22222222-2222-4222-8222-222222222222',
        effect: 'task_created',
        status: 'accepted',
        suggestionId: SUGGESTION_ID,
      })
      .mockResolvedValueOnce({
        actionType: 'create_task',
        contractVersion: 1,
        createdEntityId: null,
        effect: 'none',
        status: 'dismissed',
        suggestionId: SUGGESTION_ID,
      });

    await acceptClarisSuggestion(SUGGESTION_ID);
    await dismissClarisSuggestion(SUGGESTION_ID);

    expect(invokeEdgeFunctionMock.mock.calls.map(([, options]) => options.body)).toEqual([
      { action: 'accept', suggestionId: SUGGESTION_ID },
      { action: 'dismiss', suggestionId: SUGGESTION_ID },
    ]);
  });

  it('uses the versioned generation contract through the shared client', async () => {
    const response = {
      contractVersion: 1,
      details: {
        academic: 0,
        agenda: 1,
        communication: 2,
        operational: 0,
        platformUsage: 0,
        tasks: 1,
      },
      enginesRun: 6,
      suggestionsCreated: 4,
    };
    invokeEdgeFunctionMock.mockResolvedValue(response);

    await expect(generateClarisSuggestions()).resolves.toEqual(response);
    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith(
      'generate-proactive-suggestions',
      { body: {} },
    );
  });

  it('rejects persistence-shaped or incomplete responses', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({
      contractVersion: 1,
      items: [{ ...suggestion, expectedImpact: undefined, expected_impact: 'x' }],
    });

    await expect(fetchPendingClarisSuggestions()).rejects.toThrow(/resposta invalida/i);
  });
});
