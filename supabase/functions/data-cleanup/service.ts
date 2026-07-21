import { ApiError } from '../_shared/http/mod.ts'
import {
  CLEANUP_SELECTION_IDS,
  DATA_CLEANUP_CONTRACT_VERSION,
  type CleanupSelectionId,
  type DataCleanupDto,
} from './contract.ts'
import type { DataCleanupPayload } from './payload.ts'
import type { DataCleanupRepository } from './repository.ts'

export const CLEANUP_DELETE_ORDER = [
  'moodle_messages',
  'moodle_conversations',
  'scheduled_messages',
  'bulk_message_recipients',
  'bulk_message_jobs',
  'claris_suggestion_cooldowns',
  'ai_grade_suggestion_job_items',
  'background_job_events',
  'background_job_items',
  'app_service_webhook_events',
  'app_service_instance_events',
  'app_service_instance_health_logs',
  'app_service_instance_jobs',
  'task_tags',
  'task_comments',
  'task_history',
  'notes',
  'pending_tasks',
  'risk_history',
  'activity_feed',
  'support_tickets',
  'app_usage_events',
  'app_error_logs',
  'claris_ai_actions',
  'claris_conversations',
  'claris_suggestions',
  'ai_grade_suggestion_history',
  'ai_grade_suggestion_jobs',
  'background_jobs',
  'student_sync_snapshots',
  'dashboard_course_activity_aggregates',
  'student_activities',
  'student_course_grades',
  'student_courses',
  'attendance_records',
  'attendance_course_settings',
  'user_courses',
  'user_ignored_courses',
  'task_recurrence_configs',
  'user_moodle_reauth_credentials',
  'user_sync_preferences',
  'task_templates',
  'message_templates',
  'calendar_events',
  'tasks',
  'tags',
  'students',
  'courses',
] as const

export const CLEANUP_SELECTION_TABLES: Record<CleanupSelectionId, readonly string[]> = {
  sync_preferences: ['user_sync_preferences'],
  ignored_courses: ['user_ignored_courses'],
  moodle_reauthorization: ['user_moodle_reauth_credentials'],
  course_catalog: [
    'background_job_events',
    'background_job_items',
    'background_jobs',
    'ai_grade_suggestion_job_items',
    'ai_grade_suggestion_history',
    'ai_grade_suggestion_jobs',
    'activity_feed',
    'attendance_records',
    'attendance_course_settings',
    'dashboard_course_activity_aggregates',
    'student_sync_snapshots',
    'student_activities',
    'student_course_grades',
    'student_courses',
    'user_courses',
    'user_ignored_courses',
    'courses',
  ],
  students: [
    'ai_grade_suggestion_job_items',
    'ai_grade_suggestion_history',
    'activity_feed',
    'attendance_records',
    'notes',
    'pending_tasks',
    'risk_history',
    'student_sync_snapshots',
    'student_activities',
    'student_course_grades',
    'student_courses',
    'task_recurrence_configs',
    'students',
  ],
  academic_activities: [
    'ai_grade_suggestion_job_items',
    'ai_grade_suggestion_history',
    'ai_grade_suggestion_jobs',
    'dashboard_course_activity_aggregates',
    'student_activities',
    'student_course_grades',
  ],
  attendance: ['attendance_records', 'attendance_course_settings'],
  sync_snapshots: ['student_sync_snapshots'],
  notes: ['notes'],
  pending_tasks: ['notes', 'pending_tasks', 'task_recurrence_configs'],
  task_templates: ['notes', 'pending_tasks', 'task_templates'],
  workspace_tasks: [
    'task_tags',
    'task_comments',
    'task_history',
    'calendar_events',
    'tasks',
    'tags',
  ],
  moodle_conversations: ['moodle_messages', 'moodle_conversations'],
  bulk_messaging: [
    'scheduled_messages',
    'bulk_message_recipients',
    'bulk_message_jobs',
    'message_templates',
  ],
  claris_history: [
    'claris_suggestion_cooldowns',
    'claris_suggestions',
    'claris_ai_actions',
    'claris_conversations',
  ],
  ai_grading: [
    'ai_grade_suggestion_job_items',
    'ai_grade_suggestion_history',
    'ai_grade_suggestion_jobs',
  ],
  background_jobs: ['background_job_events', 'background_job_items', 'background_jobs'],
  support_tickets: ['support_tickets'],
  usage_metrics: ['app_usage_events'],
  error_logs: ['app_error_logs'],
  service_runtime: [
    'app_service_webhook_events',
    'app_service_instance_events',
    'app_service_instance_health_logs',
    'app_service_instance_jobs',
  ],
}

const ALLOWED_TABLES = new Set<string>(CLEANUP_DELETE_ORDER)

export async function executeDataCleanup(
  repository: DataCleanupRepository,
  actorId: string,
  correlationId: string,
  payload: DataCleanupPayload,
): Promise<DataCleanupDto> {
  const selectionIds = payload.mode === 'selected_cleanup'
    ? payload.selectionIds ?? []
    : [...CLEANUP_SELECTION_IDS]
  const requestedTables = selectionIds.flatMap((selectionId) => (
    CLEANUP_SELECTION_TABLES[selectionId]
  ))
  const invalidTables = requestedTables.filter((table) => !ALLOWED_TABLES.has(table))
  if (invalidTables.length > 0) {
    throw ApiError.unprocessable('A configuração de limpeza contém um destino inválido.')
  }

  const tables = CLEANUP_DELETE_ORDER.filter((table) => requestedTables.includes(table))
  if (tables.length === 0) {
    throw ApiError.unprocessable('Selecione ao menos uma categoria para limpeza.')
  }

  const operationId = crypto.randomUUID()
  await repository.recordAudit({
    actorId,
    correlationId,
    details: { mode: payload.mode, selectionIds, tables },
    operation: 'data_cleanup',
    operationId,
    phase: 'requested',
    status: 'pending',
  })

  try {
    const cleanedTables: string[] = []
    const failedTables = new Set<string>()

    for (const table of tables) {
      const result = await repository.cleanupTable(table)
      if (result.success) cleanedTables.push(table)
      else failedTables.add(table)
    }

    const errors: DataCleanupDto['errors'] = selectionIds
      .filter((selectionId) => CLEANUP_SELECTION_TABLES[selectionId].some((table) => (
        failedTables.has(table)
      )))
      .map((selectionId) => ({
        selectionId,
        error: 'Não foi possível concluir esta categoria.',
      }))
    const completedSelectionIds = selectionIds.filter((selectionId) => (
      !errors.some((error) => error.selectionId === selectionId)
    ))
    const success = errors.length === 0

    await repository.recordAudit({
      actorId,
      correlationId,
      details: {
        cleanedTables,
        completedSelectionIds,
        failedTables: [...failedTables],
        mode: payload.mode,
        selectionIds,
      },
      operation: 'data_cleanup',
      operationId,
      phase: 'completed',
      status: success ? 'success' : 'partial_failure',
    })

    return {
      completedSelectionIds,
      contractVersion: DATA_CLEANUP_CONTRACT_VERSION,
      errors,
      operationId,
      success,
    }
  } catch (error) {
    await repository.recordAudit({
      actorId,
      correlationId,
      details: { mode: payload.mode, selectionIds, tables },
      operation: 'data_cleanup',
      operationId,
      phase: 'failed',
      status: 'failed',
    }).catch(() => undefined)
    throw error
  }
}
