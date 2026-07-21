export const CLARIS_SUGGESTIONS_CONTRACT_VERSION = 1 as const

export const CLARIS_SUGGESTION_TYPES = [
  'task_followup',
  'weekly_message',
  'correction_followup',
  'alignment_event',
  'recovery_followup',
  'grade_risk',
  'attendance_risk',
  'engagement_risk',
  'uc_closing',
  'routine_reminder',
  'custom',
  'unanswered_message',
  'interrupted_contact',
  'channel_ineffective',
  'event_no_prep',
  'schedule_conflict',
  'recurring_event_manual',
  'overdue_task',
  'stalled_task',
  'task_no_context',
  'student_no_activity',
  'class_no_followup',
  'uc_no_update',
  'manual_flow_recurring',
  'old_pending',
  'interrupted_process',
  'unused_module',
  'repetitive_pattern',
  'unorganized_messages',
] as const
export type ClarisSuggestionTypeDto = typeof CLARIS_SUGGESTION_TYPES[number]

export const CLARIS_SUGGESTION_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type ClarisSuggestionPriorityDto = typeof CLARIS_SUGGESTION_PRIORITIES[number]

export const CLARIS_SUGGESTION_ACTION_TYPES = ['create_task', 'create_event', 'open_chat'] as const
export type ClarisSuggestionActionTypeDto = typeof CLARIS_SUGGESTION_ACTION_TYPES[number]

export const CLARIS_TRIGGER_ENGINES = [
  'communication',
  'agenda',
  'tasks',
  'academic',
  'operational',
  'platform_usage',
  'manual',
] as const
export type ClarisTriggerEngineDto = typeof CLARIS_TRIGGER_ENGINES[number]

export interface ClarisSuggestionDto {
  actionType: ClarisSuggestionActionTypeDto | null
  analysis: string | null
  body: string
  entityId: string | null
  entityName: string | null
  entityType: string | null
  expectedImpact: string | null
  expiresAt: string | null
  id: string
  priority: ClarisSuggestionPriorityDto
  reason: string | null
  status: 'pending'
  suggestedAt: string
  title: string
  triggerEngine: ClarisTriggerEngineDto | null
  type: ClarisSuggestionTypeDto
}

export interface ClarisSuggestionsListDto {
  contractVersion: typeof CLARIS_SUGGESTIONS_CONTRACT_VERSION
  items: ClarisSuggestionDto[]
}

export type ClarisSuggestionEffectDto = 'none' | 'task_created' | 'event_created'

export interface ClarisSuggestionActionDto {
  actionType: ClarisSuggestionActionTypeDto | null
  contractVersion: typeof CLARIS_SUGGESTIONS_CONTRACT_VERSION
  createdEntityId: string | null
  effect: ClarisSuggestionEffectDto
  status: 'accepted' | 'dismissed'
  suggestionId: string
}

export type ClarisSuggestionsResponseDto =
  | ClarisSuggestionsListDto
  | ClarisSuggestionActionDto
