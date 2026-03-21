export type CalendarEventType = 'manual' | 'webclass' | 'meeting' | 'alignment' | 'delivery' | 'training' | 'other';
export type ExternalSource = 'manual' | 'teams' | 'future_sync';
export type SyncStatus = 'none' | 'synced' | 'pending' | 'error';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  type: CalendarEventType;
  owner?: string | null;
  external_source: ExternalSource;
  external_id?: string | null;
  external_provider?: string | null;
  external_event_id?: string | null;
  sync_status?: SyncStatus | null;
  last_sync_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  start_at: string;
  end_at?: string;
  type?: CalendarEventType;
  owner?: string;
  external_source?: ExternalSource;
}

export type UpdateCalendarEventInput = Partial<CreateCalendarEventInput>;
