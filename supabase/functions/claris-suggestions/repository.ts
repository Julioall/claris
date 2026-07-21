import { userHasPermission as checkPermission } from '../_shared/auth/mod.ts'
import {
  createServiceClient,
  type AppSupabaseClient,
} from '../_shared/db/mod.ts'
import type {
  ClarisSuggestionActionTypeDto,
  ClarisSuggestionDto,
  ClarisSuggestionEffectDto,
  ClarisSuggestionPriorityDto,
  ClarisSuggestionTypeDto,
  ClarisTriggerEngineDto,
} from './contract.ts'

type SuggestionRow = {
  action_type: string | null
  analysis: string | null
  body: string
  entity_id: string | null
  entity_name: string | null
  entity_type: string | null
  expected_impact: string | null
  expires_at: string | null
  id: string
  priority: string
  reason: string | null
  status: string
  suggested_at: string
  title: string
  trigger_engine: string | null
  type: string
}

export type ClarisSuggestionCommandResult =
  | { kind: 'not_found' }
  | { kind: 'not_actionable' }
  | { kind: 'invalid_action_payload' }
  | {
    actionType: ClarisSuggestionActionTypeDto | null
    createdEntityId: string | null
    effect: ClarisSuggestionEffectDto
    kind: 'succeeded'
    status: 'accepted' | 'dismissed'
    suggestionId: string
  }

export interface ClarisSuggestionsRepository {
  act(
    actorId: string,
    suggestionId: string,
    outcome: 'accepted' | 'dismissed',
  ): Promise<ClarisSuggestionCommandResult>
  listPending(actorId: string, limit: number): Promise<ClarisSuggestionDto[]>
  userCanUseClaris(actorId: string): Promise<boolean>
}

const COLUMNS = [
  'id',
  'type',
  'title',
  'body',
  'reason',
  'analysis',
  'expected_impact',
  'trigger_engine',
  'priority',
  'status',
  'entity_type',
  'entity_id',
  'entity_name',
  'action_type',
  'suggested_at',
  'expires_at',
].join(', ')

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function toDto(row: SuggestionRow): ClarisSuggestionDto {
  return {
    actionType: row.action_type as ClarisSuggestionActionTypeDto | null,
    analysis: row.analysis,
    body: row.body,
    entityId: row.entity_id,
    entityName: row.entity_name,
    entityType: row.entity_type,
    expectedImpact: row.expected_impact,
    expiresAt: row.expires_at,
    id: row.id,
    priority: row.priority as ClarisSuggestionPriorityDto,
    reason: row.reason,
    status: 'pending',
    suggestedAt: row.suggested_at,
    title: row.title,
    triggerEngine: row.trigger_engine as ClarisTriggerEngineDto | null,
    type: row.type as ClarisSuggestionTypeDto,
  }
}

function parseCommandResult(value: unknown): ClarisSuggestionCommandResult {
  const result = asRecord(value)
  if (!result || typeof result.result !== 'string') {
    throw new Error('Invalid Claris suggestion command result')
  }
  if (result.result === 'not_found' || result.result === 'not_actionable'
    || result.result === 'invalid_action_payload') {
    return { kind: result.result }
  }
  if (
    result.result !== 'succeeded'
    || typeof result.suggestion_id !== 'string'
    || (result.suggestion_status !== 'accepted' && result.suggestion_status !== 'dismissed')
    || (result.action_type !== null
      && result.action_type !== 'create_task'
      && result.action_type !== 'create_event'
      && result.action_type !== 'open_chat')
    || (result.effect !== 'none' && result.effect !== 'task_created' && result.effect !== 'event_created')
    || (result.created_entity_id !== null && typeof result.created_entity_id !== 'string')
  ) {
    throw new Error('Invalid Claris suggestion command result')
  }
  return {
    actionType: result.action_type,
    createdEntityId: result.created_entity_id,
    effect: result.effect,
    kind: 'succeeded',
    status: result.suggestion_status,
    suggestionId: result.suggestion_id,
  }
}

export function createClarisSuggestionsRepository(
  db: AppSupabaseClient = createServiceClient(),
): ClarisSuggestionsRepository {
  return {
    userCanUseClaris: (actorId) => checkPermission(db, actorId, 'claris.view'),

    async listPending(actorId, limit) {
      const { data, error } = await db
        .from('claris_suggestions')
        .select(COLUMNS)
        .eq('user_id', actorId)
        .eq('status', 'pending')
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('suggested_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []).map((row) => toDto(row as SuggestionRow))
    },

    async act(actorId, suggestionId, outcome) {
      const { data, error } = await db.rpc('backend_act_on_claris_suggestion' as never, {
        p_actor_id: actorId,
        p_outcome: outcome,
        p_suggestion_id: suggestionId,
      } as never)
      if (error) throw error
      return parseCommandResult(data)
    },
  }
}
