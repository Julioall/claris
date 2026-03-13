import { createHandler } from '../_shared/http/mod.ts'
import { jsonResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { parseDataCleanupPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body, user }) => {
  const supabase = createServiceClient()

  // Verify the user exists
  const { data: dbUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (!dbUser) return errorResponse('User not found', 404)

  // Delete in dependency order using service_role (bypasses RLS)
  const deleteOrder = [
    { table: 'moodle_messages', label: 'Mensagens' },
    { table: 'moodle_conversations', label: 'Conversas' },
    { table: 'bulk_message_recipients', label: 'Destinatários de envios em massa' },
    { table: 'bulk_message_jobs', label: 'Jobs de envios em massa' },
    { table: 'task_action_history', label: 'Histórico de ações de pendências' },
    { table: 'task_actions', label: 'Ações de pendências' },
    { table: 'task_action_logs', label: 'Logs de ações' },
    { table: 'notes', label: 'Anotações' },
    { table: 'actions', label: 'Ações' },
    { table: 'pending_tasks', label: 'Pendências' },
    { table: 'risk_history', label: 'Histórico de risco' },
    { table: 'activity_feed', label: 'Feed de atividades' },
    { table: 'student_activities', label: 'Atividades' },
    { table: 'student_course_grades', label: 'Notas' },
    { table: 'student_courses', label: 'Matrículas' },
    { table: 'attendance_records', label: 'Registros de frequência' },
    { table: 'attendance_course_settings', label: 'Configurações de frequência' },
    { table: 'user_courses', label: 'Vínculos de cursos' },
    { table: 'user_ignored_courses', label: 'Cursos ignorados' },
    { table: 'task_recurrence_configs', label: 'Recorrências de pendências' },
    { table: 'user_sync_preferences', label: 'Preferências' },
    { table: 'action_types', label: 'Tipos de ação' },
    { table: 'task_templates', label: 'Modelos de tarefa' },
    { table: 'message_templates', label: 'Modelos de mensagem' },
    { table: 'students', label: 'Alunos' },
    { table: 'courses', label: 'Cursos' },
  ] as const

  const results: { table: string; success: boolean; error?: string }[] = []

  for (const { table } of deleteOrder) {
    const { error } = await supabase
      .from(table)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    results.push({
      table,
      success: !error,
      error: error?.message,
    })

    if (error) {
      console.error(`Error deleting from ${table}:`, error)
    }
  }

  const failures = results.filter(r => !r.success)
  console.log(`Full cleanup completed. ${results.length - failures.length}/${results.length} tables cleaned.`)

  return jsonResponse({
    success: failures.length === 0,
    cleaned: results.filter(r => r.success).map(r => r.table),
    errors: failures,
  })
}, { requireAuth: true, parseBody: parseDataCleanupPayload }))
