import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseClarisSuggestionsPayload } from '../../../../supabase/functions/claris-suggestions/payload.ts';
import type { ClarisSuggestionsRepository } from '../../../../supabase/functions/claris-suggestions/repository.ts';
import {
  authorizeClarisSuggestions,
  executeClarisSuggestions,
} from '../../../../supabase/functions/claris-suggestions/service.ts';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const SUGGESTION_ID = '22222222-2222-4222-8222-222222222222';

function suggestion() {
  return {
    actionType: 'create_task' as const,
    analysis: 'Risco elevado',
    body: 'Sem contato recente.',
    entityId: 'student-1',
    entityName: 'Ana Silva',
    entityType: 'student',
    expectedImpact: 'Melhoria no engajamento',
    expiresAt: null,
    id: SUGGESTION_ID,
    priority: 'high' as const,
    reason: '30 dias sem contato',
    status: 'pending' as const,
    suggestedAt: '2026-07-21T12:00:00.000Z',
    title: 'Retomar contato',
    triggerEngine: 'communication' as const,
    type: 'interrupted_contact' as const,
  };
}

function createRepository(): ClarisSuggestionsRepository {
  return {
    act: vi.fn(async (_actor, id, outcome) => ({
      actionType: 'create_task',
      createdEntityId: outcome === 'accepted' ? '33333333-3333-4333-8333-333333333333' : null,
      effect: outcome === 'accepted' ? 'task_created' : 'none',
      kind: 'succeeded',
      status: outcome,
      suggestionId: id,
    })),
    listPending: vi.fn(async () => [suggestion()]),
    userCanUseClaris: vi.fn(async () => true),
  };
}

describe('claris-suggestions V1 contract', () => {
  let repository: ClarisSuggestionsRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it('accepts only bounded intent fields and rejects browser identity', () => {
    expect(parseClarisSuggestionsPayload({ action: 'list_pending' })).toEqual({
      action: 'list_pending',
      limit: 10,
    });
    expect(parseClarisSuggestionsPayload({ action: 'accept', suggestionId: SUGGESTION_ID })).toEqual({
      action: 'accept',
      suggestionId: SUGGESTION_ID,
    });

    for (const payload of [
      { action: 'list_pending', limit: 31 },
      { action: 'list_pending', userId: ACTOR_ID },
      { action: 'accept', suggestionId: 'invalid' },
      { action: 'dismiss', suggestionId: SUGGESTION_ID, triggerKey: 'spoof' },
    ]) {
      expect(() => parseClarisSuggestionsPayload(payload)).toThrowError(
        expect.objectContaining({ status: 422 }),
      );
    }
  });

  it('authorizes and derives actor scope in the repository calls', async () => {
    await expect(authorizeClarisSuggestions(repository, ACTOR_ID)).resolves.toBe(true);
    await expect(executeClarisSuggestions(repository, ACTOR_ID, {
      action: 'list_pending',
      limit: 10,
    })).resolves.toEqual({ contractVersion: 1, items: [suggestion()] });

    expect(repository.userCanUseClaris).toHaveBeenCalledWith(ACTOR_ID);
    expect(repository.listPending).toHaveBeenCalledWith(ACTOR_ID, 10);
  });

  it('returns the atomic effect produced by the backend command', async () => {
    await expect(executeClarisSuggestions(repository, ACTOR_ID, {
      action: 'accept',
      suggestionId: SUGGESTION_ID,
    })).resolves.toMatchObject({
      contractVersion: 1,
      effect: 'task_created',
      status: 'accepted',
      suggestionId: SUGGESTION_ID,
    });

    expect(repository.act).toHaveBeenCalledWith(ACTOR_ID, SUGGESTION_ID, 'accepted');
  });

  it('maps actor-scope misses and stale commands to stable HTTP errors', async () => {
    vi.mocked(repository.act)
      .mockResolvedValueOnce({ kind: 'not_found' })
      .mockResolvedValueOnce({ kind: 'not_actionable' })
      .mockResolvedValueOnce({ kind: 'invalid_action_payload' });

    const payload = { action: 'accept' as const, suggestionId: SUGGESTION_ID };
    await expect(executeClarisSuggestions(repository, ACTOR_ID, payload))
      .rejects.toMatchObject({ code: 'not_found', status: 404 });
    await expect(executeClarisSuggestions(repository, ACTOR_ID, payload))
      .rejects.toMatchObject({ code: 'conflict', status: 409 });
    await expect(executeClarisSuggestions(repository, ACTOR_ID, payload))
      .rejects.toMatchObject({ code: 'conflict', status: 409 });
  });
});
