export const DATA_CLEANUP_CONTRACT_VERSION = 1 as const
export const DATA_CLEANUP_CONFIRMATION = 'CONFIRM_OPERATIONAL_DATA_CLEANUP_V1' as const
export const CLEANUP_SELECTION_IDS = [
  'sync_preferences',
  'ignored_courses',
  'course_catalog',
  'students',
  'academic_activities',
  'attendance',
  'sync_snapshots',
  'notes',
  'pending_tasks',
  'task_templates',
  'workspace_tasks',
  'moodle_conversations',
  'bulk_messaging',
  'claris_history',
  'ai_grading',
  'background_jobs',
  'support_tickets',
  'usage_metrics',
  'error_logs',
  'service_runtime',
] as const

export type CleanupMode = 'full_cleanup' | 'selected_cleanup'
export type CleanupSelectionId = typeof CLEANUP_SELECTION_IDS[number]

export interface CleanupErrorDto {
  error: string
  selectionId: CleanupSelectionId
}

export interface DataCleanupDto {
  completedSelectionIds: CleanupSelectionId[]
  contractVersion: typeof DATA_CLEANUP_CONTRACT_VERSION
  errors: CleanupErrorDto[]
  operationId: string
  success: boolean
}
