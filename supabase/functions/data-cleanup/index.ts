import { createHandler, errorResponse, jsonResponse } from '../_shared/http/mod.ts'
import { isApplicationAdmin } from '../_shared/auth/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { parseDataCleanupPayload } from './payload.ts'

const DELETE_ORDER = [
  { table: 'moodle_messages', label: 'Mensagens do Moodle' },
  { table: 'moodle_conversations', label: 'Conversas do Moodle' },
  { table: 'scheduled_messages', label: 'Mensagens agendadas' },
  { table: 'bulk_message_recipients', label: 'Destinatarios de envios em massa' },
  { table: 'bulk_message_jobs', label: 'Jobs de envios em massa' },
  { table: 'claris_suggestion_cooldowns', label: 'Cooldowns da Claris IA' },
  { table: 'ai_grade_suggestion_job_items', label: 'Itens de jobs da correcao IA' },
  { table: 'background_job_events', label: 'Eventos de background jobs' },
  { table: 'background_job_items', label: 'Itens de background jobs' },
  { table: 'app_service_webhook_events', label: 'Webhooks de servicos' },
  { table: 'app_service_instance_events', label: 'Eventos de servicos' },
  { table: 'app_service_instance_health_logs', label: 'Health logs de servicos' },
  { table: 'app_service_instance_jobs', label: 'Jobs de servicos' },
  { table: 'task_tags', label: 'Relacionamentos de tags de tarefas' },
  { table: 'task_comments', label: 'Comentarios de tarefas' },
  { table: 'task_history', label: 'Historico de tarefas' },
  { table: 'notes', label: 'Anotacoes' },
  { table: 'pending_tasks', label: 'Pendencias' },
  { table: 'risk_history', label: 'Historico de risco' },
  { table: 'activity_feed', label: 'Feed de atividades' },
  { table: 'support_tickets', label: 'Chamados de suporte' },
  { table: 'app_usage_events', label: 'Metricas de uso' },
  { table: 'app_error_logs', label: 'Logs de erro' },
  { table: 'claris_ai_actions', label: 'Auditoria da Claris IA' },
  { table: 'claris_conversations', label: 'Conversas da Claris IA' },
  { table: 'claris_suggestions', label: 'Sugestoes da Claris IA' },
  { table: 'ai_grade_suggestion_history', label: 'Historico de correcao IA' },
  { table: 'ai_grade_suggestion_jobs', label: 'Jobs de correcao IA' },
  { table: 'background_jobs', label: 'Background jobs' },
  { table: 'student_sync_snapshots', label: 'Snapshots de sync de alunos' },
  { table: 'dashboard_course_activity_aggregates', label: 'Agregados de atividades por curso' },
  { table: 'student_activities', label: 'Atividades' },
  { table: 'student_course_grades', label: 'Notas' },
  { table: 'student_courses', label: 'Matriculas' },
  { table: 'attendance_records', label: 'Registros de frequencia' },
  { table: 'attendance_course_settings', label: 'Configuracoes de frequencia' },
  { table: 'user_courses', label: 'Vinculos de cursos' },
  { table: 'user_ignored_courses', label: 'Cursos ignorados' },
  { table: 'task_recurrence_configs', label: 'Recorrencias de pendencias' },
  { table: 'user_moodle_reauth_credentials', label: 'Credenciais Moodle salvas' },
  { table: 'user_sync_preferences', label: 'Preferencias de sincronizacao' },
  { table: 'task_templates', label: 'Modelos de tarefa' },
  { table: 'message_templates', label: 'Modelos de mensagem' },
  { table: 'calendar_events', label: 'Eventos de agenda' },
  { table: 'tasks', label: 'Tarefas do workspace' },
  { table: 'tags', label: 'Tags' },
  { table: 'students', label: 'Alunos' },
  { table: 'courses', label: 'Cursos' },
] as const

const ALLOWED_TABLES = new Set(DELETE_ORDER.map(({ table }) => table))

type CleanupTableRpcResult = {
  deleted_table: string
}

async function deleteAllRowsFromTable(
  supabase: ReturnType<typeof createServiceClient>,
  table: string,
) {
  return await supabase.rpc(
    'admin_cleanup_table' as never,
    { target_table: table } as never,
  ) as { data: CleanupTableRpcResult | null; error: { message?: string } | null }
}

async function isAdminUser(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<boolean> {
  return isApplicationAdmin(supabase, userId)
}

Deno.serve(createHandler(async ({ body, user }) => {
  const supabase = createServiceClient()

  const { data: dbUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (!dbUser) return errorResponse('User not found', 404)

  const admin = await isAdminUser(supabase, user.id)
  if (!admin) return errorResponse('Admin access required', 403)

  const invalidTables = (body.tables ?? []).filter((table) => !ALLOWED_TABLES.has(table))
  if (invalidTables.length > 0) {
    return errorResponse(`Unsupported tables requested for cleanup: ${invalidTables.join(', ')}`, 400)
  }

  const tablesToDelete = body.mode === 'selected_cleanup'
    ? DELETE_ORDER.filter(({ table }) => body.tables?.includes(table))
    : DELETE_ORDER

  if (body.mode === 'selected_cleanup' && tablesToDelete.length === 0) {
    return errorResponse('No tables selected for cleanup.', 400)
  }

  const results: { table: string; success: boolean; error?: string }[] = []

  for (const { table, label } of tablesToDelete) {
    const { error } = await deleteAllRowsFromTable(supabase, table)

    results.push({
      table,
      success: !error,
      error: error?.message,
    })

    if (error) {
      console.error(`Error deleting from ${table} (${label}):`, error)
    }
  }

  const failures = results.filter((result) => !result.success)
  console.log(`${body.mode} completed. ${results.length - failures.length}/${results.length} tables cleaned.`)

  return jsonResponse({
    success: failures.length === 0,
    cleaned: results.filter((result) => result.success).map((result) => result.table),
    errors: failures,
  })
}, { requireAuth: true, parseBody: parseDataCleanupPayload }))
