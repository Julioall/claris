import type { AppSupabaseClient, Json, TablesInsert } from '../db/mod.ts'

export type AdminOperation = 'data_cleanup' | 'grade_diagnostic'
export type AdminOperationPhase = 'requested' | 'completed' | 'failed'
export type AdminOperationStatus = 'pending' | 'success' | 'partial_failure' | 'failed'

export interface AdminOperationAuditInput {
  actorId: string
  correlationId: string
  details: Json
  operation: AdminOperation
  operationId: string
  phase: AdminOperationPhase
  status: AdminOperationStatus
}

export async function recordAdminOperationAudit(
  supabase: AppSupabaseClient,
  input: AdminOperationAuditInput,
): Promise<void> {
  const row: TablesInsert<'app_admin_operation_audit_log'> = {
    actor_id: input.actorId,
    correlation_id: input.correlationId,
    details: input.details,
    operation: input.operation,
    operation_id: input.operationId,
    phase: input.phase,
    status: input.status,
  }

  const { error } = await supabase
    .from('app_admin_operation_audit_log')
    .insert(row)

  if (error) throw error
}
