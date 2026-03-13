import { createServiceClient } from '../_shared/db/mod.ts'
import type { AppSupabaseClient } from '../_shared/db/mod.ts'
import {
  createPendingTask,
  hasOpenAutomatedTask,
  listAtRiskStudents,
  listMissedAssignments,
  listUncorrectedAssignments,
  listUserCourseIds,
} from '../_shared/domain/task-automation/repository.ts'

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

  const courseIds = await listUserCourseIds(supabase, userId)

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

async function generateAtRiskTasks(supabase: AppSupabaseClient, userId: string, courseIds: string[]): Promise<number> {
  let count = 0

  const enrollments = await listAtRiskStudents(supabase, courseIds)

  const seenStudents = new Set<string>()
  const uniqueStudents = [] as typeof enrollments

  for (const enrollment of enrollments) {
    if (!seenStudents.has(enrollment.studentId)) {
      seenStudents.add(enrollment.studentId)
      uniqueStudents.push(enrollment)
    }
  }

  for (const student of uniqueStudents) {
    const existing = await hasOpenAutomatedTask(supabase, {
      automationType: 'auto_at_risk',
      courseId: null,
      studentId: student.studentId,
    })

    if (existing) continue

    const riskLabel = student.currentRiskLevel === 'critico' ? 'crítico' : 'risco'

    try {
      await createPendingTask(supabase, {
        title: `Acompanhar aluno em ${riskLabel}`,
        description: `${student.fullName} está com nível de risco "${riskLabel}". Realizar contato e verificar necessidades.`,
        student_id: student.studentId,
        course_id: null,
        created_by_user_id: userId,
        task_type: 'interna',
        priority: student.currentRiskLevel === 'critico' ? 'urgente' : 'alta',
        status: 'aberta',
        automation_type: 'auto_at_risk',
      })
      count++
    } catch (insertError) {
      console.error(`Error creating at-risk task for ${student.studentId}:`, insertError)
    }
  }

  return count
}

// ─── Missed Assignments ───

async function generateMissedAssignmentTasks(supabase: AppSupabaseClient, userId: string, courseIds: string[]): Promise<number> {
  let count = 0
  const now = new Date()

  const missedActivities = await listMissedAssignments(supabase, courseIds, now.toISOString())

  for (const activity of missedActivities) {
    const existing = await hasOpenAutomatedTask(supabase, {
      automationType: 'auto_missed_assignment',
      courseId: activity.courseId,
      moodleActivityId: activity.activityId,
      studentId: activity.studentId,
    })

    if (existing) continue

    try {
      await createPendingTask(supabase, {
        title: `Atividade não entregue: ${activity.activityName}`,
        description: `Aluno não entregou a atividade no prazo. Data de vencimento: ${new Date(activity.dueDate).toLocaleDateString('pt-BR')}`,
        student_id: activity.studentId,
        course_id: activity.courseId,
        created_by_user_id: userId,
        task_type: 'moodle',
        priority: 'alta',
        status: 'aberta',
        automation_type: 'auto_missed_assignment',
        moodle_activity_id: activity.activityId,
      })
      count++
    } catch (insertError) {
      console.error(`Error creating missed assignment task for ${activity.activityId}:`, insertError)
    }
  }

  return count
}

// ─── Uncorrected Activities ───

async function generateUncorrectedTasks(supabase: AppSupabaseClient, userId: string, courseIds: string[]): Promise<number> {
  let count = 0
  const now = new Date()

  const uncorrectedActivities = await listUncorrectedAssignments(supabase, courseIds, now.toISOString())

  for (const activity of uncorrectedActivities) {
    const existing = await hasOpenAutomatedTask(supabase, {
      automationType: 'auto_uncorrected_activity',
      courseId: activity.courseId,
      moodleActivityId: activity.activityId,
      studentId: activity.studentId,
    })

    if (existing) continue

    try {
      await createPendingTask(supabase, {
        title: `Corrigir atividade: ${activity.activityName}`,
        description: `Atividade aguardando correção. Venceu em: ${new Date(activity.dueDate).toLocaleDateString('pt-BR')}`,
        student_id: activity.studentId,
        course_id: activity.courseId,
        created_by_user_id: userId,
        task_type: 'moodle',
        priority: 'media',
        status: 'aberta',
        automation_type: 'auto_uncorrected_activity',
        moodle_activity_id: activity.activityId,
      })
      count++
    } catch (insertError) {
      console.error(`Error creating uncorrected task for ${activity.activityId}:`, insertError)
    }
  }

  return count
}
