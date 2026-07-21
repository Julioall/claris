import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createScheduledMessage,
  listBulkJobs,
  pauseScheduledMessage,
} from '@/features/campaigns/api/campaigns.repository';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@/integrations/http/edge-function-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/integrations/http/edge-function-client')>();
  return { ...original, invokeEdgeFunction: (...args: unknown[]) => invokeMock(...args) };
});

const metadata = { contractVersion: 1, generatedAt: '2026-07-21T10:00:00.000Z' };
const scheduled = {
  channel: 'moodle',
  completedAt: null,
  createdAt: '2026-07-21T10:00:00.000Z',
  errorMessage: null,
  executedBulkJobId: null,
  executionAttempts: 0,
  executionContext: {
    moodleUrl: 'https://moodle.example.com',
    recipientSnapshot: [{
      moodleUserId: 'moodle-server',
      personalizedMessage: 'Ola',
      studentId: '11111111-1111-4111-8111-111111111111',
      studentName: 'Aluno servidor',
    }],
    schedule: { type: 'specific_date' },
    schemaVersion: 3,
  },
  failedCount: 0,
  id: '22222222-2222-4222-8222-222222222222',
  lastExecutionAt: null,
  messageContent: 'Aviso',
  notes: null,
  origin: 'manual',
  recipientCount: 1,
  resultContext: null,
  scheduledAt: '2026-07-22T10:00:00.000Z',
  sentCount: 0,
  startedAt: null,
  status: 'pending',
  templateId: null,
  title: 'Campanha',
  updatedAt: '2026-07-21T10:00:00.000Z',
  whatsappInstanceId: null,
};

describe('campaigns repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses server pagination for bulk jobs', async () => {
    invokeMock.mockResolvedValueOnce({
      items: [],
      metadata,
      page: 2,
      pageSize: 25,
      totalCount: 0,
      totalPages: 0,
    });
    await listBulkJobs({ page: 2, pageSize: 25, search: ' aviso ' });
    expect(invokeMock).toHaveBeenCalledWith('campaigns', {
      auth: 'required',
      body: {
        action: 'list_bulk_jobs',
        filters: { search: 'aviso' },
        order: 'createdAtDesc',
        page: 2,
        pageSize: 25,
      },
      timeoutMs: 20_000,
    });
  });

  it('sends only recipient selection and maps the authoritative snapshot back to the view', async () => {
    invokeMock.mockResolvedValueOnce({ message: scheduled, metadata });
    const result = await createScheduledMessage({
      channel: 'moodle',
      execution_context: {
        moodle_url: 'https://moodle.example.com',
        recipient_snapshot: [{
          moodle_user_id: 'moodle-browser-must-not-be-sent',
          personalized_message: 'Ola',
          student_id: '11111111-1111-4111-8111-111111111111',
          student_name: 'Nome do browser must not be sent',
        }],
        schedule: { type: 'specific_date' },
      },
      message_content: 'Aviso',
      scheduled_at: '2026-07-22T10:00:00.000Z',
      title: 'Campanha',
    });

    const body = invokeMock.mock.calls[0][1].body;
    expect(body).toMatchObject({
      action: 'create_scheduled_message',
      input: {
        selectedRecipients: [{
          personalizedMessage: 'Ola',
          studentId: '11111111-1111-4111-8111-111111111111',
        }],
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/moodleUserId|studentName|userId/);
    expect(result.execution_context).toMatchObject({
      moodle_url: 'https://moodle.example.com',
      recipient_snapshot: [{
        moodle_user_id: 'moodle-server',
        student_name: 'Aluno servidor',
      }],
    });
  });

  it('uses an explicit backend transition instead of updating status in the browser', async () => {
    invokeMock.mockResolvedValueOnce({ message: { ...scheduled, status: 'paused' }, metadata });
    await pauseScheduledMessage(scheduled.id);
    expect(invokeMock.mock.calls[0][1].body).toEqual({
      action: 'transition_scheduled_message',
      messageId: scheduled.id,
      transition: 'pause',
    });
  });
});
