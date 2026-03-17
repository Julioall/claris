/**
 * Proactive suggestion engines — one per domain area.
 * Each engine returns 0-N suggestions.  Before inserting, each engine
 * checks the claris_suggestion_cooldowns table to avoid repetition.
 */

import type { AppSupabaseClient } from '../_shared/db/mod.ts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000

const CUTOFF_DAYS_COMMUNICATION = 30
const CUTOFF_DAYS_ACADEMIC = 14
const CUTOFF_DAYS_OPERATIONAL = 21
const CUTOFF_DAYS_PLATFORM_USAGE = 21
const STALLED_TASK_DAYS = 7
const UPCOMING_EVENT_DAYS = 3

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TriggerEngine =
  | 'communication'
  | 'agenda'
  | 'tasks'
  | 'academic'
  | 'operational'
  | 'platform_usage'

export interface ProactiveSuggestion {
  type: string
  title: string
  body: string
  reason: string
  analysis: string
  expected_impact: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  trigger_engine: TriggerEngine
  trigger_key: string
  entity_type?: string | null
  entity_id?: string | null
  entity_name?: string | null
  action_type?: 'create_task' | 'create_event' | 'open_chat' | null
  action_payload?: Record<string, unknown> | null
  expires_in_hours?: number
  cooldown_hours?: number
}

// ---------------------------------------------------------------------------
// Cooldown helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if an active (non-expired) cooldown exists for the
 * given engine / key / entity combination.
 */
async function isCooledDown(
  supabase: AppSupabaseClient,
  userId: string,
  engine: TriggerEngine,
  triggerKey: string,
  entityId?: string | null,
): Promise<boolean> {
  const now = new Date().toISOString()
  let query = supabase
    .from('claris_suggestion_cooldowns')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('trigger_engine', engine)
    .eq('trigger_key', triggerKey)
    .gt('expires_at', now)

  if (entityId) {
    query = query.eq('entity_id', entityId)
  } else {
    query = query.is('entity_id', null)
  }

  const { count } = await query
  return (count ?? 0) > 0
}

/**
 * Records a cooldown after a suggestion is generated so the same signal
 * is not re-generated within the cooldown window.
 */
async function recordCooldown(
  supabase: AppSupabaseClient,
  userId: string,
  engine: TriggerEngine,
  triggerKey: string,
  suggestionId: string,
  cooldownHours: number,
  entityType?: string | null,
  entityId?: string | null,
  outcome: 'generated' | 'accepted' | 'dismissed' | 'expired' | 'ignored' = 'generated',
): Promise<void> {
  const expiresAt = new Date(Date.now() + cooldownHours * 3600_000).toISOString()
  await supabase.from('claris_suggestion_cooldowns').insert({
    user_id: userId,
    trigger_engine: engine,
    trigger_key: triggerKey,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    expires_at: expiresAt,
    outcome,
    suggestion_id: suggestionId,
  })
}

/**
 * Persists a suggestion and records its cooldown.
 * Returns the inserted suggestion id (or null on failure).
 */
async function persistSuggestion(
  supabase: AppSupabaseClient,
  userId: string,
  suggestion: ProactiveSuggestion,
): Promise<string | null> {
  const expiresAt = new Date(
    Date.now() + (suggestion.expires_in_hours ?? 48) * 3600_000,
  ).toISOString()

  const { data, error } = await supabase
    .from('claris_suggestions')
    .insert({
      user_id: userId,
      type: suggestion.type,
      title: suggestion.title,
      body: suggestion.body,
      reason: suggestion.reason,
      analysis: suggestion.analysis,
      expected_impact: suggestion.expected_impact,
      priority: suggestion.priority,
      status: 'pending',
      trigger_engine: suggestion.trigger_engine,
      entity_type: suggestion.entity_type ?? null,
      entity_id: suggestion.entity_id ?? null,
      entity_name: suggestion.entity_name ?? null,
      action_type: suggestion.action_type ?? null,
      action_payload: suggestion.action_payload ?? null,
      expires_at: expiresAt,
      trigger_context: {
        trigger_key: suggestion.trigger_key,
        generated_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single()

  if (error || !data) return null

  await recordCooldown(
    supabase,
    userId,
    suggestion.trigger_engine,
    suggestion.trigger_key,
    data.id,
    suggestion.cooldown_hours ?? 24,
    suggestion.entity_type,
    suggestion.entity_id,
  )

  return data.id
}

// ---------------------------------------------------------------------------
// Helper: count pending suggestions of same type for this user
// ---------------------------------------------------------------------------

async function hasPendingSuggestionOfType(
  supabase: AppSupabaseClient,
  userId: string,
  type: string,
  entityId?: string | null,
): Promise<boolean> {
  const now = new Date().toISOString()
  let query = supabase
    .from('claris_suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', type)
    .eq('status', 'pending')
    .or(`expires_at.is.null,expires_at.gt.${now}`)

  if (entityId) {
    query = query.eq('entity_id', entityId)
  }

  const { count } = await query
  return (count ?? 0) > 0
}

// ---------------------------------------------------------------------------
// Helper: canGenerateSuggestion — positive boolean combining cooldown check
// and pending-suggestion check, to avoid double-negative logic in engines.
// ---------------------------------------------------------------------------

async function canGenerateSuggestion(
  supabase: AppSupabaseClient,
  userId: string,
  engine: TriggerEngine,
  triggerKey: string,
  type: string,
  entityId?: string | null,
): Promise<boolean> {
  if (await isCooledDown(supabase, userId, engine, triggerKey, entityId)) return false
  if (await hasPendingSuggestionOfType(supabase, userId, type, entityId)) return false
  return true
}

// ---------------------------------------------------------------------------
// Helper: normalizeRelation — extracts a single related row that Supabase
// may return as an object or a single-element array depending on join type.
// ---------------------------------------------------------------------------

function normalizeRelation<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

// ---------------------------------------------------------------------------
// Engine 1 — Communication
// ---------------------------------------------------------------------------

async function runCommunicationEngine(
  supabase: AppSupabaseClient,
  userId: string,
  courseIds: string[],
): Promise<number> {
  if (courseIds.length === 0) return 0
  let created = 0

  // Trigger 1: Students with risk level that haven't been contacted recently
  // We use last action date per student as proxy for "last contact"
  const cutoff30 = new Date(Date.now() - CUTOFF_DAYS_COMMUNICATION * MS_PER_DAY).toISOString()

  // Get at-risk students (risco or critico)
  const { data: atRiskStudents } = await supabase
    .from('student_courses')
    .select('student_id, students(id, full_name, current_risk_level)')
    .in('course_id', courseIds)
    .in('students.current_risk_level', ['risco', 'critico'])
    .limit(20)

  const processedStudents = new Set<string>()
  for (const sc of atRiskStudents ?? []) {
    const student = normalizeRelation(sc.students)
    if (!student?.id || !student.full_name) continue
    if (processedStudents.has(student.id)) continue
    processedStudents.add(student.id)

    const triggerKey = 'interrupted_contact'
    const entityId = student.id

    if (!(await canGenerateSuggestion(supabase, userId, 'communication', triggerKey, 'interrupted_contact', entityId))) continue

    // Check if there's a recent action for this student
    const { count: recentActionCount } = await supabase
      .from('student_actions')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', entityId)
      .gte('created_at', cutoff30)
      .limit(1)

    if ((recentActionCount ?? 0) > 0) continue // recent contact exists

    const riskLabel = student.current_risk_level === 'critico' ? 'crítico' : 'em risco'
    const id = await persistSuggestion(supabase, userId, {
      type: 'interrupted_contact',
      trigger_engine: 'communication',
      trigger_key: triggerKey,
      title: `Retomar contato com ${student.full_name}`,
      body: `O aluno ${student.full_name} está com status ${riskLabel} e não há registro de contato recente nos últimos ${CUTOFF_DAYS_COMMUNICATION} dias.`,
      reason: `Aluno classificado como ${riskLabel} sem interação recente registrada`,
      analysis: `Ausência de ações registradas nos últimos ${CUTOFF_DAYS_COMMUNICATION} dias para um aluno em nível de risco elevado indica necessidade de contato proativo.`,
      expected_impact: 'Retomada de acompanhamento e possível melhoria no engajamento e desempenho do aluno.',
      priority: student.current_risk_level === 'critico' ? 'urgent' : 'high',
      entity_type: 'student',
      entity_id: entityId,
      entity_name: student.full_name,
      action_type: 'create_task',
      action_payload: {
        title: `Contatar ${student.full_name} — acompanhamento de risco`,
        description: `Realizar contato com ${student.full_name} que está com status ${riskLabel}. Verificar situação acadêmica e oferecer suporte.`,
        priority: student.current_risk_level === 'critico' ? 'urgent' : 'high',
        tags: ['acompanhamento', 'risco', 'comunicacao'],
      },
      expires_in_hours: 72,
      cooldown_hours: 48,
    })

    if (id) created++
  }

  return created
}

// ---------------------------------------------------------------------------
// Engine 2 — Agenda
// ---------------------------------------------------------------------------

async function runAgendaEngine(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<number> {
  let created = 0

  // Trigger: Upcoming events (next 3 days) without a linked prep task
  const now = new Date()
  const horizon = new Date(now.getTime() + UPCOMING_EVENT_DAYS * MS_PER_DAY).toISOString()

  const { data: upcomingEvents } = await supabase
    .from('calendar_events')
    .select('id, title, start_at, type')
    .eq('owner', userId)
    .gte('start_at', now.toISOString())
    .lte('start_at', horizon)
    .in('type', ['webclass', 'meeting', 'alignment'])
    .order('start_at', { ascending: true })
    .limit(10)

  for (const event of upcomingEvents ?? []) {
    const triggerKey = 'event_no_prep'
    const entityId = event.id

    if (!(await canGenerateSuggestion(supabase, userId, 'agenda', triggerKey, 'event_no_prep', entityId))) continue

    // Check if there's already a prep task for this event
    const { count: prepTaskCount } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
      .in('status', ['todo', 'in_progress'])
      .contains('ai_tags', ['preparacao'])
      .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())

    if ((prepTaskCount ?? 0) > 0) continue

    const eventDate = new Date(event.start_at).toLocaleDateString('pt-BR', {
      weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
    const eventTypeLabel = event.type === 'webclass' ? 'Web Aula' : event.type === 'alignment' ? 'Alinhamento' : 'Reunião'

    const id = await persistSuggestion(supabase, userId, {
      type: 'event_no_prep',
      trigger_engine: 'agenda',
      trigger_key: triggerKey,
      title: `Preparar ${eventTypeLabel}: ${event.title}`,
      body: `Você tem um(a) ${eventTypeLabel} agendado(a) para ${eventDate} e não há tarefa de preparação associada.`,
      reason: `Evento próximo sem preparação registrada`,
      analysis: `Compromissos como ${eventTypeLabel.toLowerCase()}s requerem preparação prévia. A ausência de tarefa preparatória pode indicar que o planejamento não foi iniciado.`,
      expected_impact: 'Melhora na qualidade do compromisso e redução de imprevistos por falta de preparação.',
      priority: 'medium',
      entity_type: 'custom',
      entity_id: entityId,
      entity_name: event.title,
      action_type: 'create_task',
      action_payload: {
        title: `Preparar ${eventTypeLabel}: ${event.title}`,
        description: `Preparar materiais e conteúdo para o(a) ${eventTypeLabel.toLowerCase()} "${event.title}" em ${eventDate}.`,
        priority: 'medium',
        due_date: new Date(new Date(event.start_at).getTime() - 3_600_000).toISOString(),
        tags: ['preparacao', 'agenda'],
      },
      expires_in_hours: 48,
      cooldown_hours: 72,
    })

    if (id) created++
  }

  return created
}

// ---------------------------------------------------------------------------
// Engine 3 — Tasks
// ---------------------------------------------------------------------------

async function runTasksEngine(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<number> {
  let created = 0
  const now = new Date()

  // Trigger: Overdue tasks (due_date < now, status not done)
  const { data: overdueTasks } = await supabase
    .from('tasks')
    .select('id, title, priority, due_date, status')
    .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
    .in('status', ['todo', 'in_progress'])
    .lt('due_date', now.toISOString())
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true })
    .limit(5)

  // Only generate ONE overdue tasks suggestion (grouped)
  const overdue = overdueTasks ?? []
  if (overdue.length > 0) {
    const triggerKey = 'overdue_task'

    if (await canGenerateSuggestion(supabase, userId, 'tasks', triggerKey, 'overdue_task')) {
      const taskList = overdue
        .slice(0, 3)
        .map((t: { title: string; due_date: string | null }) =>
          `"${t.title}" (venceu ${t.due_date ? new Date(t.due_date).toLocaleDateString('pt-BR') : 'sem prazo'})`)
        .join(', ')

      const id = await persistSuggestion(supabase, userId, {
        type: 'overdue_task',
        trigger_engine: 'tasks',
        trigger_key: triggerKey,
        title: `${overdue.length} tarefa${overdue.length > 1 ? 's' : ''} vencida${overdue.length > 1 ? 's' : ''} aguardando ação`,
        body: `Existem ${overdue.length} tarefa(s) com prazo vencido: ${taskList}${overdue.length > 3 ? ' e mais.' : '.'}`,
        reason: `Tarefas com prazo vencido sem atualização de status`,
        analysis: `A presença de tarefas vencidas sem evolução de status pode indicar sobrecarga ou necessidade de redistribuição de prioridades.`,
        expected_impact: 'Organização da fila de trabalho e redução de pendências acumuladas.',
        priority: overdue.some((t: { priority: string }) => t.priority === 'urgent' || t.priority === 'high') ? 'high' : 'medium',
        action_type: 'open_chat',
        action_payload: { message: `Tenho ${overdue.length} tarefa(s) vencida(s), me ajude a reorganizar minhas prioridades.` },
        expires_in_hours: 24,
        cooldown_hours: 12,
      })

      if (id) created++
    }
  }

  // Trigger: Tasks stalled for more than N days (in_progress, not updated)
  const staleThreshold = new Date(now.getTime() - STALLED_TASK_DAYS * MS_PER_DAY).toISOString()
  const { data: stalledTasks } = await supabase
    .from('tasks')
    .select('id, title, priority, updated_at')
    .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
    .eq('status', 'in_progress')
    .lt('updated_at', staleThreshold)
    .order('updated_at', { ascending: true })
    .limit(5)

  const stalled = stalledTasks ?? []
  if (stalled.length > 0) {
    const triggerKey = 'stalled_task'

    if (await canGenerateSuggestion(supabase, userId, 'tasks', triggerKey, 'stalled_task')) {
      const stalledList = stalled
        .slice(0, 3)
        .map((t: { title: string }) => `"${t.title}"`)
        .join(', ')

      const id = await persistSuggestion(supabase, userId, {
        type: 'stalled_task',
        trigger_engine: 'tasks',
        trigger_key: triggerKey,
        title: `${stalled.length} tarefa${stalled.length > 1 ? 's' : ''} parada${stalled.length > 1 ? 's' : ''} há mais de ${STALLED_TASK_DAYS} dias`,
        body: `As seguintes tarefas estão em andamento mas sem atualização há mais de ${STALLED_TASK_DAYS} dias: ${stalledList}.`,
        reason: `Tarefas com status "em andamento" sem movimentação por período prolongado`,
        analysis: `Tarefas paradas por muito tempo podem indicar bloqueios não registrados, mudança de prioridade ou necessidade de replanejar o escopo.`,
        expected_impact: 'Desbloqueio de tarefas e manutenção do fluxo de trabalho.',
        priority: 'medium',
        action_type: 'open_chat',
        action_payload: { message: `Tenho ${stalled.length} tarefa(s) parada(s) há mais de ${STALLED_TASK_DAYS} dias, me ajude a revisar e replanejar.` },
        expires_in_hours: 48,
        cooldown_hours: 24,
      })

      if (id) created++
    }
  }

  return created
}

// ---------------------------------------------------------------------------
// Engine 4 — Academic
// ---------------------------------------------------------------------------

async function runAcademicEngine(
  supabase: AppSupabaseClient,
  userId: string,
  courseIds: string[],
): Promise<number> {
  if (courseIds.length === 0) return 0
  let created = 0

  // Trigger: Classes (turmas) with no follow-up action in the last N days
  const cutoff14 = new Date(Date.now() - CUTOFF_DAYS_ACADEMIC * MS_PER_DAY).toISOString()

  const { data: userCourses } = await supabase
    .from('user_courses')
    .select('course_id, courses(id, name)')
    .eq('user_id', userId)
    .eq('role', 'tutor')
    .limit(10)

  for (const uc of userCourses ?? []) {
    const course = normalizeRelation(uc.courses)
    if (!course?.id || !course.name) continue

    const triggerKey = 'class_no_followup'
    const entityId = course.id

    if (!(await canGenerateSuggestion(supabase, userId, 'academic', triggerKey, 'class_no_followup', entityId))) continue

    // Check if there are any student actions in this course recently
    const { data: courseStudents } = await supabase
      .from('student_courses')
      .select('student_id')
      .eq('course_id', entityId)
      .limit(100)

    const studentIds = (courseStudents ?? []).map((s: { student_id: string }) => s.student_id)
    if (studentIds.length === 0) continue

    const { count: recentActions } = await supabase
      .from('student_actions')
      .select('*', { count: 'exact', head: true })
      .in('student_id', studentIds)
      .gte('created_at', cutoff14)

    if ((recentActions ?? 0) > 0) continue // has recent follow-up

    const id = await persistSuggestion(supabase, userId, {
      type: 'class_no_followup',
      trigger_engine: 'academic',
      trigger_key: triggerKey,
      title: `Turma sem acompanhamento: ${course.name}`,
      body: `A turma "${course.name}" não registra nenhuma ação de acompanhamento nos últimos ${CUTOFF_DAYS_ACADEMIC} dias.`,
      reason: `Turma sem registro de acompanhamento por ${CUTOFF_DAYS_ACADEMIC} dias`,
      analysis: `Ausência prolongada de acompanhamento pode indicar que estudantes não estão recebendo suporte pedagógico adequado, aumentando riscos acadêmicos silenciosos.`,
      expected_impact: 'Identificação precoce de dificuldades e retomada do acompanhamento contínuo.',
      priority: 'medium',
      entity_type: 'course',
      entity_id: entityId,
      entity_name: course.name,
      action_type: 'create_task',
      action_payload: {
        title: `Acompanhar turma: ${course.name}`,
        description: `Realizar acompanhamento geral da turma "${course.name}". Verificar engajamento, participação e identificar alunos que precisam de atenção.`,
        priority: 'medium',
        tags: ['turma', 'acompanhamento'],
      },
      expires_in_hours: 48,
      cooldown_hours: 72,
    })

    if (id) created++
  }

  return created
}

// ---------------------------------------------------------------------------
// Engine 5 — Operational
// ---------------------------------------------------------------------------

async function runOperationalEngine(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<number> {
  let created = 0

  // Trigger: Old pending tasks in legacy pending_tasks table (> N days)
  const cutoff21 = new Date(Date.now() - CUTOFF_DAYS_OPERATIONAL * MS_PER_DAY).toISOString()

  const { data: oldPending } = await supabase
    .from('pending_tasks')
    .select('id, title, created_at')
    .or(`created_by_user_id.eq.${userId},assigned_to_user_id.eq.${userId}`)
    .in('status', ['aberta', 'em_andamento'])
    .lt('created_at', cutoff21)
    .order('created_at', { ascending: true })
    .limit(5)

  const old = oldPending ?? []
  if (old.length > 0) {
    const triggerKey = 'old_pending'

    if (await canGenerateSuggestion(supabase, userId, 'operational', triggerKey, 'old_pending')) {
      const pendingList = old
        .slice(0, 3)
        .map((p: { title: string }) => `"${p.title}"`)
        .join(', ')

      const id = await persistSuggestion(supabase, userId, {
        type: 'old_pending',
        trigger_engine: 'operational',
        trigger_key: triggerKey,
        title: `${old.length} pendência${old.length > 1 ? 's' : ''} operacional${old.length > 1 ? 'ais' : ''} antiga${old.length > 1 ? 's' : ''}`,
        body: `Existem ${old.length} pendência(s) com mais de ${CUTOFF_DAYS_OPERATIONAL} dias sem resolução: ${pendingList}.`,
        reason: `Pendências operacionais sem movimentação por período prolongado`,
        analysis: `Pendências antigas acumuladas podem indicar processos interrompidos ou demandam revisão de prioridade e redistribuição.`,
        expected_impact: 'Limpeza de backlog e resolução de processos parados.',
        priority: 'medium',
        action_type: 'open_chat',
        action_payload: { message: 'Tenho pendências antigas acumuladas. Me ajude a revisar e priorizar as mais urgentes.' },
        expires_in_hours: 48,
        cooldown_hours: 24,
      })

      if (id) created++
    }
  }

  return created
}

// ---------------------------------------------------------------------------
// Engine 6 — Platform Usage
// ---------------------------------------------------------------------------

async function runPlatformUsageEngine(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<number> {
  let created = 0

  // Trigger: User hasn't created any calendar events in the past N days
  const cutoffPlatform = new Date(Date.now() - CUTOFF_DAYS_PLATFORM_USAGE * MS_PER_DAY).toISOString()
  const triggerKey = 'unused_module_calendar'

  if (await canGenerateSuggestion(supabase, userId, 'platform_usage', triggerKey, 'unused_module')) {
    const { count: recentEvents } = await supabase
      .from('calendar_events')
      .select('*', { count: 'exact', head: true })
      .eq('owner', userId)
      .gte('created_at', cutoffPlatform)

    if ((recentEvents ?? 0) === 0) {
      const id = await persistSuggestion(supabase, userId, {
        type: 'unused_module',
        trigger_engine: 'platform_usage',
        trigger_key: triggerKey,
        title: 'Agenda sem uso recente — organize seus compromissos',
        body: 'Você não registrou nenhum evento na agenda nos últimos 21 dias. Manter a agenda atualizada ajuda a planejar preparações e evitar conflitos.',
        reason: 'Nenhum evento de agenda criado nos últimos 21 dias',
        analysis: 'A ausência de uso da agenda pode indicar que compromissos estão sendo geridos fora da plataforma, reduzindo a visibilidade operacional e dificultando preparações automáticas.',
        expected_impact: 'Melhor planejamento e preparo para compromissos, com sugestões automáticas de preparação.',
        priority: 'low',
        action_type: 'open_chat',
        action_payload: { message: 'Me ajude a organizar minha agenda com os próximos eventos e compromissos.' },
        expires_in_hours: 72,
        cooldown_hours: 168, // 7 days
      })

      if (id) created++
    }
  }

  return created
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface EngineRunResult {
  message: string
  engines_run: number
  suggestions_created: number
  details: Record<TriggerEngine, number>
}

export async function runEngines(
  userId: string,
  supabase: AppSupabaseClient,
): Promise<EngineRunResult> {
  // Get user's course IDs for engines that need them
  const { data: userCourseRows } = await supabase
    .from('user_courses')
    .select('course_id')
    .eq('user_id', userId)
    .eq('role', 'tutor')

  const courseIds = (userCourseRows ?? []).map((r: { course_id: string }) => r.course_id)

  const [comm, agenda, tasks, academic, operational, platformUsage] = await Promise.all([
    runCommunicationEngine(supabase, userId, courseIds),
    runAgendaEngine(supabase, userId),
    runTasksEngine(supabase, userId),
    runAcademicEngine(supabase, userId, courseIds),
    runOperationalEngine(supabase, userId),
    runPlatformUsageEngine(supabase, userId),
  ])

  const total = comm + agenda + tasks + academic + operational + platformUsage

  return {
    message: `${total} proactive suggestion(s) generated across 6 engines`,
    engines_run: 6,
    suggestions_created: total,
    details: {
      communication: comm,
      agenda,
      tasks,
      academic,
      operational,
      platform_usage: platformUsage,
    },
  }
}
