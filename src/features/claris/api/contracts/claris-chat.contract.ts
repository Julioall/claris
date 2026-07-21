export type ClarisAvailabilityStatus = 'ready' | 'not_configured' | 'invalid';

export interface ClarisAvailabilityDto {
  contractVersion: 1;
  status: ClarisAvailabilityStatus;
}

export interface ClarisUiActionDto {
  id: string;
  jobId: string | null;
  kind: 'quick_reply';
  label: string;
  value: string;
}

export interface ClarisDataTableBlockDto {
  columns: Array<{ key: string; label: string }>;
  emptyMessage: string;
  rows: Array<Record<string, string>>;
  title: string;
  tool: string;
  type: 'data_table';
}

export interface ClarisStatCardsBlockDto {
  stats: Array<{
    label: string;
    value: string;
    variant: 'danger' | 'default' | 'warning';
  }>;
  title: string;
  type: 'stat_cards';
}

export type ClarisRichBlockDto = ClarisDataTableBlockDto | ClarisStatCardsBlockDto;

export interface ClarisChatResponseDto {
  contractVersion: 1;
  reply: string;
  richBlocks: ClarisRichBlockDto[];
  uiActions: ClarisUiActionDto[];
}
