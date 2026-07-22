import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchMoodleConversations,
  fetchMoodleMessages,
  sendMoodleMessage,
} from '@/features/claris/api/moodle-messaging';

const invokeEdgeFunctionMock = vi.fn();
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: (...args: unknown[]) => invokeEdgeFunctionMock(...args),
}));

describe('Moodle messaging API client', () => {
  beforeEach(() => invokeEdgeFunctionMock.mockReset());

  it('uses credential-free camelCase requests', async () => {
    invokeEdgeFunctionMock
      .mockResolvedValueOnce({ contractVersion: 1, currentMoodleUserId: 10, items: [] })
      .mockResolvedValueOnce({
        contractVersion: 1,
        conversationId: null,
        currentMoodleUserId: 10,
        items: [],
      })
      .mockResolvedValueOnce({ contractVersion: 1, messageId: '99' });

    await fetchMoodleConversations(CONNECTION_ID);
    await fetchMoodleMessages(CONNECTION_ID, 20, 25);
    await sendMoodleMessage(CONNECTION_ID, 20, 'Ola');

    expect(invokeEdgeFunctionMock.mock.calls.map(([, options]) => options.body)).toEqual([
      { action: 'get_conversations', connectionId: CONNECTION_ID },
      { action: 'get_messages', connectionId: CONNECTION_ID, moodleUserId: 20, limit: 25 },
      { action: 'send_message', connectionId: CONNECTION_ID, moodleUserId: 20, message: 'Ola' },
    ]);
  });

  it('accepts a complete conversations DTO', async () => {
    const response = {
      contractVersion: 1,
      currentMoodleUserId: 10,
      items: [{
        id: 7,
        member: { id: 20, fullName: 'Ana', profileImageUrl: null },
        lastMessage: { text: 'Oi', createdAtUnix: 100 },
        studentId: 'student-1',
        unreadCount: 1,
      }],
    };
    invokeEdgeFunctionMock.mockResolvedValueOnce(response);

    await expect(fetchMoodleConversations(CONNECTION_ID)).resolves.toEqual(response);
  });

  it('rejects malformed responses at the frontend boundary', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      contractVersion: 1,
      conversationId: null,
      currentMoodleUserId: 10,
      items: [{ id: 1, text: 'sem campos normalizados' }],
    });

    await expect(fetchMoodleMessages(CONNECTION_ID, 20)).rejects.toThrow('resposta invalida');
  });
});
