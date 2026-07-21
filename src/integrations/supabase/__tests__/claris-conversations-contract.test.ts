import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseClarisConversationsPayload } from '../../../../supabase/functions/claris-conversations/payload.ts';
import type { ClarisConversationsRepository } from '../../../../supabase/functions/claris-conversations/repository.ts';
import {
  authorizeClarisConversations,
  executeClarisConversations,
} from '../../../../supabase/functions/claris-conversations/service.ts';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';

function conversation() {
  return {
    id: CONVERSATION_ID,
    lastContextRoute: '/alunos',
    messages: [{ content: 'Ola', role: 'user' as const }],
    title: 'Acompanhamento',
    updatedAt: '2026-07-21T12:00:00.000Z',
  };
}

function createRepository(): ClarisConversationsRepository {
  return {
    create: vi.fn(async () => conversation()),
    delete: vi.fn(async () => true),
    list: vi.fn(async () => [conversation()]),
    update: vi.fn(async () => conversation()),
    userCanUseClaris: vi.fn(async () => true),
  };
}

describe('claris-conversations V1 contract', () => {
  let repository: ClarisConversationsRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it('accepts only bounded conversation use-case fields', () => {
    expect(parseClarisConversationsPayload({ action: 'list' })).toEqual({ action: 'list', limit: 30 });
    expect(parseClarisConversationsPayload({
      action: 'create',
      lastContextRoute: '/alunos',
      messages: [{ role: 'user', content: 'Ola' }],
      title: 'Acompanhamento',
    })).toMatchObject({ action: 'create', title: 'Acompanhamento' });

    for (const payload of [
      { action: 'list', userId: ACTOR_ID },
      { action: 'update', conversation_id: CONVERSATION_ID, title: 'Novo titulo' },
      { action: 'update', conversationId: CONVERSATION_ID },
      { action: 'create', lastContextRoute: '/', messages: [{ role: 'system', content: 'x' }], title: 'x' },
      { action: 'list', limit: 51 },
    ]) {
      expect(() => parseClarisConversationsPayload(payload)).toThrowError(
        expect.objectContaining({ status: 422 }),
      );
    }
  });

  it('authorizes the actor with the Claris application permission', async () => {
    await expect(authorizeClarisConversations(repository, ACTOR_ID)).resolves.toBe(true);
    expect(repository.userCanUseClaris).toHaveBeenCalledWith(ACTOR_ID);
  });

  it('derives ownership from the authenticated actor for reads and writes', async () => {
    await expect(executeClarisConversations(repository, ACTOR_ID, {
      action: 'list',
      limit: 30,
    })).resolves.toEqual({ contractVersion: 1, items: [conversation()] });
    await expect(executeClarisConversations(repository, ACTOR_ID, {
      action: 'create',
      lastContextRoute: '/alunos',
      messages: [{ content: 'Ola', role: 'user' }],
      title: 'Acompanhamento',
    })).resolves.toEqual({ contractVersion: 1, conversation: conversation() });

    expect(repository.list).toHaveBeenCalledWith(ACTOR_ID, 30);
    expect(repository.create).toHaveBeenCalledWith(ACTOR_ID, expect.objectContaining({
      title: 'Acompanhamento',
    }));
  });

  it('returns an indistinguishable 404 for records outside the actor scope', async () => {
    vi.mocked(repository.update).mockResolvedValue(null);
    vi.mocked(repository.delete).mockResolvedValue(false);

    await expect(executeClarisConversations(repository, ACTOR_ID, {
      action: 'update',
      conversationId: CONVERSATION_ID,
      title: 'Novo titulo',
    })).rejects.toMatchObject({ code: 'not_found', status: 404 });
    await expect(executeClarisConversations(repository, ACTOR_ID, {
      action: 'delete',
      conversationId: CONVERSATION_ID,
    })).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });
});
