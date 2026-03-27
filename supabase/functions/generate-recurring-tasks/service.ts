import { createServiceClient } from '../_shared/db/mod.ts'
import {
  appendBackgroundJobEvent,
  createBackgroundJobItems,
  upsertBackgroundJob,
} from '../_shared/domain/background-jobs/repository.ts'
import {
  createPendingTask,
  listDueRecurrenceConfigs,
  updateRecurrenceSchedule,
} from '../_shared/domain/task-automation/repository.ts'

interface RecurrenceGeneration {
  config_id: string
  tasks_created: number
  title: string
}

interface RecurrenceGenerationFailure {
  config_id: string
  error_message: string
  title: string
}

type RecurrencePattern = 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'bimestral' | 'trimestral'

interface RecurrenceConfig {
  id: string
  title: string
  description: string | null
  pattern: RecurrencePattern
  weekly_day: number | null
  start_date: string
  end_date: string | null
  student_id: string | null
  course_id: string | null
  created_by_user_id: string
  task_type: string | null
  priority: string | null
  next_generation_at: string | null
}

async function syncBackgroundJob(task: () => Promise<void>) {
  try {
    await task()
  } catch (error) {
    console.error('[generate-recurring-tasks][background-jobs] sync failed:', error)
  }
}

async function recordRecurringGenerationJob(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    completedAt: string
    failures: RecurrenceGenerationFailure[]
    results: RecurrenceGeneration[]
    startedAt: string
    userId: string
  },
) {
  const totalItems = input.results.length + input.failures.length
  if (totalItems === 0) return

  const jobId = crypto.randomUUID()
  const failedCount = input.failures.length
  const successCount = input.results.length

  await upsertBackgroundJob(supabase, {
    id: jobId,
    userId: input.userId,
    jobType: 'recurring_task_generation',
    source: 'tasks',
    title: 'Geracao de tarefas recorrentes',
    description: 'Execucao das configuracoes de recorrencia elegiveis.',
    status: failedCount > 0 && successCount === 0 ? 'failed' : 'completed',
    totalItems,
    processedItems: totalItems,
    successCount,
    errorCount: failedCount,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    errorMessage: failedCount > 0 && successCount === 0
      ? 'Nenhuma tarefa recorrente foi gerada com sucesso.'
      : null,
    metadata: {
      background_activity_visibility: 'hidden',
      generated_tasks: input.results.reduce((total, entry) => total + entry.tasks_created, 0),
    },
  })

  await createBackgroundJobItems(supabase, [
    ...input.results.map((entry) => ({
      jobId,
      userId: input.userId,
      sourceTable: 'task_recurrence_configs',
      sourceRecordId: entry.config_id,
      itemKey: entry.config_id,
      label: entry.title,
      status: 'completed' as const,
      progressCurrent: entry.tasks_created,
      progressTotal: entry.tasks_created,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      metadata: {
        tasks_created: entry.tasks_created,
      },
    })),
    ...input.failures.map((entry) => ({
      jobId,
      userId: input.userId,
      sourceTable: 'task_recurrence_configs',
      sourceRecordId: entry.config_id,
      itemKey: entry.config_id,
      label: entry.title,
      status: 'failed' as const,
      progressCurrent: 0,
      progressTotal: 1,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      errorMessage: entry.error_message,
      metadata: {
        error_message: entry.error_message,
      },
    })),
  ])

  await appendBackgroundJobEvent(supabase, {
    userId: input.userId,
    jobId,
    eventType: failedCount > 0 && successCount === 0 ? 'job_failed' : 'job_completed',
    level: failedCount > 0 ? 'warning' : 'info',
    message: failedCount > 0
      ? `Geracao concluida com ${successCount} sucesso(s) e ${failedCount} falha(s).`
      : `Geracao concluida com ${successCount} tarefa(s) recorrente(s).`,
    metadata: {
      generated_tasks: input.results.reduce((total, entry) => total + entry.tasks_created, 0),
    },
  })
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

function addWeeks(date: Date, weeks: number) {
  return addDays(date, weeks * 7)
}

function isAfter(left: Date, right: Date) {
  return left.getTime() > right.getTime()
}

function getFirstWeeklyOccurrence(startDate: Date, weeklyDay: number) {
  const candidate = new Date(startDate)
  const delta = (weeklyDay - candidate.getUTCDay() + 7) % 7
  candidate.setUTCDate(candidate.getUTCDate() + delta)
  return candidate
}

function incrementRecurringDate(date: Date, pattern: RecurrencePattern) {
  switch (pattern) {
    case 'diario':
      return addDays(date, 1)
    case 'semanal':
      return addWeeks(date, 1)
    case 'quinzenal':
      return addWeeks(date, 2)
    case 'mensal':
      return addMonths(date, 1)
    case 'bimestral':
      return addMonths(date, 2)
    case 'trimestral':
      return addMonths(date, 3)
    default:
      return addWeeks(date, 1)
  }
}

function calculateNextRecurringDate(config: Pick<RecurrenceConfig, 'pattern' | 'start_date' | 'weekly_day'>, referenceDate?: string | Date) {
  const anchor = new Date(config.start_date)
  const reference = referenceDate ? new Date(referenceDate) : anchor

  let next = config.pattern === 'semanal'
    ? getFirstWeeklyOccurrence(anchor, config.weekly_day ?? anchor.getUTCDay())
    : anchor

  if (isAfter(next, reference)) {
    return next
  }

  while (!isAfter(next, reference)) {
    next = incrementRecurringDate(next, config.pattern)
  }

  return next
}

export async function generateRecurringTasks(
  userId: string
): Promise<{ message: string; results: RecurrenceGeneration[] }> {
  const supabase = createServiceClient()
  const now = new Date()
  const results: RecurrenceGeneration[] = []
  const failures: RecurrenceGenerationFailure[] = []
  const startedAt = now.toISOString()

  const configs = await listDueRecurrenceConfigs(supabase, now.toISOString())

  if (!configs || configs.length === 0) {
    return { message: 'No recurrence configurations due for generation', results: [] }
  }

  for (const rawConfig of configs) {
    const config = rawConfig as RecurrenceConfig

    try {
      const occurrenceDueDate = config.next_generation_at
        ? new Date(config.next_generation_at)
        : new Date(config.start_date)

      if (config.end_date && occurrenceDueDate > new Date(config.end_date)) {
        continue
      }

      try {
        await createPendingTask(supabase, {
          title: config.title,
          description: config.description,
          task_type: config.task_type,
          priority: config.priority,
          status: 'aberta',
          student_id: config.student_id,
          course_id: config.course_id,
          due_date: occurrenceDueDate.toISOString(),
          created_by_user_id: config.created_by_user_id,
          automation_type: 'recurring',
          is_recurring: true,
          recurrence_id: config.id,
          created_at: now.toISOString(),
        })
      } catch (insertError) {
        console.error(`Error creating task for config ${config.id}:`, insertError)
        failures.push({
          config_id: config.id,
          error_message: insertError instanceof Error ? insertError.message : 'Falha ao criar tarefa recorrente.',
          title: config.title,
        })
        continue
      }

      const nextDate = calculateNextRecurringDate(config, occurrenceDueDate)

      try {
        await updateRecurrenceSchedule(supabase, config.id, {
          last_generated_at: now.toISOString(),
          next_generation_at: nextDate.toISOString(),
        })
      } catch (updateError) {
        console.error(`Error updating config ${config.id}:`, updateError)
      }

      results.push({ config_id: config.id, tasks_created: 1, title: config.title })
    } catch (err) {
      console.error(`Error processing config ${config.id}:`, err)
      failures.push({
        config_id: config.id,
        error_message: err instanceof Error ? err.message : 'Falha inesperada ao processar recorrencia.',
        title: config.title,
      })
      continue
    }
  }

  await syncBackgroundJob(async () => {
    await recordRecurringGenerationJob(supabase, {
      completedAt: new Date().toISOString(),
      failures,
      results,
      startedAt,
      userId,
    })
  })

  return { message: `Generated ${results.length} recurring tasks`, results }
}
