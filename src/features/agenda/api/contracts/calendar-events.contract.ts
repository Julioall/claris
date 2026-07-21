export const CALENDAR_EVENTS_CONTRACT_VERSION = 1 as const;

export const CALENDAR_EVENT_TYPES = [
  'manual',
  'webclass',
  'meeting',
  'alignment',
  'delivery',
  'training',
  'other',
] as const;
export type CalendarEventTypeDto = typeof CALENDAR_EVENT_TYPES[number];

export const CALENDAR_EXTERNAL_SOURCES = ['manual', 'teams', 'future_sync'] as const;
export type CalendarExternalSourceDto = typeof CALENDAR_EXTERNAL_SOURCES[number];

export const CALENDAR_SYNC_STATUSES = ['none', 'synced', 'pending', 'error'] as const;
export type CalendarSyncStatusDto = typeof CALENDAR_SYNC_STATUSES[number];

export interface CalendarEventDto {
  createdAt: string;
  description: string | null;
  endAt: string | null;
  externalEventId: string | null;
  externalId: string | null;
  externalProvider: string | null;
  externalSource: CalendarExternalSourceDto;
  id: string;
  lastSyncAt: string | null;
  startAt: string;
  syncStatus: CalendarSyncStatusDto;
  title: string;
  type: CalendarEventTypeDto;
  updatedAt: string;
}

export interface CalendarEventsMetadataDto {
  contractVersion: typeof CALENDAR_EVENTS_CONTRACT_VERSION;
  generatedAt: string;
}

export interface CalendarEventsPageDto {
  items: CalendarEventDto[];
  metadata: CalendarEventsMetadataDto;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface CalendarEventMutationDto {
  event: CalendarEventDto;
  metadata: CalendarEventsMetadataDto;
}
export interface CalendarEventDeleteDto {
  deleted: boolean;
  metadata: CalendarEventsMetadataDto;
}
