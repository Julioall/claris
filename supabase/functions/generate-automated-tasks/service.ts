import { createServiceClient } from '../_shared/db/mod.ts'

interface AutomationResult {
  type: string
  tasks_created: number
}

export async function generateTasks(
  userId: string,
  automationTypes?: string[]
): Promise<{ message: string; results: AutomationResult[] }> {
  const supabase = createServiceClient()
  const results: AutomationResult[] = []

  // Get user's courses
  const { data: userCourses, error: coursesError } = await supabase
    .from('user_courses')
    .select('course_id')
    .eq('user_id', userId)

  if (coursesError) throw coursesError

  const courseIds = userCourses?.map((uc: { course_id: string }) => uc.course_id) || []

  if (courseIds.length === 0) {
    return { message: 'No courses found for user', results: [] }
  }

  if (!automationTypes || automationTypes.includes('auto_at_risk')) {
    const count = await generateAtRiskTasks(supabase, userId, courseIds)
    results.push({ type: 'auto_at_risk', tasks_created: count })
  }

  if (!automationTypes || automationTypes.includes('auto_missed_assignment')) {
    const count = await generateMissedAssignmentTasks(supabase, userId, courseIds)
    results.push({ type: 'auto_missed_assignment', tasks_created: count })
  }

  if (!automationTypes || automationTypes.includes('auto_uncorrected_activity')) {
    const count = await generateUncorrectedTasks(supabase, userId, courseIds)
    results.push({ type: 'auto_uncorrected_activity', tasks_created: count })
  }

  const totalCreated = results.reduce((sum, r) => sum + r.tasks_created, 0)

  return { message: `Generated ${totalCreated} automated tasks`, results }
}

// ─── At-Risk Students (one task per student) ───

async function generateAtRiskTasks(supabase: any, userId: string, courseIds: string[]): Promise<number> {
  let count = 0

  const { data: enrollments, error } = await supabase
    .from('student_courses')
    .select('student_id, students!inner (id, full_name, current_risk_level)')
    .in('course_id', courseIds)
    .in('students.current_risk_level', ['risco', 'critico'])

  if (error || !enrollments) return 0

  const seenStudents = new Set<string>()
  const uniqueStudents: Array<{ student_id: string; student: any }> = []

  for (const enrollment of enrollments) {
    if (!seenStudents.has(enrollment.student_id)) {
      seenStudents.add(enrollment.student_id)
      uniqueStudents.push({ student_id: enrollment.student_id, student: enrollment.students })
    }
  }

  for (const { student_id, student } of uniqueStudents) {
    const { data: existing } = await supabase
      .from('pending_tasks')
      .select('id')
      .eq('student_id', student_id)
      .eq('automation_type', 'auto_at_risk')
      .in('status', ['aberta', 'em_andamento'])
      .single()

    if (existing) continue

    const riskLabel = student.current_risk_level === 'critico' ? 'crítico' : 'risco'

    const { error: insertError } = await supabase.from('pending_tasks').insert({
      title: `Acompanhar aluno em ${riskLabel}`,
      description: `${student.full_name} está com nível de risco "${riskLabel}". Realizar contato e verificar necessidades.`,
      student_id,
      course_id: null,
      created_by_user_id: userId,
      task_type: 'interna',
      priority: student.current_risk_level === 'critico' ? 'urgente' : 'alta',
      status: 'aberta',
      automation_type: 'auto_at_risk',
    })

    if (!insertError) count++
  }

  return count
}

// ─── Missed Assignments ───

async function generateMissedAssignmentTasks(supabase: any, userId: string, courseIds: string[]): Promise<number> {
  let count = 0
  const now = new Date()

  const { data: missedActivities, error } = await supabase
    .from('student_activities')
    .select('id, student_id, course_id, activity_name, due_date, submitted_at, students!inner (id, full_name), courses!inner (id, short_name)')
    .in('course_id', courseIds)
    .eq('activity_type', 'assign')
    .not('due_date', 'is', null)
    .lt('due_date', now.toISOString())
    .is('submitted_at', null)
    .eq('hidden', false)

  if (error || !missedActivities) return 0

  for (const activity of missedActivities) {
    const { data: existing } = await supabase
      .from('pending_tasks')
      .select('id')
      .eq('student_id', activity.student_id)
      .eq('course_id', activity.course_id)
      .eq('moodle_activity_id', activity.id)
      .eq('automation_type', 'auto_missed_assignment')
      .in('status', ['aberta', 'em_andamento'])
      .single()

    if (existing) continue

    const { error: insertError } = await supabase.from('pending_tasks').insert({
      title: `Atividade não entregue: ${activity.activity_name}`,
      description: `Aluno não entregou a atividade no prazo. Data de vencimento: ${new Date(activity.due_date).toLocaleDateString('pt-BR')}`,
      student_id: activity.student_id,
      course_id: activity.course_id,
      created_by_user_id: userId,
      task_type: 'moodle',
      priority: 'alta',
      status: 'aberta',
      automation_type: 'auto_missed_assignment',
      moodle_activity_id: activity.id,
    })

    if (!insertError) count++
  }

  return count
}

// ─── Uncorrected Activities ───

async function generateUncorrectedTasks(supabase: any, userId: string, courseIds: string[]): Promise<number> {
  let count = 0
  const now = new Date()

  const { data: uncorrectedActivities, error } = await supabase
    .from('student_activities')
    .select('id, student_id, course_id, activity_name, due_date, graded_at, students!inner (id, full_name)')
    .in('course_id', courseIds)
    .eq('activity_type', 'assign')
    .not('due_date', 'is', null)
    .lt('due_date', now.toISOString())
    .is('graded_at', null)
    .eq('hidden', false)
    .not('submitted_at', 'is', null)

  if (error || !uncorrectedActivities) return 0

  for (const activity of uncorrectedActivities) {
    const { data: existing } = await supabase
      .from('pending_tasks')
      .select('id')
      .eq('student_id', activity.student_id)
      .eq('course_id', activity.course_id)
      .eq('moodle_activity_id', activity.id)
      .eq('automation_type', 'auto_uncorrected_activity')
      .in('status', ['aberta', 'em_andamento'])
      .single()

    if (existing) continue

    const { error: insertError } = await supabase.from('pending_tasks').insert({
      title: `Corrigir atividade: ${activity.activity_name}`,
      description: `Atividade aguardando correção. Venceu em: ${new Date(activity.due_date).toLocaleDateString('pt-BR')}`,
      student_id: activity.student_id,
      course_id: activity.course_id,
      created_by_user_id: userId,
      task_type: 'moodle',
      priority: 'media',
      status: 'aberta',
      automation_type: 'auto_uncorrected_activity',
      moodle_activity_id: activity.id,
    })

    if (!insertError) count++
  }

  return count
}
