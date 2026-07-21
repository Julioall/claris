import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseBulkMessageAudiencePayload } from '../../../../supabase/functions/bulk-message-audience/payload.ts';
import type { BulkMessageAudienceRepository } from '../../../../supabase/functions/bulk-message-audience/repository.ts';
import {
  authorizeBulkMessageAudience,
  executeBulkMessageAudience,
} from '../../../../supabase/functions/bulk-message-audience/service.ts';
import { parseBulkMessageSendPayload } from '../../../../supabase/functions/bulk-message-send/payload.ts';
import { parseCampaignsPayload } from '../../../../supabase/functions/campaigns/payload.ts';
import type {
  CampaignsRepository,
  ScheduledMessageWriteRecord,
} from '../../../../supabase/functions/campaigns/repository.ts';
import { executeCampaigns } from '../../../../supabase/functions/campaigns/service.ts';
import type { ScheduledMessageDto } from '../../../../supabase/functions/campaigns/contract.ts';
import { parseMessageTemplatesPayload } from '../../../../supabase/functions/message-templates/payload.ts';
import type {
  MessageTemplateRecord,
  MessageTemplatesRepository,
} from '../../../../supabase/functions/message-templates/repository.ts';
import { executeMessageTemplates } from '../../../../supabase/functions/message-templates/service.ts';
import { parseWhatsAppMessagingPayload } from '../../../../supabase/functions/whatsapp-messaging/payload.ts';
import { toWhatsAppApiResponse } from '../../../../supabase/functions/whatsapp-messaging/response.ts';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';

const template: MessageTemplateRecord = {
  category: 'geral',
  content: 'Conteudo',
  createdAt: '2026-07-21T10:00:00.000Z',
  defaultKey: null,
  id: MESSAGE_ID,
  isDefault: false,
  isFavorite: false,
  title: 'Modelo',
  updatedAt: '2026-07-21T10:00:00.000Z',
};

const scheduledMessage: ScheduledMessageDto = {
  channel: 'moodle',
  completedAt: null,
  createdAt: '2026-07-21T10:00:00.000Z',
  errorMessage: null,
  executedBulkJobId: null,
  executionAttempts: 0,
  executionContext: {},
  failedCount: 0,
  id: MESSAGE_ID,
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

function messageTemplatesRepository(): MessageTemplatesRepository {
  return {
    create: vi.fn(async (_actorId, input) => ({ ...template, ...input })),
    delete: vi.fn(async () => true),
    ensureDefaults: vi.fn(async () => undefined),
    list: vi.fn(async () => [template]),
    setFavorite: vi.fn(async (_actorId, _templateId, isFavorite) => ({ ...template, isFavorite })),
    update: vi.fn(async (_actorId, _templateId, input) => ({ ...template, ...input })),
    userHasPermission: vi.fn(async () => true),
  };
}

function campaignsRepository(): CampaignsRepository {
  return {
    createScheduledMessage: vi.fn(async (_actorId, input) => ({
      ...scheduledMessage,
      executionContext: input.executionContext as Record<string, unknown>,
      recipientCount: input.recipientCount,
    })),
    deleteScheduledMessage: vi.fn(async () => true),
    findBulkJob: vi.fn(async () => null),
    findScheduledMessage: vi.fn(async () => scheduledMessage),
    isTemplateOwned: vi.fn(async () => true),
    isWhatsappInstanceAccessible: vi.fn(async () => true),
    listBulkJobRecipients: vi.fn(async () => ({ items: [], totalCount: 0 })),
    listBulkJobs: vi.fn(async () => ({ items: [], totalCount: 0 })),
    listScheduledMessages: vi.fn(async () => ({ items: [scheduledMessage], totalCount: 1 })),
    resolveRecipients: vi.fn(async () => [{
      moodleUserId: 'moodle-authoritative',
      personalizedMessage: 'Ola',
      studentId: STUDENT_ID,
      studentName: 'Nome do backend',
    }]),
    transitionScheduledMessage: vi.fn(async (input) => ({
      ...scheduledMessage,
      status: input.nextStatus,
    })),
    updateScheduledMessage: vi.fn(async (_actorId, _messageId, input) => ({
      ...scheduledMessage,
      executionContext: input.executionContext as Record<string, unknown>,
    })),
    userHasPermission: vi.fn(async () => true),
  };
}

describe('communications backend contracts', () => {
  let templates: MessageTemplatesRepository;
  let campaigns: CampaignsRepository;

  beforeEach(() => {
    templates = messageTemplatesRepository();
    campaigns = campaignsRepository();
  });

  it.each([
    () => parseMessageTemplatesPayload({ action: 'list_templates', userId: ACTOR_ID }),
    () => parseBulkMessageAudiencePayload({ action: 'get_audience', userId: ACTOR_ID }),
    () => parseBulkMessageSendPayload({
      action: 'start_send',
      messageContent: 'Aviso',
      moodleUrl: 'https://moodle.example.com',
      recipients: [{
        studentId: STUDENT_ID,
        studentName: 'Nome controlado',
        moodleUserId: 'moodle-controlado',
      }],
      token: 'token',
    }),
    () => parseCampaignsPayload({
      action: 'list_bulk_jobs',
      filters: {},
      order: 'createdAtDesc',
      page: 1,
      pageSize: 30,
      userId: ACTOR_ID,
    }),
    () => parseWhatsAppMessagingPayload({ action: 'get_contacts', instance_id: MESSAGE_ID }),
    () => parseWhatsAppMessagingPayload({ action: 'list_instances', userId: ACTOR_ID }),
  ])('rejects browser-controlled identity and persistence field names', (parse) => {
    expect(parse).toThrowError(expect.objectContaining({ status: 422 }));
  });

  it('seeds templates on the server and always scopes operations to the actor', async () => {
    const result = await executeMessageTemplates(
      templates,
      ACTOR_ID,
      parseMessageTemplatesPayload({ action: 'list_templates' }),
    );
    expect(templates.ensureDefaults).toHaveBeenCalledWith(ACTOR_ID);
    expect(templates.list).toHaveBeenCalledWith(ACTOR_ID, false);
    expect(result).toMatchObject({ items: [{ id: MESSAGE_ID }], metadata: { contractVersion: 1 } });
  });

  it('resolves the audience with the authenticated actor and permission', async () => {
    const repository: BulkMessageAudienceRepository = {
      listAudience: vi.fn(async () => ({ gradeLookup: {}, pendingLookup: {}, students: [] })),
      userHasPermission: vi.fn(async () => true),
    };
    const payload = parseBulkMessageAudiencePayload({ action: 'get_audience' });
    await expect(authorizeBulkMessageAudience(repository, ACTOR_ID, payload)).resolves.toBe(true);
    await expect(executeBulkMessageAudience(repository, ACTOR_ID, payload)).resolves.toMatchObject({
      metadata: { contractVersion: 1 },
    });
    expect(repository.userHasPermission).toHaveBeenCalledWith(ACTOR_ID, 'messages.bulk_send');
    expect(repository.listAudience).toHaveBeenCalledWith(ACTOR_ID);
  });

  it('recalculates Moodle recipients and persists only the authoritative snapshot', async () => {
    const payload = parseCampaignsPayload({
      action: 'create_scheduled_message',
      input: {
        channel: 'moodle',
        messageContent: 'Aviso',
        moodleUrl: 'https://moodle.example.com',
        schedule: { type: 'specific_date' },
        scheduledAt: '2026-07-22T10:00:00.000Z',
        selectedRecipients: [{ personalizedMessage: 'Ola', studentId: STUDENT_ID }],
        title: 'Campanha',
      },
    });

    const result = await executeCampaigns(campaigns, ACTOR_ID, payload);
    expect(campaigns.resolveRecipients).toHaveBeenCalledWith(ACTOR_ID, [{
      personalizedMessage: 'Ola',
      studentId: STUDENT_ID,
    }]);
    const write = vi.mocked(campaigns.createScheduledMessage).mock.calls[0][1] as ScheduledMessageWriteRecord;
    expect(write.recipientCount).toBe(1);
    expect(write.executionContext).toMatchObject({
      recipient_snapshot: [{
        moodle_user_id: 'moodle-authoritative',
        student_name: 'Nome do backend',
      }],
    });
    expect(result).toMatchObject({ message: { recipientCount: 1 } });
  });

  it('enforces the scheduled campaign state machine', async () => {
    await expect(executeCampaigns(campaigns, ACTOR_ID, {
      action: 'transition_scheduled_message',
      messageId: MESSAGE_ID,
      transition: 'pause',
    })).resolves.toMatchObject({ message: { status: 'paused' } });

    vi.mocked(campaigns.findScheduledMessage).mockResolvedValue({
      ...scheduledMessage,
      status: 'sent',
    });
    await expect(executeCampaigns(campaigns, ACTOR_ID, {
      action: 'transition_scheduled_message',
      messageId: MESSAGE_ID,
      transition: 'pause',
    })).rejects.toMatchObject({ code: 'conflict', status: 409 });
  });

  it('wraps WhatsApp data in V1, camelCases fields and omits provider internals', async () => {
    const response = await toWhatsAppApiResponse(Response.json({
      message: {
        id: 'message-1',
        remote_jid: '5511999999999@s.whatsapp.net',
        text: 'Ola',
      },
      result: { provider_secret: 'must-not-leak' },
    }), 'send_message', 'correlation-whatsapp');

    const body = await response.json();
    expect(body).toMatchObject({
      correlationId: 'correlation-whatsapp',
      data: {
        message: { remoteJid: '5511999999999@s.whatsapp.net' },
        metadata: { contractVersion: 1 },
      },
    });
    expect(JSON.stringify(body)).not.toContain('result');
    expect(JSON.stringify(body)).not.toContain('provider_secret');
    expect(JSON.stringify(body)).not.toContain('remote_jid');
  });
});
