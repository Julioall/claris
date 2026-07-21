export const CLARIS_CHAT_CONTRACT_VERSION = 1 as const

export type ClarisAvailabilityStatusDto = 'invalid' | 'not_configured' | 'ready'

export interface ClarisAvailabilityDto {
  contractVersion: typeof CLARIS_CHAT_CONTRACT_VERSION
  status: ClarisAvailabilityStatusDto
}

export interface ClarisUiActionDto {
  id: string
  jobId: string | null
  kind: 'quick_reply'
  label: string
  value: string
}

export interface ClarisDataTableBlockDto {
  columns: Array<{ key: string; label: string }>
  emptyMessage: string
  rows: Array<Record<string, string>>
  title: string
  tool: string
  type: 'data_table'
}

export interface ClarisStatCardsBlockDto {
  stats: Array<{
    label: string
    value: string
    variant: 'danger' | 'default' | 'warning'
  }>
  title: string
  type: 'stat_cards'
}

export type ClarisRichBlockDto = ClarisDataTableBlockDto | ClarisStatCardsBlockDto

export interface ClarisChatResponseDto {
  contractVersion: typeof CLARIS_CHAT_CONTRACT_VERSION
  reply: string
  richBlocks: ClarisRichBlockDto[]
  uiActions: ClarisUiActionDto[]
}
