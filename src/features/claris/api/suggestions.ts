import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

import type {
  ClarisSuggestion,
  ClarisSuggestionActionDto,
  ClarisSuggestionsListDto,
  ProactiveSuggestionGenerationDto,
  SuggestionActionType,
  SuggestionPriority,
  SuggestionType,
  TriggerEngine,
} from './contracts/claris-suggestions.contract';

const SUGGESTIONS_FUNCTION = 'claris-suggestions';
const SUGGESTION_TYPES = new Set<SuggestionType>([
  'task_followup', 'weekly_message', 'correction_followup', 'alignment_event',
  'recovery_followup', 'grade_risk', 'attendance_risk', 'engagement_risk',
  'uc_closing', 'routine_reminder', 'custom', 'unanswered_message',
  'interrupted_contact', 'channel_ineffective', 'event_no_prep', 'schedule_conflict',
  'recurring_event_manual', 'overdue_task', 'stalled_task', 'task_no_context',
  'student_no_activity', 'class_no_followup', 'uc_no_update', 'manual_flow_recurring',
  'old_pending', 'interrupted_process', 'unused_module', 'repetitive_pattern',
  'unorganized_messages',
]);
const PRIORITIES = new Set<SuggestionPriority>(['low', 'medium', 'high', 'urgent']);
const ACTION_TYPES = new Set<SuggestionActionType>(['create_task', 'create_event', 'open_chat']);
const TRIGGER_ENGINES = new Set<TriggerEngine>([
  'communication', 'agenda', 'tasks', 'academic', 'operational', 'platform_usage', 'manual',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isSuggestion(value: unknown): value is ClarisSuggestion {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.body === 'string'
    && typeof value.type === 'string'
    && SUGGESTION_TYPES.has(value.type as SuggestionType)
    && typeof value.priority === 'string'
    && PRIORITIES.has(value.priority as SuggestionPriority)
    && value.status === 'pending'
    && isNullableString(value.reason)
    && isNullableString(value.analysis)
    && isNullableString(value.expectedImpact)
    && isNullableString(value.entityType)
    && isNullableString(value.entityId)
    && isNullableString(value.entityName)
    && isNullableString(value.expiresAt)
    && typeof value.suggestedAt === 'string'
    && (value.triggerEngine === null
      || (typeof value.triggerEngine === 'string'
        && TRIGGER_ENGINES.has(value.triggerEngine as TriggerEngine)))
    && (value.actionType === null
      || (typeof value.actionType === 'string'
        && ACTION_TYPES.has(value.actionType as SuggestionActionType)));
}

function invalidResponse(): never {
  throw new Error('A API de sugestoes da Claris retornou uma resposta invalida.');
}

function readAction(value: unknown): ClarisSuggestionActionDto {
  if (
    !isRecord(value)
    || value.contractVersion !== 1
    || typeof value.suggestionId !== 'string'
    || (value.status !== 'accepted' && value.status !== 'dismissed')
    || (value.effect !== 'none' && value.effect !== 'task_created' && value.effect !== 'event_created')
    || (value.createdEntityId !== null && typeof value.createdEntityId !== 'string')
    || (value.actionType !== null
      && (typeof value.actionType !== 'string'
        || !ACTION_TYPES.has(value.actionType as SuggestionActionType)))
  ) {
    invalidResponse();
  }
  return value as unknown as ClarisSuggestionActionDto;
}

export async function fetchPendingClarisSuggestions(limit = 10): Promise<ClarisSuggestion[]> {
  const response = await invokeEdgeFunction<ClarisSuggestionsListDto>(SUGGESTIONS_FUNCTION, {
    body: { action: 'list_pending', limit },
  });
  if (
    !isRecord(response)
    || response.contractVersion !== 1
    || !Array.isArray(response.items)
    || !response.items.every(isSuggestion)
  ) {
    invalidResponse();
  }
  return response.items;
}

export async function acceptClarisSuggestion(suggestionId: string): Promise<ClarisSuggestionActionDto> {
  return readAction(await invokeEdgeFunction<ClarisSuggestionActionDto>(SUGGESTIONS_FUNCTION, {
    body: { action: 'accept', suggestionId },
  }));
}

export async function dismissClarisSuggestion(suggestionId: string): Promise<ClarisSuggestionActionDto> {
  return readAction(await invokeEdgeFunction<ClarisSuggestionActionDto>(SUGGESTIONS_FUNCTION, {
    body: { action: 'dismiss', suggestionId },
  }));
}

function isGeneration(value: unknown): value is ProactiveSuggestionGenerationDto {
  if (!isRecord(value) || value.contractVersion !== 1 || !isRecord(value.details)) return false;
  return Number.isSafeInteger(value.enginesRun)
    && Number.isSafeInteger(value.suggestionsCreated)
    && ['academic', 'agenda', 'communication', 'operational', 'platformUsage', 'tasks']
      .every((field) => Number.isSafeInteger(value.details[field]));
}

export async function generateClarisSuggestions(): Promise<ProactiveSuggestionGenerationDto> {
  const response = await invokeEdgeFunction<ProactiveSuggestionGenerationDto>(
    'generate-proactive-suggestions',
    { body: {} },
  );
  if (!isGeneration(response)) invalidResponse();
  return response;
}
