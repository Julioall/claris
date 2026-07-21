import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeEdgeFunctionMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    readonly code: string;

    constructor(error: { code: string; message: string }) {
      super(error.message);
      this.code = error.code;
    }
  },
  invokeEdgeFunction: invokeEdgeFunctionMock,
}));

import {
  createCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
} from '../calendar.repository';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const metadata = { contractVersion: 1, generatedAt: '2026-07-21T12:00:00.000Z' };
const event = {
  createdAt: '2026-07-21T10:00:00.000Z',
  description: null,
  endAt: '2026-07-22T11:00:00.000Z',
  externalEventId: null,
  externalId: null,
  externalProvider: null,
  externalSource: 'manual',
  id: EVENT_ID,
  lastSyncAt: null,
  startAt: '2026-07-22T10:00:00.000Z',
  syncStatus: 'none',
  title: 'Alinhamento',
  type: 'alignment',
  updatedAt: '2026-07-21T10:00:00.000Z',
};

describe('calendar events API client', () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
  });

  it('lists owner-scoped events without sending owner identity', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      items: [event],
      metadata,
      page: 1,
      pageSize: 1_000,
      totalCount: 1,
      totalPages: 1,
    });

    await expect(listCalendarEvents()).resolves.toEqual([
      expect.objectContaining({ id: EVENT_ID, start_at: event.startAt }),
    ]);
    const body = invokeEdgeFunctionMock.mock.calls[0][1].body;
    expect(body.action).toBe('list_events');
    expect(JSON.stringify(body)).not.toMatch(/owner|userId|user_id/);
  });

  it('creates manual events without browser-controlled sync or owner fields', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({ event, metadata });

    await createCalendarEvent({
      end_at: event.endAt,
      start_at: event.startAt,
      title: event.title,
      type: 'alignment',
    });

    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).toEqual({
      action: 'create_event',
      input: {
        endAt: event.endAt,
        startAt: event.startAt,
        title: event.title,
        type: 'alignment',
      },
    });
  });

  it('updates only contract fields', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({ event: { ...event, title: 'Novo titulo' }, metadata });
    await updateCalendarEvent(EVENT_ID, { title: 'Novo titulo' });
    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).toEqual({
      action: 'update_event',
      eventId: EVENT_ID,
      input: { title: 'Novo titulo' },
    });
  });

  it('rejects database-shaped responses', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      items: [{ ...event, startAt: undefined, start_at: event.startAt }],
      metadata,
      page: 1,
      pageSize: 1_000,
      totalCount: 1,
      totalPages: 1,
    });
    await expect(listCalendarEvents()).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
