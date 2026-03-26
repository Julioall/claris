import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startBulkMessageSend } from '@/features/messages/api/bulk-messaging.repository';

const invokeMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

const input = {
  userId: 'user-1',
  messageContent: '  Aviso importante  ',
  moodleUrl: 'https://moodle.example.com',
  moodleToken: 'token-123',
  recipients: [
    {
      studentId: 'student-1',
      moodleUserId: 'moodle-1',
      studentName: 'Aluno 1',
      personalizedMessage: 'Aviso importante',
    },
  ],
};

describe('startBulkMessageSend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invoca a edge function e mapeia resposta de duplicidade', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { kind: 'duplicate', jobId: 'job-duplicate' },
      error: null,
    });

    await expect(startBulkMessageSend(input)).resolves.toEqual({
      kind: 'duplicate',
      jobId: 'job-duplicate',
    });

    expect(invokeMock).toHaveBeenCalledWith('bulk-message-send', {
      body: {
        message_content: 'Aviso importante',
        moodleUrl: 'https://moodle.example.com',
        origin: 'manual',
        recipients: [
          {
            moodle_user_id: 'moodle-1',
            personalized_message: 'Aviso importante',
            student_id: 'student-1',
            student_name: 'Aluno 1',
          },
        ],
        token: 'token-123',
      },
    });
  });

  it('retorna job iniciado quando a edge function aceita o envio', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { kind: 'started', jobId: 'job-started' },
      error: null,
    });

    await expect(startBulkMessageSend(input)).resolves.toEqual({
      kind: 'started',
      jobId: 'job-started',
    });
  });
});
