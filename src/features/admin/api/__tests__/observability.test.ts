import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: invokeMock,
}));

import { listAdminConversations } from '../conversations';
import { listAdminLogs, resolveAdminLog } from '../logs';
import {
  fetchAdminDashboardSummary,
  fetchMoodleSyncOperationalMetrics,
  listUsageEvents,
} from '../metrics';
import { createSupportTicket, listSupportTickets, updateSupportTicket } from '../support';

describe('admin observability HTTP adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeMock.mockResolvedValue({ contractVersion: 1, items: [], totalCount: 0 });
  });

  it('uses one backend dashboard use case', async () => {
    await fetchAdminDashboardSummary();
    expect(invokeMock).toHaveBeenCalledWith('admin-observability', {
      body: { action: 'get_dashboard' },
    });
  });

  it('requests bounded Moodle operational aggregates instead of data tables', async () => {
    await fetchMoodleSyncOperationalMetrics({ windowHours: 24, stuckAfterSeconds: 120 });
    expect(invokeMock).toHaveBeenCalledWith('admin-observability', {
      body: {
        action: 'get_moodle_sync_metrics',
        windowHours: 24,
        stuckAfterSeconds: 120,
      },
    });
  });

  it('sends filters and pagination as intent instead of database query operators', async () => {
    await listUsageEvents({ eventType: 'page_view', page: 2, pageSize: 25, search: 'alunos' });
    await listAdminLogs({ severity: 'critical', resolved: false, page: 3 });
    await listAdminConversations({ search: 'risco', page: 2 });

    expect(invokeMock.mock.calls.map(([, options]) => options.body.action)).toEqual([
      'list_usage_events',
      'list_error_logs',
      'list_claris_conversations',
    ]);
    expect(JSON.stringify(invokeMock.mock.calls)).not.toMatch(/select|from|range|resolved_by/);
  });

  it('resolves logs without accepting browser actor or timestamps', async () => {
    await resolveAdminLog('22222222-2222-4222-8222-222222222222');
    expect(invokeMock).toHaveBeenCalledWith('admin-observability', {
      body: {
        action: 'resolve_error_log',
        logId: '22222222-2222-4222-8222-222222222222',
      },
    });
  });

  it('opens tickets without browser identity or arbitrary context', async () => {
    await createSupportTicket({
      type: 'problema',
      title: 'Falha',
      description: 'Erro na tela.',
      route: '/alunos',
    });
    const body = invokeMock.mock.calls[0][1].body;
    expect(body).toEqual({
      action: 'create_ticket',
      type: 'problema',
      title: 'Falha',
      description: 'Erro na tela.',
      route: '/alunos',
    });
    expect(JSON.stringify(body)).not.toMatch(/user_?id|context|assigned|resolved/i);
  });

  it('lists and updates tickets through administrative use cases', async () => {
    await listSupportTickets({ status: 'aberto', page: 2 });
    await updateSupportTicket('22222222-2222-4222-8222-222222222222', {
      status: 'resolvido',
      adminNotes: 'Validado.',
    });

    expect(invokeMock.mock.calls.map(([, options]) => options.body.action)).toEqual([
      'list_tickets',
      'update_ticket',
    ]);
    expect(invokeMock.mock.calls[1][1].body).not.toHaveProperty('resolvedAt');
    expect(invokeMock.mock.calls[1][1].body).not.toHaveProperty('assignedTo');
  });
});
