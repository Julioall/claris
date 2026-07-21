import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseCalendarEventsPayload } from '../../../../supabase/functions/calendar-events/payload.ts';
import type {
  CalendarEventRecord,
  CalendarEventsRepository,
} from '../../../../supabase/functions/calendar-events/repository.ts';
import {
  authorizeCalendarEventsAction,
  executeCalendarEvents,
} from '../../../../supabase/functions/calendar-events/service.ts';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const event: CalendarEventRecord = {
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
  title: 'Evento',
  type: 'manual',
  updatedAt: '2026-07-21T10:00:00.000Z',
};

function createRepository(): CalendarEventsRepository {
  return {
    createEvent: vi.fn(async () => event),
    deleteEvent: vi.fn(async () => true),
    findEvent: vi.fn(async () => event),
    listEventsPage: vi.fn(async () => ({ items: [event], totalCount: 1 })),
    updateEvent: vi.fn(async () => event),
    userHasPermission: vi.fn(async () => true),
  };
}

describe('calendar-events V1 contract', () => {
  let repository: CalendarEventsRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it('normalizes range, ordering and pagination', () => {
    expect(parseCalendarEventsPayload({
      action: 'list_events',
      filters: {
        from: '2026-07-01T00:00:00-03:00',
        to: '2026-07-31T23:59:59-03:00',
      },
      order: 'startAtAsc',
      page: 1,
      pageSize: 100,
    })).toEqual({
      action: 'list_events',
      filters: {
        from: '2026-07-01T03:00:00.000Z',
        to: '2026-08-01T02:59:59.000Z',
      },
      order: 'startAtAsc',
      page: 1,
      pageSize: 100,
    });
  });

  it.each([
    {},
    { action: 'list_events', filters: {}, owner: USER_ID },
    { action: 'create_event', input: { title: 'Evento', startAt: event.startAt, owner: USER_ID } },
    { action: 'create_event', input: { title: 'Evento', startAt: event.startAt, externalSource: 'teams' } },
    { action: 'create_event', input: { title: '', startAt: event.startAt } },
    { action: 'update_event', eventId: EVENT_ID, input: {} },
    { action: 'delete_event', eventId: 'invalid' },
  ])('rejects malformed and actor/sync fields: %o', (payload) => {
    expect(() => parseCalendarEventsPayload(payload)).toThrowError(expect.objectContaining({ status: 422 }));
  });

  it('requires agenda.view and scopes list queries with the token actor', async () => {
    const payload = parseCalendarEventsPayload({ action: 'list_events' });
    await expect(authorizeCalendarEventsAction(repository, USER_ID, payload)).resolves.toBe(true);
    expect(repository.userHasPermission).toHaveBeenCalledWith(USER_ID, 'agenda.view');

    const result = await executeCalendarEvents(repository, USER_ID, payload);
    expect(repository.listEventsPage).toHaveBeenCalledWith(expect.objectContaining({ actorId: USER_ID }));
    expect(result).toMatchObject({ items: [{ id: EVENT_ID, startAt: event.startAt }] });
    expect(JSON.stringify(result)).not.toMatch(/owner|start_at|external_source/);
  });

  it('derives the event owner and manual source in the repository call', async () => {
    await executeCalendarEvents(repository, USER_ID, {
      action: 'create_event',
      input: { startAt: event.startAt, title: 'Evento' },
    });
    expect(repository.createEvent).toHaveBeenCalledWith(USER_ID, {
      startAt: event.startAt,
      title: 'Evento',
    });
  });

  it('rejects inverted intervals before writing', async () => {
    await expect(executeCalendarEvents(repository, USER_ID, {
      action: 'create_event',
      input: {
        endAt: '2026-07-22T09:00:00.000Z',
        startAt: event.startAt,
        title: 'Evento invalido',
      },
    })).rejects.toMatchObject({ code: 'validation_failed', status: 422 });
    expect(repository.createEvent).not.toHaveBeenCalled();
  });

  it('returns the same hidden 404 for inaccessible events', async () => {
    vi.mocked(repository.findEvent).mockResolvedValue(null);
    await expect(executeCalendarEvents(repository, USER_ID, {
      action: 'delete_event',
      eventId: EVENT_ID,
    })).rejects.toMatchObject({ code: 'not_found', status: 404 });
    expect(repository.deleteEvent).not.toHaveBeenCalled();
  });
});
