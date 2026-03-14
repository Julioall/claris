import { createHandler, errorResponse, jsonResponse } from '../_shared/http/mod.ts'
import { createServiceClient } from '../_shared/db/mod.ts'
import { parseDataCleanupPayload } from './payload.ts'

Deno.serve(createHandler(async ({ body, user }) => {
  const supabase = createServiceClient()

  const { data: dbUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (!dbUser) return errorResponse('User not found', 404)

  const deleteOrder = [
    { table: 'moodle_messages', label: 'Mensagens' },
    { table: 'moodle_conversations', label: 'Conversas' },
    { table: 'bulk_message_recipients', label: 'Destinatarios de envios em massa' },
    { table: 'bulk_message_jobs', label: 'Jobs de envios em massa' },
    { table: 'notes', label: 'Anotacoes' },
    { table: 'pending_tasks', label: 'Pendencias' },
    { table: 'risk_history', label: 'Historico de risco' },
    { table: 'activity_feed', label: 'Feed de atividades' },
    { table: 'student_activities', label: 'Atividades' },
    { table: 'student_course_grades', label: 'Notas' },
    { table: 'student_courses', label: 'Matriculas' },
    { table: 'attendance_records', label: 'Registros de frequencia' },
    { table: 'attendance_course_settings', label: 'Configuracoes de frequencia' },
    { table: 'user_courses', label: 'Vinculos de cursos' },
    { table: 'user_ignored_courses', label: 'Cursos ignorados' },
    { table: 'task_recurrence_configs', label: 'Recorrencias de pendencias' },
    { table: 'user_sync_preferences', label: 'Preferencias' },
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

  const failures = results.filter((result) => !result.success)
  console.log(`Full cleanup completed. ${results.length - failures.length}/${results.length} tables cleaned.`)

  return jsonResponse({
    success: failures.length === 0,
    cleaned: results.filter((result) => result.success).map((result) => result.table),
    errors: failures,
  })
}, { requireAuth: true, parseBody: parseDataCleanupPayload }))
