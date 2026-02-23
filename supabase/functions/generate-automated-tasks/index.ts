import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'

interface AutomationResult {
  type: string
  tasks_created: number
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const supabase = createServiceClient()
    const user = await getAuthenticatedUser(req, supabase)

    if (!user) {
      return errorResponse('Unauthorized', 401)
    }

    const { automation_types } = await req.json()
    const results: AutomationResult[] = []

    // Get user's courses
    const { data: userCourses, error: coursesError } = await supabase
      .from('user_courses')
      .select('course_id')
      .eq('user_id', user.id)

    if (coursesError) throw coursesError

    const courseIds = userCourses?.map((uc) => uc.course_id) || []

    if (courseIds.length === 0) {
      return jsonResponse({ message: 'No courses found for user', results: [] })
    }

    // 1. Generate tasks for at-risk students
    if (!automation_types || automation_types.includes('auto_at_risk')) {
      const count = await generateAtRiskTasks(supabase, user.id, courseIds)
      results.push({ type: 'auto_at_risk', tasks_created: count })
    }

    // 2. Generate tasks for missed assignments
    if (!automation_types || automation_types.includes('auto_missed_assignment')) {
      const count = await generateMissedAssignmentTasks(supabase, user.id, courseIds)
      results.push({ type: 'auto_missed_assignment', tasks_created: count })
    }

    // 3. Generate tasks for uncorrected activities
    if (!automation_types || automation_types.includes('auto_uncorrected_activity')) {
      const count = await generateUncorrectedTasks(supabase, user.id, courseIds)
      results.push({ type: 'auto_uncorrected_activity', tasks_created: count })
    }

    const totalCreated = results.reduce((sum, r) => sum + r.tasks_created, 0)

    return jsonResponse({
      message: `Generated ${totalCreated} automated tasks`,
      results,
    })
  } catch (error) {
    console.error('Error in generate-automated-tasks:', error)
    return errorResponse((error as Error).message, 500)
  }
})

// ─── At-Risk Students ─────────────────────────────────────────────

async function generateAtRiskTasks(
  supabase: any,
  userId: string,
  courseIds: string[]
): Promise<number> {
  let count = 0

  const { data: atRiskStudents, error } = await supabase
    .from('student_courses')
    .select(`
      student_id,
      course_id,
      students!inner (id, full_name, current_risk_level)
    `)
    .in('course_id', courseIds)
    .in('students.current_risk_level', ['risco', 'critico'])

  if (error || !atRiskStudents) return 0

  for (const enrollment of atRiskStudents) {
    const student = enrollment.students as any

    // Check if task already exists
    const { data: existing } = await supabase
      .from('pending_tasks')
      .select('id')
      .eq('student_id', enrollment.student_id)
      .eq('course_id', enrollment.course_id)
      .eq('automation_type', 'auto_at_risk')
      .in('status', ['aberta', 'em_andamento'])
      .single()

    if (existing) continue

    const { error: insertError } = await supabase.from('pending_tasks').insert({
      title: `Acompanhar aluno em ${student.current_risk_level}`,
      description: `Aluno identificado como em ${student.current_risk_level}. Realizar contato e verificar necessidades.`,
      student_id: enrollment.student_id,
      course_id: enrollment.course_id,
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

// ─── Missed Assignments ───────────────────────────────────────────

async function generateMissedAssignmentTasks(
  supabase: any,
  userId: string,
  courseIds: string[]
): Promise<number> {
  let count = 0
  const now = new Date()

  const { data: missedActivities, error } = await supabase
    .from('student_activities')
    .select(`
      id, student_id, course_id, activity_name, due_date, submitted_at,
      students!inner (id, full_name),
      courses!inner (id, short_name)
    `)
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

// ─── Uncorrected Activities ───────────────────────────────────────

async function generateUncorrectedTasks(
  supabase: any,
  userId: string,
  courseIds: string[]
): Promise<number> {
  let count = 0
  const now = new Date()

  const { data: uncorrectedActivities, error } = await supabase
    .from('student_activities')
    .select(`
      id, student_id, course_id, activity_name, due_date, graded_at,
      students!inner (id, full_name)
    `)
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
