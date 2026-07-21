import {
  recordAdminOperationAudit,
  type AdminOperationAuditInput,
} from '../_shared/domain/admin-operation-audit.ts'
import type { AppSupabaseClient } from '../_shared/db/mod.ts'

export interface CleanupTableResult {
  errorMessage: string | null
  success: boolean
}

export interface DataCleanupRepository {
  cleanupTable(table: string): Promise<CleanupTableResult>
  recordAudit(input: AdminOperationAuditInput): Promise<void>
}

export function createDataCleanupRepository(
  supabase: AppSupabaseClient,
): DataCleanupRepository {
  return {
    async cleanupTable(table) {
      const { error } = await supabase.rpc(
        'admin_cleanup_table' as never,
        { target_table: table } as never,
      ) as { error: { message?: string } | null }

      if (error) {
        console.error('Administrative table cleanup failed.', {
          table,
          message: error.message ?? 'Unknown database error',
        })
      }

      return {
        success: !error,
        errorMessage: error?.message ?? null,
      }
    },

    recordAudit(input) {
      return recordAdminOperationAudit(supabase, input)
    },
  }
}
