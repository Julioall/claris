/**
 * Claris IA — Tool executors.
 * Each function corresponds to a tool defined in tools.ts.
 * All queries are scoped to the authenticated user's data.
 */
import { createServiceClient } from '../db/mod.ts'
import type { Tables } from '../db/mod.ts'
import {
  finalizeJob,
  findJobForUser,
  listPendingRecipients,
  markJobProcessing,
  markJobProgress,
  markRecipientFailed,
  markRecipientSent,
} from '../domain/bulk-messaging/repository.ts'
import { callMoodleApi } from '../moodle/mod.ts'

export interface ToolCallArgs {
  event_type?: string
  title?: string
  description?: string
  severity?: 'info' | 'warning' | 'critical'
  risk_levels?: string[]
  student_name_query?: string
  student_id?: string
  limit?: number
  status?: string
  student_name?: string
  audience?: 'students_at_risk' | 'students_with_pending_activities' | 'course_students'
  message?: string
  course_name_query?: string
  template_id?: string
  template_title_query?: string
  school?: string
  course?: string
  class_name?: string
  uc?: string
  student_status?: 'ativo' | 'concluido' | 'suspenso' | 'inativo'
  category?: string
  job_id?: string
  // Task fields
  task_id?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  due_date?: string
  entity_type?: 'student' | 'course' | 'uc' | 'class' | 'custom'
  entity_id?: string
  origin_reason?: string
  tags?: string[]
  // Calendar/event fields
  event_id?: string
  start_at?: string
  end_at?: string
  all_day?: boolean
  location?: string
  type?: 'manual' | 'webclass' | 'meeting' | 'alignment' | 'delivery' | 'other'
  related_entity_type?: 'student' | 'course' | 'uc' | 'class' | 'custom'
  related_entity_id?: string
  ia_source?: 'manual' | 'ia' | 'sugestao_confirmada'
  start_date?: string
  end_date?: string
}

export interface ToolExecutionContext {
  latestUserMessage: string
  moodleUrl?: string
  moodleToken?: string
  actionKind?: 'quick_reply'
  actionJobId?: string
}

export async function executeToolCall(
  toolName: string,
  args: ToolCallArgs,
  userId: string,
  context: ToolExecutionContext,
): Promise<unknown> {
  const supabase = createServiceClient()

  switch (toolName) {
    case 'get_dashboard_summary':
      return getDashboardSummary(userId, supabase)
    case 'get_students_at_risk':
      return getStudentsAtRisk(userId, args, supabase)
    case 'get_pending_tasks':
      return getPendingTasks(userId, args, supabase)
    case 'get_student_details':
      return getStudentDetails(userId, args.student_name ?? '', supabase)
    case 'get_activities_to_review':
      return getActivitiesToReview(userId, args, supabase)
    case 'find_students_for_messaging':
      return findStudentsForMessaging(userId, args, supabase)
    case 'prepare_single_student_message_send':
      return prepareSingleStudentMessageSend(userId, args, supabase)
    case 'confirm_single_student_message_send':
      return confirmSingleStudentMessageSend(userId, args, context, supabase)
    case 'list_message_templates':
      return listMessageTemplates(userId, args, supabase)
    case 'get_notifications':
      return getNotifications(userId, args, supabase)
    case 'notify_user':
      return notifyUser(userId, args, supabase)
    case 'prepare_bulk_message_send':
      return prepareBulkMessageSend(userId, args, supabase)
    case 'confirm_bulk_message_send':
      return confirmBulkMessageSend(userId, args, context, supabase)
    case 'cancel_bulk_message_send':
      return cancelBulkMessageSend(userId, args, supabase)
    // Task management
    case 'create_task':
      return createTask(userId, args, supabase)
    case 'update_task':
      return updateTask(userId, args, supabase)
    case 'change_task_status':
      return changeTaskStatus(userId, args, supabase)
    case 'list_tasks':
      return listTasks(userId, args, supabase)
    // Calendar / agenda management
    case 'create_event':
      return createEvent(userId, args, supabase)
    case 'update_event':
      return updateEvent(userId, args, supabase)
    case 'delete_event':
      return deleteEvent(userId, args, supabase)
    case 'list_events':
      return listEvents(userId, args, supabase)
    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

// ---------------------------------------------------------------------------

type Supabase = ReturnType<typeof createServiceClient>
type UserCourseRow = Pick<Tables<'user_courses'>, 'course_id'>
type StudentCourseRow = Pick<Tables<'student_courses'>, 'student_id'>
type StudentBasicRow = Pick<Tables<'students'>, 'id' | 'moodle_user_id' | 'full_name' | 'email' | 'current_risk_level'>
type CourseBasicRow = Pick<Tables<'courses'>, 'id'>

async function getUserCourseIds(userId: string, supabase: Supabase): Promise<string[]> {
  const { data } = await supabase
    .from('user_courses')
    .select('course_id')
    .eq('user_id', userId)
    .eq('role', 'tutor')
  return (data ?? []).map((r: UserCourseRow) => r.course_id)
}

async function getStudentIdsInCourses(courseIds: string[], supabase: Supabase): Promise<string[]> {
  if (courseIds.length === 0) return []
  const { data } = await supabase
    .from('student_courses')
    .select('student_id')
    .in('course_id', courseIds)
  const rawIds = (data ?? []).map((row: { student_id?: unknown }) => row.student_id)
  const studentIds: string[] = []

  for (const id of rawIds) {
    if (typeof id === 'string') {
      studentIds.push(id)
    }
  }

  return Array.from(new Set(studentIds))
}

// ---------------------------------------------------------------------------

async function getDashboardSummary(userId: string, supabase: Supabase) {
  const courseIds = await getUserCourseIds(userId, supabase)

  if (courseIds.length === 0) {
    return {
      courses: 0,
      students: { total: 0, normal: 0, atencao: 0, risco: 0, critico: 0, inativo: 0 },
      pending_tasks: { total: 0, aberta: 0, em_andamento: 0 },
      activities_to_review: 0,
    }
  }

  // Students with risk levels (deduplicated across courses)
  const { data: studentCourses } = await supabase
    .from('student_courses')
    .select('student_id, students(current_risk_level)')
    .in('course_id', courseIds)

  const uniqueStudents = new Map<string, string>()
  for (const sc of studentCourses ?? []) {
    if (sc.student_id && !uniqueStudents.has(sc.student_id)) {
      const students = sc.students as { current_risk_level?: string | null } | { current_risk_level?: string | null }[] | null
      const studentRecord = Array.isArray(students) ? students[0] : students
      uniqueStudents.set(
        sc.student_id,
        studentRecord?.current_risk_level ?? 'normal',
      )
    }
  }

  const riskCounts = { normal: 0, atencao: 0, risco: 0, critico: 0, inativo: 0 }
  for (const level of uniqueStudents.values()) {
    if (level in riskCounts) riskCounts[level as keyof typeof riskCounts]++
  }

  // Pending tasks
  const { data: tasks } = await supabase
    .from('pending_tasks')
    .select('status')
    .or(`created_by_user_id.eq.${userId},assigned_to_user_id.eq.${userId}`)
    .in('status', ['aberta', 'em_andamento'])

  const taskCounts = { aberta: 0, em_andamento: 0 }
  for (const t of tasks ?? []) {
    if (t.status === 'aberta') taskCounts.aberta++
    else if (t.status === 'em_andamento') taskCounts.em_andamento++
  }

  // Activities to review
  const studentIds = Array.from(uniqueStudents.keys())
  let activitiesToReview = 0
  if (studentIds.length > 0) {
    const { count } = await supabase
      .from('student_activities')
      .select('*', { count: 'exact', head: true })
      .in('student_id', studentIds)
      .not('submitted_at', 'is', null)
      .is('graded_at', null)
    activitiesToReview = count ?? 0
  }

  return {
    courses: courseIds.length,
    students: { total: uniqueStudents.size, ...riskCounts },
    pending_tasks: { total: taskCounts.aberta + taskCounts.em_andamento, ...taskCounts },
    activities_to_review: activitiesToReview,
  }
}

// ---------------------------------------------------------------------------

async function getStudentsAtRisk(userId: string, args: ToolCallArgs, supabase: Supabase) {
  const riskLevels = args.risk_levels ?? ['atencao', 'risco', 'critico']
  const limit = Math.min(args.limit ?? 10, 50)

  const courseIds = await getUserCourseIds(userId, supabase)
  const studentIds = await getStudentIdsInCourses(courseIds, supabase)
  if (studentIds.length === 0) return []

  const { data } = await supabase
    .from('students')
    .select('full_name, current_risk_level, risk_reasons, last_access, email')
    .in('id', studentIds)
    .in('current_risk_level', riskLevels)
    .order('current_risk_level', { ascending: false })
    .limit(limit)

  return data ?? []
}

// ---------------------------------------------------------------------------

async function getPendingTasks(userId: string, args: ToolCallArgs, supabase: Supabase) {
  const limit = Math.min(args.limit ?? 10, 50)

  let query = supabase
    .from('pending_tasks')
    .select(`
      title, status, priority, due_date, description,
      students(full_name),
      courses(short_name)
    `)
    .or(`created_by_user_id.eq.${userId},assigned_to_user_id.eq.${userId}`)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(limit)

  if (args.status) {
    query = query.eq('status', args.status)
  } else {
    query = query.in('status', ['aberta', 'em_andamento'])
  }

  const { data } = await query
  return data ?? []
}

// ---------------------------------------------------------------------------

async function getStudentDetails(userId: string, studentName: string, supabase: Supabase) {
  if (!studentName.trim()) return { error: 'Nome do aluno não informado.' }

  const courseIds = await getUserCourseIds(userId, supabase)
  const studentIds = await getStudentIdsInCourses(courseIds, supabase)
  if (studentIds.length === 0) return { error: 'Nenhum aluno encontrado nos seus cursos.' }

  const { data: students } = await supabase
    .from('students')
    .select('id, full_name, email, current_risk_level, risk_reasons, last_access, tags')
    .in('id', studentIds)
    .ilike('full_name', `%${studentName}%`)
    .limit(3)

  if (!students || students.length === 0) {
    return { error: `Nenhum aluno encontrado com o nome "${studentName}".` }
  }

  const student = students[0]

  const [tasksResult, gradesResult] = await Promise.all([
    supabase
      .from('pending_tasks')
      .select('title, status, priority, due_date')
      .eq('student_id', student.id)
      .in('status', ['aberta', 'em_andamento'])
      .order('due_date', { ascending: true })
      .limit(5),
    supabase
      .from('student_course_grades')
      .select('grade_percentage, grade_formatted, courses(name)')
      .eq('student_id', student.id)
      .in('course_id', courseIds)
      .limit(5),
  ])

  return {
    ...student,
    pending_tasks: tasksResult.data ?? [],
    grades: gradesResult.data ?? [],
    ...(students.length > 1 && {
      other_matches: students.slice(1).map((s: Pick<Tables<'students'>, 'full_name'>) => s.full_name),
    }),
  }
}

// ---------------------------------------------------------------------------

async function getActivitiesToReview(userId: string, args: ToolCallArgs, supabase: Supabase) {
  const limit = Math.min(args.limit ?? 10, 50)

  const courseIds = await getUserCourseIds(userId, supabase)
  if (courseIds.length === 0) return []

  const { data } = await supabase
    .from('student_activities')
    .select(`
      activity_name, activity_type, submitted_at, due_date,
      students(full_name, current_risk_level),
      courses(short_name)
    `)
    .in('course_id', courseIds)
    .not('submitted_at', 'is', null)
    .is('graded_at', null)
    .order('submitted_at', { ascending: true })
    .limit(limit)

  return data ?? []
}

// ---------------------------------------------------------------------------

interface StudentMessagingCandidate {
  student_id: string
  full_name: string
  moodle_user_id: string
  courses: string[]
}

async function findStudentsForMessaging(
  userId: string,
  args: ToolCallArgs,
  supabase: Supabase,
): Promise<{ total: number; students: StudentMessagingCandidate[] } | { error: string }> {
  const query = (args.student_name_query ?? '').trim()
  if (!query) {
    return { error: 'Campo student_name_query é obrigatório.' }
  }

  const limit = Math.min(args.limit ?? 10, 30)
  const courseIds = await getUserCourseIds(userId, supabase)
  if (courseIds.length === 0) {
    return { total: 0, students: [] }
  }

  const { data: studentCourseRows } = await supabase
    .from('student_courses')
    .select('student_id, courses(name)')
    .in('course_id', courseIds)

  const studentIds = Array.from(new Set((studentCourseRows ?? []).map((row: { student_id?: string }) => row.student_id).filter(Boolean))) as string[]
  if (studentIds.length === 0) {
    return { total: 0, students: [] }
  }

  const { data: students } = await supabase
    .from('students')
    .select('id, full_name, moodle_user_id')
    .in('id', studentIds)
    .ilike('full_name', `%${query}%`)
    .limit(limit)

  const coursesByStudent = new Map<string, Set<string>>()
  for (const row of studentCourseRows ?? []) {
    const studentId = (row as { student_id?: string }).student_id
    if (!studentId) continue

    const courseName = (((row as { courses?: { name?: string | null } | null }).courses)?.name ?? '').trim()
    if (!courseName) continue

    const existing = coursesByStudent.get(studentId) ?? new Set<string>()
    existing.add(courseName)
    coursesByStudent.set(studentId, existing)
  }

  const result: StudentMessagingCandidate[] = (students ?? []).map((student: { id: string; full_name: string; moodle_user_id: string }) => ({
    student_id: student.id,
    full_name: student.full_name,
    moodle_user_id: student.moodle_user_id,
    courses: Array.from(coursesByStudent.get(student.id) ?? []),
  }))

  return {
    total: result.length,
    students: result,
  }
}

async function resolveSingleStudentForMessaging(
  userId: string,
  args: ToolCallArgs,
  supabase: Supabase,
): Promise<{ student: StudentMessagingCandidate } | { requires_disambiguation: true; candidates: StudentMessagingCandidate[] } | { error: string }> {
  const explicitStudentId = (args.student_id ?? '').trim()

  if (explicitStudentId) {
    const courseIds = await getUserCourseIds(userId, supabase)
    if (courseIds.length === 0) {
      return { error: 'Você não possui cursos vinculados para envio.' }
    }

    const { data: studentInScope } = await supabase
      .from('student_courses')
      .select('student_id')
      .in('course_id', courseIds)
      .eq('student_id', explicitStudentId)
      .limit(1)

    if (!studentInScope || studentInScope.length === 0) {
      return { error: 'Aluno não encontrado no escopo dos seus cursos.' }
    }

    const candidatesResult = await findStudentsForMessaging(userId, { student_name_query: '' + explicitStudentId, limit: 1 }, supabase)
    if ('error' in candidatesResult) {
      const { data: studentData } = await supabase
        .from('students')
        .select('id, full_name, moodle_user_id')
        .eq('id', explicitStudentId)
        .maybeSingle()

      if (!studentData) {
        return { error: 'Aluno não encontrado.' }
      }

      return {
        student: {
          student_id: studentData.id,
          full_name: studentData.full_name,
          moodle_user_id: studentData.moodle_user_id,
          courses: [],
        },
      }
    }

    const directMatch = candidatesResult.students.find((candidate) => candidate.student_id === explicitStudentId)
    if (directMatch) return { student: directMatch }

    const { data: studentData } = await supabase
      .from('students')
      .select('id, full_name, moodle_user_id')
      .eq('id', explicitStudentId)
      .maybeSingle()

    if (!studentData) {
      return { error: 'Aluno não encontrado.' }
    }

    return {
      student: {
        student_id: studentData.id,
        full_name: studentData.full_name,
        moodle_user_id: studentData.moodle_user_id,
        courses: [],
      },
    }
  }

  const studentNameQuery = (args.student_name_query ?? '').trim()
  if (!studentNameQuery) {
    return { error: 'Informe student_id ou student_name_query para envio individual.' }
  }

  // Try progressively shorter variants in case the LLM appended course/extra text to the name
  const queryVariants = [studentNameQuery]
  const words = studentNameQuery.split(/\s+/)
  if (words.length > 3) queryVariants.push(words.slice(0, 3).join(' '))
  if (words.length > 2) queryVariants.push(words.slice(0, 2).join(' '))

  let result: Awaited<ReturnType<typeof findStudentsForMessaging>> | null = null
  for (const variant of queryVariants) {
    const r = await findStudentsForMessaging(userId, { student_name_query: variant, limit: args.limit ?? 10 }, supabase)
    if (!('error' in r) && r.students.length > 0) { result = r; break }
    if (!result) result = r
  }

  if (!result || 'error' in result) return result ?? { error: 'Falha ao buscar aluno.' }

  if (result.students.length === 0) {
    return { error: `Nenhum aluno encontrado com nome semelhante a "${studentNameQuery}".` }
  }

  if (result.students.length > 1) {
    return {
      requires_disambiguation: true,
      candidates: result.students,
    }
  }

  return { student: result.students[0] }
}

async function prepareSingleStudentMessageSend(
  userId: string,
  args: ToolCallArgs,
  supabase: Supabase,
): Promise<unknown> {
  const message = (args.message ?? '').trim()
  if (!message) {
    return { error: 'Campo message é obrigatório para envio individual.' }
  }

  const resolvedStudent = await resolveSingleStudentForMessaging(userId, args, supabase)
  if ('error' in resolvedStudent) return resolvedStudent
  if ('requires_disambiguation' in resolvedStudent) {
    return {
      success: false,
      requires_disambiguation: true,
      total_candidates: resolvedStudent.candidates.length,
      candidates: resolvedStudent.candidates.map((candidate) => ({
        student_id: candidate.student_id,
        full_name: candidate.full_name,
        courses: candidate.courses,
      })),
      hint: 'Informe o student_id correto para preparar o envio individual.',
    }
  }

  const { student } = resolvedStudent

  const { data: duplicateJob, error: duplicateJobError } = await supabase
    .from('bulk_message_jobs')
    .select('id, status, created_at')
    .eq('user_id', userId)
    .eq('message_content', message)
    .eq('total_recipients', 1)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (duplicateJobError) {
    return { error: 'Falha ao validar duplicidade do envio individual.' }
  }

  if (duplicateJob) {
    return {
      success: true,
      duplicate_prevented: true,
      existing_job_id: duplicateJob.id,
      message: 'Já existe envio individual semelhante pendente/processando.',
      requires_confirmation: false,
    }
  }

  const { data: job, error: jobError } = await supabase
    .from('bulk_message_jobs')
    .insert({
      user_id: userId,
      message_content: message,
      total_recipients: 1,
      status: 'pending',
    })
    .select('id')
    .single()

  if (jobError || !job) {
    return { error: 'Falha ao criar job de envio individual.' }
  }

  const { error: recipientError } = await supabase
    .from('bulk_message_recipients')
    .insert({
      job_id: job.id,
      student_id: student.student_id,
      moodle_user_id: student.moodle_user_id,
      student_name: student.full_name,
      personalized_message: message,
      status: 'pending',
    })

  if (recipientError) {
    return { error: 'Falha ao registrar destinatário do envio individual.' }
  }

  return {
    success: true,
    prepared: true,
    job_id: job.id,
    total_recipients: 1,
    target_student: {
      student_id: student.student_id,
      full_name: student.full_name,
      courses: student.courses,
    },
    message_preview: message,
    requires_confirmation: true,
    confirmation_hint:
      'Peça confirmação explícita do usuário antes de executar confirm_single_student_message_send (ex.: “confirmo o envio”).',
  }
}

async function confirmSingleStudentMessageSend(
  userId: string,
  args: ToolCallArgs,
  context: ToolExecutionContext,
  supabase: Supabase,
): Promise<unknown> {
  return confirmBulkMessageSend(userId, args, context, supabase)
}

async function cancelBulkMessageSend(
  userId: string,
  args: ToolCallArgs,
  supabase: Supabase,
): Promise<unknown> {
  const jobId = (args.job_id ?? '').trim()
  if (!jobId) {
    return { error: 'Campo job_id é obrigatório para cancelar o envio.' }
  }

  const job = await findJobForUser(supabase, jobId, userId)
  if (!job) {
    return { error: 'Job não encontrado ou não pertence ao usuário.' }
  }

  if (job.status !== 'pending') {
    return {
      error: `Job possui status "${job.status}" e não pode ser cancelado. Apenas jobs pendentes podem ser cancelados.`,
      job_id: jobId,
      current_status: job.status,
    }
  }

  const { error: updateError } = await supabase
    .from('bulk_message_jobs')
    .update({ status: 'cancelled' as const })
    .eq('id', jobId)
    .eq('user_id', userId)
    .eq('status', 'pending')

  if (updateError) {
    return { error: 'Falha ao cancelar o job de envio.' }
  }

  return {
    success: true,
    cancelled: true,
    job_id: jobId,
    message: 'Envio cancelado com sucesso.',
  }
}

// ---------------------------------------------------------------------------

const TEMPLATE_VARIABLE_REGEX = /\{([a-z_]+)\}/g
const CATEGORY_CONTEXT_VARIABLES = new Set(['escola', 'curso', 'turma'])
const UC_CONTEXT_VARIABLES = new Set(['unidade_curricular', 'nota_media', 'atividades_pendentes'])

interface ParsedCourseCategory {
  school: string
  course: string
  className: string
  uc: string
}

function parseCourseCategoryPath(category?: string | null): ParsedCourseCategory {
  if (!category) {
    return { school: '', course: '', className: '', uc: '' }
  }

  const parts = category.includes(' > ')
    ? category.split(' > ').map((part) => part.trim()).filter(Boolean)
    : category.includes(' / ')
      ? category.split(' / ').map((part) => part.trim()).filter(Boolean)
      : [category.trim()].filter(Boolean)

  if (category.includes(' > ') && parts.length >= 4) {
    return {
      school: parts[1] || '',
      course: parts[2] || '',
      className: parts[3] || '',
      uc: parts[4] || '',
    }
  }

  return {
    school: parts[0] || '',
    course: parts[1] || '',
    className: parts[2] || '',
    uc: parts[3] || '',
  }
}

function extractTemplateVariables(content: string): string[] {
  const matches = content.match(TEMPLATE_VARIABLE_REGEX) || []
  return Array.from(new Set(matches.map((value) => value.replace(/[{}]/g, ''))))
}

function resolveVariables(content: string, values: Record<string, string>): string {
  return content.replace(TEMPLATE_VARIABLE_REGEX, (_, key: string) => values[key] ?? `{${key}}`)
}

function formatDateLabel(value?: string | null): string {
  if (!value) return 'Sem registro'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sem registro'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date)
}

function formatRiskLevel(value?: string | null): string {
  const levels: Record<string, string> = {
    normal: 'Normal',
    atencao: 'Atencao',
    risco: 'Risco',
    critico: 'Critico',
    inativo: 'Inativo',
  }
  return levels[String(value || '').toLowerCase()] || 'Sem classificacao'
}

function formatGrade(grade?: { grade_formatted?: string | null; grade_percentage?: number | null }): string {
  if (grade?.grade_formatted) return grade.grade_formatted
  if (grade?.grade_percentage != null) return `${Number(grade.grade_percentage).toFixed(1)}%`
  return 'Sem nota'
}

function buildTemplateContextValidationErrors(args: ToolCallArgs, templateContent: string): string[] {
  const variables = extractTemplateVariables(templateContent)
  const errors: string[] = []

  const usesCategoryVariable = variables.some((variable) => CATEGORY_CONTEXT_VARIABLES.has(variable))
  const usesUcVariable = variables.some((variable) => UC_CONTEXT_VARIABLES.has(variable))

  if (usesCategoryVariable) {
    if (!args.school) errors.push('Template exige contexto de escola (`school`).')
    if (!args.course) errors.push('Template exige contexto de curso (`course`).')
    if (!args.class_name) errors.push('Template exige contexto de turma (`class_name`).')
  }

  if (usesUcVariable && !args.uc) {
    errors.push('Template exige Unidade Curricular (`uc`) para resolver nota/pêndencias.')
  }

  return errors
}

async function listMessageTemplates(userId: string, args: ToolCallArgs, supabase: Supabase) {
  const limit = Math.min(args.limit ?? 20, 50)

  const buildQuery = (category?: string) => {
    let q = supabase
      .from('message_templates')
      .select('id, title, category, content, is_favorite')
      .eq('user_id', userId)
      .order('is_favorite', { ascending: false })
      .order('title', { ascending: true })
      .limit(limit)
    if (category) q = q.eq('category', category)
    return q
  }

  const { data, error } = await buildQuery(args.category)
  if (error) return { error: 'Falha ao listar modelos de mensagem.' }

  // If a category filter was applied and nothing was found, retry without filter
  if (args.category && (data ?? []).length === 0) {
    const { data: allData, error: allError } = await buildQuery()
    if (!allError && (allData ?? []).length > 0) {
      return (allData ?? []).map((template: { id: string; title: string; category: string | null; is_favorite: boolean | null; content: string }) => ({
        id: template.id,
        title: template.title,
        category: template.category,
        is_favorite: template.is_favorite,
        variables: extractTemplateVariables(template.content),
      }))
    }
  }

  return (data ?? []).map((template: { id: string; title: string; category: string | null; is_favorite: boolean | null; content: string }) => ({
    id: template.id,
    title: template.title,
    category: template.category,
    is_favorite: template.is_favorite,
    variables: extractTemplateVariables(template.content),
  }))
}

async function notifyUser(userId: string, args: ToolCallArgs, supabase: Supabase) {
  const title = String(args.title || '').trim()
  const description = String(args.description || '').trim()
  const severity = String(args.severity || 'info')

  if (!title || !description) {
    return {
      error: 'notify_user requer título e descrição.',
      hint: 'Use os campos `title` e `description`.',
    }
  }

  const { error } = await supabase
    .from('activity_feed')
    .insert({
      user_id: userId,
      event_type: 'claris_notification',
      title,
      description,
      metadata: { severity },
    })

  if (error) {
    return { error: 'Falha ao criar notificação interna.' }
  }

  return {
    success: true,
    notified: true,
    title,
    severity,
  }
}

async function getNotifications(userId: string, args: ToolCallArgs, supabase: Supabase) {
  const limit = Math.min(args.limit ?? 10, 50)

  let query = supabase
    .from('activity_feed')
    .select('id, title, description, event_type, created_at, metadata')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (args.event_type) {
    query = query.eq('event_type', args.event_type)
  }

  const { data, error } = await query
  if (error) {
    return { error: 'Falha ao listar notificações.' }
  }

  return data ?? []
}

// ---------------------------------------------------------------------------

const MAX_BULK_RECIPIENTS = 200
const BATCH_SIZE = 5
const DELAY_BETWEEN_BATCHES_MS = 1000

function isExplicitSendConfirmation(text: string, jobId: string): boolean {
  const normalized = text.toLowerCase()
  const confirmationTermFound = [
    'confirmo',
    'confirmado',
    'confirmei',
    'pode enviar',
    'confirmar envio',
    'confirmar',
    'autorizo envio',
    'sim, enviar',
    'sim confirmo',
  ].some((term) => normalized.includes(term))

  if (!confirmationTermFound) return false

  return normalized.includes(jobId.toLowerCase())
}

async function getRecipientsForAudience(
  userId: string,
  args: ToolCallArgs,
  supabase: Supabase,
): Promise<Array<{ student_id: string; moodle_user_id: string; full_name: string; email?: string | null; current_risk_level?: string | null }>> {
  const audience = args.audience
  const limit = Math.min(args.limit ?? 50, MAX_BULK_RECIPIENTS)

  const courseIds = await getUserCourseIds(userId, supabase)
  if (courseIds.length === 0) return []

  let allowedByStatus: Set<string> | null = null
  if (args.student_status && args.student_status !== 'inativo') {
    const { data: statusRows } = await supabase
      .from('student_courses')
      .select('student_id')
      .in('course_id', courseIds)
      .eq('enrollment_status', args.student_status)

    const ids = (statusRows ?? [])
      .map((row: StudentCourseRow) => row.student_id)
      .filter((id: unknown): id is string => typeof id === 'string')

    allowedByStatus = new Set(ids)
  }

  const applyStatusFilter = (rows: StudentBasicRow[]) => {
    if (!allowedByStatus) return rows
    return rows.filter((row) => allowedByStatus?.has(row.id))
  }

  if (audience === 'students_at_risk') {
    const studentIds = await getStudentIdsInCourses(courseIds, supabase)
    if (studentIds.length === 0) return []

    const { data } = await supabase
      .from('students')
      .select('id, moodle_user_id, full_name, email, current_risk_level')
      .in('id', studentIds)
      .in('current_risk_level', ['atencao', 'risco', 'critico'])
      .limit(limit)

    return applyStatusFilter((data ?? []) as StudentBasicRow[]).map((student: StudentBasicRow) => ({
      student_id: student.id,
      moodle_user_id: student.moodle_user_id,
      full_name: student.full_name,
      email: student.email,
      current_risk_level: student.current_risk_level,
    }))
  }

  if (audience === 'students_with_pending_activities') {
    const { data: pendingRows } = await supabase
      .from('student_activities')
      .select('student_id')
      .in('course_id', courseIds)
      .is('submitted_at', null)

    const pendingStudentIds = [...new Set((pendingRows ?? []).map((row: StudentCourseRow) => row.student_id))]
      .filter((id: unknown): id is string => typeof id === 'string')
      .slice(0, limit)
    if (pendingStudentIds.length === 0) return []

    const { data: students } = await supabase
      .from('students')
      .select('id, moodle_user_id, full_name, email, current_risk_level')
      .in('id', pendingStudentIds)

    return applyStatusFilter((students ?? []) as StudentBasicRow[]).map((student: StudentBasicRow) => ({
      student_id: student.id,
      moodle_user_id: student.moodle_user_id,
      full_name: student.full_name,
      email: student.email,
      current_risk_level: student.current_risk_level,
    }))
  }

  if (audience === 'course_students') {
    const query = (args.course_name_query ?? '').trim()
    if (!query) return []

    const { data: matchedCourses } = await supabase
      .from('courses')
      .select('id')
      .in('id', courseIds)
      .ilike('name', `%${query}%`)
      .limit(10)

    const matchedCourseIds = (matchedCourses ?? []).map((course: CourseBasicRow) => course.id)
    if (matchedCourseIds.length === 0) return []

    const { data: studentCourses } = await supabase
      .from('student_courses')
      .select('student_id')
      .in('course_id', matchedCourseIds)

    const studentIds = [...new Set((studentCourses ?? []).map((row: StudentCourseRow) => row.student_id))]
      .filter((id): id is string => typeof id === 'string')
      .slice(0, limit)
    if (studentIds.length === 0) return []

    const { data: students } = await supabase
      .from('students')
      .select('id, moodle_user_id, full_name, email, current_risk_level')
      .in('id', studentIds)

    return applyStatusFilter((students ?? []) as StudentBasicRow[]).map((student: StudentBasicRow) => ({
      student_id: student.id,
      moodle_user_id: student.moodle_user_id,
      full_name: student.full_name,
      email: student.email,
      current_risk_level: student.current_risk_level,
    }))
  }

  return []
}

async function prepareBulkMessageSend(userId: string, args: ToolCallArgs, supabase: Supabase) {
  const audience = args.audience
  const directMessage = (args.message ?? '').trim()
  const templateId = (args.template_id ?? '').trim()
  const templateTitleQuery = (args.template_title_query ?? '').trim()

  if (!audience) {
    return { error: 'Campo audience é obrigatório.' }
  }

  const usingTemplate = Boolean(templateId || templateTitleQuery)

  if (!directMessage && !usingTemplate) {
    return { error: 'Informe `message` ou selecione um modelo (`template_id`/`template_title_query`).' }
  }

  let templateContent = ''
  let templateMeta: { id: string; title: string; category: string | null } | null = null

  if (usingTemplate) {
    let templateQuery = supabase
      .from('message_templates')
      .select('id, title, category, content')
      .eq('user_id', userId)
      .limit(1)

    if (templateId) {
      templateQuery = templateQuery.eq('id', templateId)
    } else {
      templateQuery = templateQuery.ilike('title', `%${templateTitleQuery}%`)
    }

    const { data: templates, error: templateError } = await templateQuery
    if (templateError) {
      return { error: 'Falha ao consultar modelos de mensagem.' }
    }

    if (!templates || templates.length === 0) {
      return { error: 'Modelo de mensagem não encontrado para o usuário.' }
    }

    const selectedTemplate = templates[0]
    templateContent = selectedTemplate.content
    templateMeta = {
      id: selectedTemplate.id,
      title: selectedTemplate.title,
      category: selectedTemplate.category,
    }

    const contextErrors = buildTemplateContextValidationErrors(args, templateContent)
    if (contextErrors.length > 0) {
      return {
        error: 'Contexto insuficiente para usar este modelo.',
        details: contextErrors,
        required_context: {
          school: Boolean(args.school),
          course: Boolean(args.course),
          class_name: Boolean(args.class_name),
          uc: Boolean(args.uc),
        },
      }
    }
  }

  const recipients = await getRecipientsForAudience(userId, args, supabase)

  if (recipients.length === 0) {
    return {
      success: false,
      audience,
      total_recipients: 0,
      error: 'Nenhum destinatário encontrado para o critério informado.',
    }
  }

  const recipientIds = recipients.map((recipient) => recipient.student_id)
  const recipientMap = new Map(recipients.map((recipient) => [recipient.student_id, recipient]))

  const { data: studentCourses } = await supabase
    .from('student_courses')
    .select('student_id, course_id, last_access, courses(name, category)')
    .in('student_id', recipientIds)

  const parsedCoursesByStudent = new Map<string, Array<{
    course_id: string
    course_name: string
    school: string
    course: string
    className: string
    uc: string
    last_access?: string | null
  }>>()

  for (const row of studentCourses ?? []) {
    const courseInfo = row.courses as { name?: string | null; category?: string | null } | null
    const parsed = parseCourseCategoryPath(courseInfo?.category)
    const entry = {
      course_id: row.course_id,
      course_name: courseInfo?.name || '',
      school: parsed.school,
      course: parsed.course,
      className: parsed.className,
      uc: parsed.uc || courseInfo?.name || '',
      last_access: row.last_access,
    }

    const list = parsedCoursesByStudent.get(row.student_id) ?? []
    list.push(entry)
    parsedCoursesByStudent.set(row.student_id, list)
  }

  const filterCourseContext = (course: {
    school: string
    course: string
    className: string
    uc: string
  }) => {
    if (args.school && course.school !== args.school) return false
    if (args.course && course.course !== args.course) return false
    if (args.class_name && course.className !== args.class_name) return false
    if (args.uc && course.uc !== args.uc) return false
    return true
  }

  const selectedContextByStudent = new Map<string, {
    course_id: string
    course_name: string
    school: string
    course: string
    className: string
    uc: string
    last_access?: string | null
  }>()

  for (const recipient of recipients) {
    const studentCoursesForRecipient = (parsedCoursesByStudent.get(recipient.student_id) ?? []).filter(filterCourseContext)
    const selectedContext = studentCoursesForRecipient[0]

    if (!selectedContext && usingTemplate) {
      return {
        error: 'Contexto de curso/turma/UC não encontrado para todos os destinatários com os filtros informados.',
        recipient_example: recipient.full_name,
      }
    }

    if (selectedContext) {
      selectedContextByStudent.set(recipient.student_id, selectedContext)
    }
  }

  const selectedCourseIds = Array.from(new Set(Array.from(selectedContextByStudent.values()).map((ctx) => ctx.course_id)))
  const gradeLookup: Record<string, { grade_formatted?: string | null; grade_percentage?: number | null }> = {}
  const pendingLookup: Record<string, number> = {}

  const buildKey = (studentId: string, courseId: string) => `${studentId}:${courseId}`

  if (selectedCourseIds.length > 0) {
    const [{ data: grades }, { data: activities }] = await Promise.all([
      supabase
        .from('student_course_grades')
        .select('student_id, course_id, grade_formatted, grade_percentage')
        .in('student_id', recipientIds)
        .in('course_id', selectedCourseIds),
      supabase
        .from('student_activities')
        .select('student_id, course_id, submitted_at, completed_at, status')
        .in('student_id', recipientIds)
        .in('course_id', selectedCourseIds)
        .eq('hidden', false),
    ])

    for (const grade of grades ?? []) {
      gradeLookup[buildKey(grade.student_id, grade.course_id)] = {
        grade_formatted: grade.grade_formatted,
        grade_percentage: grade.grade_percentage,
      }
    }

    for (const activity of activities ?? []) {
      const isSubmitted = Boolean(activity.submitted_at)
      const isCompleted = Boolean(activity.completed_at) || ['completed', 'concluida', 'finalizada'].includes(String(activity.status || '').toLowerCase())
      if (isSubmitted || isCompleted) continue

      const key = buildKey(activity.student_id, activity.course_id)
      pendingLookup[key] = (pendingLookup[key] || 0) + 1
    }
  }

  const rows = recipients.map((recipient) => {
    const context = selectedContextByStudent.get(recipient.student_id)
    const key = context ? buildKey(recipient.student_id, context.course_id) : ''

    const personalizedMessage = usingTemplate
      ? resolveVariables(templateContent, {
          nome_aluno: recipient.full_name,
          email_aluno: recipient.email || 'Sem email',
          ultimo_acesso: formatDateLabel(context?.last_access),
          nivel_risco: formatRiskLevel(recipient.current_risk_level),
          nota_media: context ? formatGrade(gradeLookup[key]) : 'Sem nota',
          atividades_pendentes: context ? String(pendingLookup[key] || 0) : '0',
          unidade_curricular: context?.uc || 'N/A',
          turma: context?.className || 'N/A',
          curso: context?.course || 'N/A',
          escola: context?.school || 'N/A',
          nome_tutor: 'Tutor',
        })
      : directMessage

    return {
      student_id: recipient.student_id,
      moodle_user_id: recipient.moodle_user_id,
      student_name: recipient.full_name,
      personalized_message: personalizedMessage,
      status: 'pending' as const,
    }
  })

  const canonicalMessage = usingTemplate ? templateContent : directMessage

  const { data: duplicateJob, error: duplicateJobError } = await supabase
    .from('bulk_message_jobs')
    .select('id, status, created_at')
    .eq('user_id', userId)
    .eq('message_content', canonicalMessage)
    .eq('total_recipients', recipients.length)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (duplicateJobError) {
    return { error: 'Falha ao validar duplicidade de envio.' }
  }

  if (duplicateJob) {
    return {
      success: true,
      duplicate_prevented: true,
      existing_job_id: duplicateJob.id,
      message: 'Envio semelhante já existe na fila/processamento. Nenhum novo job foi criado.',
      requires_confirmation: false,
    }
  }

  const { data: job, error: jobError } = await supabase
    .from('bulk_message_jobs')
    .insert({
      user_id: userId,
      message_content: canonicalMessage,
      total_recipients: recipients.length,
      status: 'pending',
    })
    .select('id')
    .single()

  if (jobError || !job) {
    return { error: 'Falha ao criar job de envio em massa.' }
  }

  const rowsWithJobId = rows.map((row) => ({
    ...row,
    job_id: job.id,
  }))

  const { error: recipientsError } = await supabase
    .from('bulk_message_recipients')
    .insert(rowsWithJobId)

  if (recipientsError) {
    return { error: 'Falha ao criar destinatários do envio em massa.' }
  }

  return {
    success: true,
    prepared: true,
    audience,
    job_id: job.id,
    total_recipients: recipients.length,
    preview_recipients: recipients.slice(0, 5).map((r) => r.full_name),
    message_preview: rows[0]?.personalized_message || canonicalMessage,
    template: templateMeta,
    context: {
      school: args.school,
      course: args.course,
      class_name: args.class_name,
      uc: args.uc,
      student_status: args.student_status,
    },
    requires_confirmation: true,
    confirmation_hint:
      'Peça confirmação explícita do usuário antes de executar confirm_bulk_message_send (ex.: “confirmo o envio”).',
  }
}

async function runBulkMessageJob(
  jobId: string,
  userId: string,
  moodleUrl: string,
  moodleToken: string,
  supabase: Supabase,
) {
  const job = await findJobForUser(supabase, jobId, userId)

  if (!job) return { error: 'Job não encontrado.' }
  if (job.status !== 'pending') {
    return { error: `Job com status ${job.status}. Esperado: pending.` }
  }

  await markJobProcessing(supabase, jobId, new Date().toISOString())

  const recipients = await listPendingRecipients(supabase, jobId)
  if (!recipients || recipients.length === 0) {
    await finalizeJob(supabase, jobId, 'completed', 0, 0, new Date().toISOString())
    return { success: true, sent: 0, failed: 0 }
  }

  let sentCount = job.sent_count || 0
  let failedCount = job.failed_count || 0

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE)

    await Promise.allSettled(
      batch.map(async (recipient) => {
        try {
          const result = await callMoodleApi(moodleUrl, moodleToken, 'core_message_send_instant_messages', {
            'messages[0][touserid]': Number(recipient.moodle_user_id),
            'messages[0][text]': recipient.personalized_message || job.message_content,
            'messages[0][textformat]': 0,
          })

          const messageResult = Array.isArray(result) ? result[0] : result
          if (messageResult?.errormessage) throw new Error(messageResult.errormessage)

          await markRecipientSent(supabase, recipient.id, new Date().toISOString())
          sentCount++
        } catch (error) {
          await markRecipientFailed(
            supabase,
            recipient.id,
            error instanceof Error ? error.message : 'Unknown error',
          )
          failedCount++
        }
      }),
    )

    await markJobProgress(supabase, jobId, sentCount, failedCount)

    if (i + BATCH_SIZE < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS))
    }
  }

  const finalStatus = failedCount === recipients.length ? 'failed' : 'completed'
  await finalizeJob(supabase, jobId, finalStatus, sentCount, failedCount, new Date().toISOString())

  return {
    success: true,
    job_id: jobId,
    status: finalStatus,
    sent: sentCount,
    failed: failedCount,
  }
}

async function confirmBulkMessageSend(
  userId: string,
  args: ToolCallArgs,
  context: ToolExecutionContext,
  supabase: Supabase,
) {
  const jobId = (args.job_id ?? '').trim()
  if (!jobId) {
    return { error: 'Campo job_id é obrigatório para confirmar envio.' }
  }

  const isActionConfirm = context.actionKind === 'quick_reply' && context.actionJobId === jobId
  const isTextConfirm = isExplicitSendConfirmation(context.latestUserMessage, jobId)

  if (!isActionConfirm && !isTextConfirm) {
    return {
      error: 'Confirmação explícita vinculada ao job não detectada.',
      requires_confirmation: true,
      job_id: jobId,
      hint: `Instrua o usuário a CLICAR no botão ✅ Confirmar envio que aparece no chat — NÃO peça para digitar texto. Se os botões não estiverem visíveis no chat, oriente: "confirmo o envio do job ${jobId}".`,
    }
  }

  if (!context.moodleUrl || !context.moodleToken) {
    return {
      error:
        'Sessão Moodle indisponível para envio. Peça para o usuário reautenticar e tentar novamente.',
    }
  }

  return runBulkMessageJob(jobId, userId, context.moodleUrl, context.moodleToken, supabase)
}

// ---------------------------------------------------------------------------
// Task management executors
// ---------------------------------------------------------------------------

async function createTask(userId: string, args: ToolCallArgs, supabase: Supabase) {
  const title = (args.title ?? '').trim()
  if (!title) {
    return { error: 'Campo title é obrigatório para criar uma tarefa.' }
  }

  const insert: Record<string, unknown> = {
    title,
    created_by: userId,
    assigned_to: userId,
    suggested_by_ai: true,
    status: 'todo',
    priority: args.priority ?? 'medium',
  }

  if (args.description) insert.description = args.description.trim()
  if (args.due_date) insert.due_date = args.due_date
  if (args.entity_type) insert.entity_type = args.entity_type
  if (args.entity_id) insert.entity_id = args.entity_id
  if (args.origin_reason) insert.origin_reason = args.origin_reason.trim()
  if (args.tags && args.tags.length > 0) insert.tags = args.tags

  const { data, error } = await supabase
    .from('tasks')
    .insert(insert)
    .select('id, title, status, priority, due_date, origin_reason, entity_type, entity_id, tags')
    .single()

  if (error || !data) {
    return { error: 'Falha ao criar tarefa.' }
  }

  return {
    success: true,
    created: true,
    task: data,
  }
}

async function updateTask(userId: string, args: ToolCallArgs, supabase: Supabase) {
  const taskId = (args.task_id ?? '').trim()
  if (!taskId) {
    return { error: 'Campo task_id é obrigatório para atualizar uma tarefa.' }
  }

  const updates: Record<string, unknown> = {}
  if (args.title) updates.title = args.title.trim()
  if (args.description !== undefined) updates.description = args.description?.trim() ?? null
  if (args.priority) updates.priority = args.priority
  if (args.due_date !== undefined) updates.due_date = args.due_date || null
  if (args.origin_reason !== undefined) updates.origin_reason = args.origin_reason?.trim() ?? null
  if (args.tags) updates.tags = args.tags

  if (Object.keys(updates).length === 0) {
    return { error: 'Nenhum campo informado para atualização.' }
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
    .select('id, title, status, priority, due_date, origin_reason, tags')
    .maybeSingle()

  if (error) {
    return { error: 'Falha ao atualizar tarefa.' }
  }

  if (!data) {
    return { error: 'Tarefa não encontrada ou sem permissão de acesso.' }
  }

  return {
    success: true,
    updated: true,
    task: data,
  }
}

async function changeTaskStatus(userId: string, args: ToolCallArgs, supabase: Supabase) {
  const taskId = (args.task_id ?? '').trim()
  const status = (args.status ?? '').trim()

  if (!taskId) return { error: 'Campo task_id é obrigatório.' }
  if (!status) return { error: 'Campo status é obrigatório.' }

  const validStatuses = ['todo', 'in_progress', 'done']
  if (!validStatuses.includes(status)) {
    return { error: `Status inválido. Use: ${validStatuses.join(', ')}.` }
  }

  const { data, error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', taskId)
    .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
    .select('id, title, status')
    .maybeSingle()

  if (error) {
    return { error: 'Falha ao alterar status da tarefa.' }
  }

  if (!data) {
    return { error: 'Tarefa não encontrada ou sem permissão de acesso.' }
  }

  return {
    success: true,
    task_id: data.id,
    title: data.title,
    new_status: data.status,
  }
}

async function listTasks(userId: string, args: ToolCallArgs, supabase: Supabase) {
  const limit = Math.min(args.limit ?? 10, 50)

  let query = supabase
    .from('tasks')
    .select('id, title, description, status, priority, due_date, entity_type, entity_id, origin_reason, tags, created_at')
    .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (args.status) {
    query = query.eq('status', args.status)
  } else {
    query = query.in('status', ['todo', 'in_progress'])
  }

  if (args.priority) query = query.eq('priority', args.priority)
  if (args.entity_type) query = query.eq('entity_type', args.entity_type)

  const { data, error } = await query
  if (error) return { error: 'Falha ao listar tarefas.' }

  return data ?? []
}

// ---------------------------------------------------------------------------
// Calendar / agenda executors
// ---------------------------------------------------------------------------

async function createEvent(userId: string, args: ToolCallArgs, supabase: Supabase) {
  const title = (args.title ?? '').trim()
  const startAt = (args.start_at ?? '').trim()

  if (!title) return { error: 'Campo title é obrigatório para criar um evento.' }
  if (!startAt) return { error: 'Campo start_at é obrigatório para criar um evento.' }

  const insert: Record<string, unknown> = {
    title,
    start_at: startAt,
    owner: userId,
    type: args.type ?? 'manual',
    external_source: 'manual',
    all_day: args.all_day ?? false,
    ia_source: args.ia_source ?? 'ia',
  }

  if (args.description) insert.description = args.description.trim()
  if (args.end_at) insert.end_at = args.end_at
  if (args.location) insert.location = args.location.trim()
  if (args.related_entity_type) insert.related_entity_type = args.related_entity_type
  if (args.related_entity_id) insert.related_entity_id = args.related_entity_id
  if (args.tags && args.tags.length > 0) insert.tags = args.tags

  const { data, error } = await supabase
    .from('calendar_events')
    .insert(insert)
    .select('id, title, start_at, end_at, type, all_day, location, ia_source, related_entity_type, related_entity_id, tags')
    .single()

  if (error || !data) {
    return { error: 'Falha ao criar evento.' }
  }

  return {
    success: true,
    created: true,
    event: data,
  }
}

async function updateEvent(userId: string, args: ToolCallArgs, supabase: Supabase) {
  const eventId = (args.event_id ?? '').trim()
  if (!eventId) return { error: 'Campo event_id é obrigatório para atualizar um evento.' }

  const updates: Record<string, unknown> = {}
  if (args.title) updates.title = args.title.trim()
  if (args.description !== undefined) updates.description = args.description?.trim() ?? null
  if (args.start_at) updates.start_at = args.start_at
  if (args.end_at !== undefined) updates.end_at = args.end_at || null
  if (args.all_day !== undefined) updates.all_day = args.all_day
  if (args.location !== undefined) updates.location = args.location?.trim() ?? null
  if (args.tags) updates.tags = args.tags

  if (Object.keys(updates).length === 0) {
    return { error: 'Nenhum campo informado para atualização.' }
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .update(updates)
    .eq('id', eventId)
    .eq('owner', userId)
    .select('id, title, start_at, end_at, type, all_day, location, tags')
    .maybeSingle()

  if (error) return { error: 'Falha ao atualizar evento.' }
  if (!data) return { error: 'Evento não encontrado ou sem permissão de acesso.' }

  return {
    success: true,
    updated: true,
    event: data,
  }
}

async function deleteEvent(userId: string, args: ToolCallArgs, supabase: Supabase) {
  const eventId = (args.event_id ?? '').trim()
  if (!eventId) return { error: 'Campo event_id é obrigatório para remover um evento.' }

  const { data: existing } = await supabase
    .from('calendar_events')
    .select('id, title')
    .eq('id', eventId)
    .eq('owner', userId)
    .maybeSingle()

  if (!existing) return { error: 'Evento não encontrado ou sem permissão de acesso.' }

  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', eventId)
    .eq('owner', userId)

  if (error) return { error: 'Falha ao remover evento.' }

  return {
    success: true,
    deleted: true,
    event_id: eventId,
    title: existing.title,
  }
}

async function listEvents(userId: string, args: ToolCallArgs, supabase: Supabase) {
  const limit = Math.min(args.limit ?? 10, 50)
  const now = new Date()
  const startDate = args.start_date ? `${args.start_date}T00:00:00` : now.toISOString()
  const defaultEnd = new Date(now)
  defaultEnd.setDate(defaultEnd.getDate() + 7)
  const endDate = args.end_date ? `${args.end_date}T23:59:59` : defaultEnd.toISOString()

  let query = supabase
    .from('calendar_events')
    .select('id, title, description, start_at, end_at, type, all_day, location, related_entity_type, related_entity_id, tags, ia_source')
    .eq('owner', userId)
    .gte('start_at', startDate)
    .lte('start_at', endDate)
    .order('start_at', { ascending: true })
    .limit(limit)

  if (args.type) query = query.eq('type', args.type)

  const { data, error } = await query
  if (error) return { error: 'Falha ao listar eventos.' }

  return data ?? []
}
