import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  listBulkSendAudienceForUser,
  startBulkMessageSend,
} from '@/features/messages/api/bulk-messaging.repository';

const { invokeEdgeFunctionMock } = vi.hoisted(() => ({
  invokeEdgeFunctionMock: vi.fn(),
}));

vi.mock('@/integrations/http/edge-function-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/integrations/http/edge-function-client')>();
  return {
    ...original,
    invokeEdgeFunction: (...args: unknown[]) => invokeEdgeFunctionMock(...args),
  };
});

const metadata = {
  contractVersion: 1,
  generatedAt: '2026-07-21T12:00:00.000Z',
};

const input = {
  messageContent: '  Aviso importante  ',
  moodleUrl: 'https://moodle.example.com',
  moodleToken: 'token-123',
  recipients: [
    {
      studentId: '11111111-1111-4111-8111-111111111111',
      moodleUserId: 'moodle-1',
      studentName: 'Aluno 1',
      personalizedMessage: 'Aviso importante',
    },
  ],
};

describe('bulk messaging repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envia somente a selecao autorizavel e mapeia duplicidade', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      kind: 'duplicate',
      jobId: 'job-duplicate',
      metadata,
    });

    await expect(startBulkMessageSend(input)).resolves.toEqual({
      kind: 'duplicate',
      jobId: 'job-duplicate',
    });

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('bulk-message-send', {
      auth: 'required',
      body: {
        action: 'start_send',
        messageContent: 'Aviso importante',
        moodleUrl: 'https://moodle.example.com',
        origin: 'manual',
        recipients: [
          {
            personalizedMessage: 'Aviso importante',
            studentId: '11111111-1111-4111-8111-111111111111',
          },
        ],
        token: 'token-123',
      },
      timeoutMs: 120_000,
    });

    const request = invokeEdgeFunctionMock.mock.calls[0][1];
    expect(JSON.stringify(request)).not.toContain('moodleUserId');
    expect(JSON.stringify(request)).not.toContain('studentName');
    expect(JSON.stringify(request)).not.toContain('userId');
  });

  it('retorna job iniciado quando a API aceita o envio', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      kind: 'started',
      jobId: 'job-started',
      sent: 1,
      failed: 0,
      status: 'completed',
      metadata,
    });

    await expect(startBulkMessageSend(input)).resolves.toEqual({
      kind: 'started',
      jobId: 'job-started',
    });
  });

  it('carrega e converte a audiencia resolvida pelo backend', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      students: [{
        id: '11111111-1111-4111-8111-111111111111',
        fullName: 'Aluno 1',
        email: 'aluno@example.com',
        avatarUrl: null,
        moodleUserId: 'moodle-1',
        currentRiskLevel: 'normal',
        lastAccess: null,
        enrollmentStatus: 'ativo',
        courses: [{
          courseId: 'course-1',
          courseName: 'Curso 1',
          category: 'Categoria',
          startDate: null,
          lastAccess: null,
          enrollmentStatus: 'ativo',
        }],
      }],
      gradeLookup: {
        '11111111-1111-4111-8111-111111111111:course-1': {
          gradeFormatted: '8,0',
          gradePercentage: 80,
        },
      },
      pendingLookup: {
        '11111111-1111-4111-8111-111111111111:course-1': 2,
      },
      metadata,
    });

    const result = await listBulkSendAudienceForUser();

    expect(result.students[0]).toMatchObject({
      full_name: 'Aluno 1',
      moodle_user_id: 'moodle-1',
      courses: [{ course_id: 'course-1', course_name: 'Curso 1' }],
    });
    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('bulk-message-audience', {
      auth: 'required',
      body: { action: 'get_audience' },
      timeoutMs: 20_000,
    });
  });
});
