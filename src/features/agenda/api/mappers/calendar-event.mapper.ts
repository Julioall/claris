import type { CalendarEvent } from '../../types';
import type { CalendarEventDto } from '../contracts/calendar-events.contract';

export function mapCalendarEvent(event: CalendarEventDto): CalendarEvent {
  return {
    created_at: event.createdAt,
    description: event.description,
    end_at: event.endAt,
    external_event_id: event.externalEventId,
    external_id: event.externalId,
    external_provider: event.externalProvider,
    external_source: event.externalSource,
    id: event.id,
    last_sync_at: event.lastSyncAt,
    start_at: event.startAt,
    sync_status: event.syncStatus,
    title: event.title,
    type: event.type,
    updated_at: event.updatedAt,
  };
}
