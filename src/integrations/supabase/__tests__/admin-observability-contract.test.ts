import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  mapConversation,
  mapErrorLog,
} from '../../../../supabase/functions/admin-observability/mapper.ts';
import { parseAdminObservabilityPayload } from '../../../../supabase/functions/admin-observability/payload.ts';
import type {
  AdminConversationRow,
  AdminErrorLogRow,
  AdminObservabilityRepository,
  AdminUsageEventRow,
} from '../../../../supabase/functions/admin-observability/repository.ts';
import {
  executeAdminObservability,
  getAdminDashboardSummary,
} from '../../../../supabase/functions/admin-observability/service.ts';
import { mapSupportTicket } from '../../../../supabase/functions/support-tickets/mapper.ts';
import { parseSupportTicketsPayload } from '../../../../supabase/functions/support-tickets/payload.ts';
import type {
  SupportTicketRow,
  SupportTicketsRepository,
} from '../../../../supabase/functions/support-tickets/repository.ts';
import { executeSupportTickets } from '../../../../supabase/functions/support-tickets/service.ts';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const RECORD_ID = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-07-21T15:00:00.000Z';

const errorRow: AdminErrorLogRow = {
  id: RECORD_ID,
  user_id: ACTOR_ID,
  severity: 'error',
  category: 'integration',
  message: 'Request failed',
  payload: { authorization: 'Bearer secret', status: 500 },
  context: { nested: { apiKey: 'secret', visible: 'ok' } },
  resolved: false,
  resolved_at: null,
  resolved_by: null,
  created_at: NOW,
  updated_at: NOW,
};

const usageRow: AdminUsageEventRow = {
  id: RECORD_ID,
  user_id: ACTOR_ID,
  event_type: 'page_view',
  route: '/alunos',
  resource: null,
  metadata: {},
  created_at: NOW,
};

const conversationRow: AdminConversationRow = {
  id: RECORD_ID,
  user_id: ACTOR_ID,
  title: 'Acompanhamento',
  messages: Array.from({ length: 105 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `Mensagem ${index}`,
    internal: 'ignored',
  })),
  last_context_route: '/alunos',
  created_at: NOW,
  updated_at: NOW,
};

const ticketRow: SupportTicketRow = {
  id: RECORD_ID,
  user_id: ACTOR_ID,
  type: 'problema',
  title: 'Falha na tela',
  description: 'Nao foi possivel concluir.',
  route: '/alunos',
  context: { correlationId: 'corr', authorization: 'secret' },
  status: 'aberto',
  priority: 'normal',
  assigned_to: null,
  admin_notes: null,
  resolved_at: null,
  created_at: NOW,
  updated_at: NOW,
};

function observabilityRepository(): AdminObservabilityRepository {
  return {
    countDashboard: vi.fn(async () => ({
      clarisConversations: 4,
      openErrorLogs: 3,
      openSupportTickets: 2,
      usageEvents: 10,
      users: 5,
    })),
    isApplicationAdmin: vi.fn(async () => true),
    listConversations: vi.fn(async () => ({ rows: [conversationRow], totalCount: 1 })),
    listErrorLogs: vi.fn(async () => ({ rows: [errorRow], totalCount: 1 })),
    listRecentUsageEvents: vi.fn(async () => [
      { created_at: '2026-07-20T15:00:00.000Z' },
      { created_at: '2026-07-21T15:00:00.000Z' },
    ]),
    listUsageEvents: vi.fn(async () => ({ rows: [usageRow], totalCount: 1 })),
    resolveErrorLog: vi.fn(async (actorId, logId, resolvedAt) => ({
      ...errorRow,
      id: logId,
      resolved: true,
      resolved_at: resolvedAt,
      resolved_by: actorId,
    })),
  };
}

function supportRepository(): SupportTicketsRepository {
  return {
    createTicket: vi.fn(async (input) => ({
      ...ticketRow,
      user_id: input.actorId,
      type: input.type,
      title: input.title,
      description: input.description,
      route: input.route,
      context: input.context,
    })),
    isApplicationAdmin: vi.fn(async () => true),
    listTickets: vi.fn(async () => ({ rows: [ticketRow], totalCount: 1 })),
    updateTicket: vi.fn(async (input) => ({
      ...ticketRow,
      status: input.status,
      admin_notes: input.adminNotes,
      assigned_to: input.actorId,
      resolved_at: input.resolvedAt,
    })),
  };
}

describe('admin-observability backend contract', () => {
  it('accepts bounded intents and rejects browser identity or raw mutation fields', () => {
    expect(parseAdminObservabilityPayload({ action: 'get_dashboard' }))
      .toEqual({ action: 'get_dashboard' });
    expect(parseAdminObservabilityPayload({
      action: 'list_error_logs',
      page: 2,
      pageSize: 20,
      resolved: false,
    })).toMatchObject({ action: 'list_error_logs', page: 2, pageSize: 20, resolved: false });

    for (const payload of [
      { action: 'get_dashboard', userId: ACTOR_ID },
      { action: 'resolve_error_log', logId: RECORD_ID, resolvedBy: ACTOR_ID },
      { action: 'list_usage_events', pageSize: 201 },
      { action: 'list_error_logs', page: 1, dateFrom: '2026-07-22T00:00:00Z', dateTo: '2026-07-21T00:00:00Z' },
    ]) {
      expect(() => parseAdminObservabilityPayload(payload)).toThrowError(
        expect.objectContaining({ status: 422 }),
      );
    }
  });

  it('redacts structured secrets and exposes only bounded conversation messages', () => {
    expect(mapErrorLog(errorRow)).toMatchObject({
      payload: { authorization: '[REDACTED]', status: 500 },
      context: { nested: { apiKey: '[REDACTED]', visible: 'ok' } },
    });

    const conversation = mapConversation(conversationRow);
    expect(conversation.messageCount).toBe(105);
    expect(conversation.messages).toHaveLength(100);
    expect(conversation.messagesTruncated).toBe(true);
    expect(conversation.messages[0]).toEqual({ role: 'assistant', content: 'Mensagem 5' });
    expect(conversation.messages[0]).not.toHaveProperty('internal');
  });

  it('builds dashboard aggregation in the server time zone', async () => {
    const result = await getAdminDashboardSummary(observabilityRepository(), new Date(NOW));
    expect(result).toMatchObject({
      contractVersion: 1,
      counts: { users: 5, usageEvents: 10 },
      generatedAt: NOW,
      timeZone: 'America/Sao_Paulo',
    });
    expect(result.usageTrend).toHaveLength(7);
    expect(result.usageTrend.reduce((sum, item) => sum + item.count, 0)).toBe(2);
  });

  it('derives error resolution ownership from the authenticated admin', async () => {
    const repository = observabilityRepository();
    const result = await executeAdminObservability(repository, ACTOR_ID, {
      action: 'resolve_error_log',
      logId: RECORD_ID,
    });
    expect(repository.resolveErrorLog).toHaveBeenCalledWith(
      ACTOR_ID,
      RECORD_ID,
      expect.any(String),
    );
    expect(result.log).toMatchObject({ resolved: true, resolvedBy: ACTOR_ID });
  });
});

describe('support-tickets backend contract', () => {
  it('allows only user-editable fields and rejects spoofed identity or server state', () => {
    expect(parseSupportTicketsPayload({
      action: 'create_ticket',
      type: 'problema',
      title: 'Falha',
      description: 'A tela nao abriu.',
      route: '/alunos',
    })).toMatchObject({ action: 'create_ticket', route: '/alunos' });

    for (const payload of [
      { action: 'create_ticket', type: 'problema', title: 'Falha', description: 'Erro', route: '/', userId: ACTOR_ID },
      { action: 'create_ticket', type: 'problema', title: 'Falha', description: 'Erro', route: '/', context: {} },
      { action: 'create_ticket', type: 'problema', title: '   ', description: 'Erro', route: '/' },
      { action: 'create_ticket', type: 'problema', title: 'Falha', description: '   ', route: '/' },
      { action: 'update_ticket', ticketId: RECORD_ID, status: 'resolvido', adminNotes: '', resolvedAt: NOW },
      { action: 'list_tickets', pageSize: 101 },
    ]) {
      expect(() => parseSupportTicketsPayload(payload)).toThrowError(
        expect.objectContaining({ status: 422 }),
      );
    }
  });

  it('uses the authenticated actor and server request context when creating a ticket', async () => {
    const repository = supportRepository();
    const result = await executeSupportTickets(repository, ACTOR_ID, {
      action: 'create_ticket',
      type: 'problema',
      title: 'Falha',
      description: 'Erro na pagina.',
      route: '/alunos',
    }, { correlationId: 'corr-1', userAgent: 'browser-agent' });

    expect(repository.createTicket).toHaveBeenCalledWith(expect.objectContaining({
      actorId: ACTOR_ID,
      context: { correlationId: 'corr-1', userAgent: 'browser-agent' },
    }));
    expect(result.ticket.userId).toBe(ACTOR_ID);
  });

  it('assigns and resolves a ticket on the server without leaking context secrets', async () => {
    const repository = supportRepository();
    const result = await executeSupportTickets(repository, ACTOR_ID, {
      action: 'update_ticket',
      ticketId: RECORD_ID,
      status: 'resolvido',
      adminNotes: 'Validado.',
    }, { correlationId: 'corr-1', userAgent: null });

    expect(repository.updateTicket).toHaveBeenCalledWith(expect.objectContaining({
      actorId: ACTOR_ID,
      resolvedAt: expect.any(String),
    }));
    expect(result.ticket).toMatchObject({ assignedTo: ACTOR_ID, resolvedAt: expect.any(String) });
    expect(mapSupportTicket(ticketRow).context.authorization).toBe('[REDACTED]');
  });
});

describe('admin observability database boundary', () => {
  const migration = readFileSync(resolve(
    process.cwd(),
    'supabase/migrations/20260721230000_secure_admin_observability.sql',
  ), 'utf8');

  it('removes browser access from private observability tables', () => {
    for (const table of ['app_usage_events', 'app_error_logs', 'claris_conversations']) {
      expect(migration).toContain(`public.${table}`);
    }
    expect(migration).toMatch(/REVOKE ALL PRIVILEGES ON TABLE[\s\S]*FROM anon, authenticated/i);
  });

  it('keeps only admin-scoped support SELECT for Realtime and revokes browser writes', () => {
    expect(migration).toMatch(/GRANT SELECT ON TABLE public\.support_tickets TO authenticated/i);
    expect(migration).toMatch(/support_tickets_admin_realtime_select[\s\S]*is_application_admin/i);
    expect(migration).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE)[^;]*support_tickets[^;]*authenticated/i);
  });
});
