import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createClarisConversation,
  deleteClarisConversation,
  fetchClarisConversations,
  updateClarisConversation,
} from '@/features/claris/api/conversations';

const invokeEdgeFunctionMock = vi.fn();

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: (...args: unknown[]) => invokeEdgeFunctionMock(...args),
}));

const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const dto = {
  id: CONVERSATION_ID,
  lastContextRoute: '/alunos',
  messages: [{ content: 'Ola', role: 'user' }],
  title: 'Acompanhamento',
  updatedAt: '2026-07-21T12:00:00.000Z',
};

describe('Claris conversations HTTP client', () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
  });

  it('lists actor-scoped DTOs without sending browser identity', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({ contractVersion: 1, items: [dto] });

    await expect(fetchClarisConversations()).resolves.toEqual([dto]);
    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('claris-conversations', {
      body: { action: 'list', limit: 30 },
    });
  });

  it('sends intent-only create, update and delete commands', async () => {
    invokeEdgeFunctionMock
      .mockResolvedValueOnce({ contractVersion: 1, conversation: dto })
      .mockResolvedValueOnce({ contractVersion: 1, conversation: { ...dto, title: 'Novo titulo' } })
      .mockResolvedValueOnce({ contractVersion: 1, deleted: true });

    await createClarisConversation('Acompanhamento', dto.messages, '/alunos');
    await updateClarisConversation(CONVERSATION_ID, { title: 'Novo titulo' });
    await deleteClarisConversation(CONVERSATION_ID);

    expect(invokeEdgeFunctionMock.mock.calls.map(([, options]) => options.body)).toEqual([
      {
        action: 'create',
        lastContextRoute: '/alunos',
        messages: dto.messages,
        title: 'Acompanhamento',
      },
      { action: 'update', conversationId: CONVERSATION_ID, title: 'Novo titulo' },
      { action: 'delete', conversationId: CONVERSATION_ID },
    ]);
  });

  it('rejects incompatible persistence-shaped responses', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({
      contractVersion: 1,
      items: [{ id: CONVERSATION_ID, messages: [], title: 'x', updated_at: '2026-07-21' }],
    });

    await expect(fetchClarisConversations()).rejects.toThrow(/resposta invalida/i);
  });
});
