import { createServiceClient } from '../_shared/db/mod.ts'

interface RecurrenceGeneration {
  config_id: string
  tasks_created: number
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
  _userId: string
): Promise<{ message: string; results: RecurrenceGeneration[] }> {
  const supabase = createServiceClient()
  const now = new Date()
  const results: RecurrenceGeneration[] = []

  const { data: configs, error: configError } = await supabase
    .from('task_recurrence_configs')
    .select('*')
    .eq('is_active', true)
    .lte('start_date', now.toISOString())
    .or(`next_generation_at.is.null,next_generation_at.lte.${now.toISOString()}`)
    .or(`end_date.is.null,end_date.gte.${now.toISOString()}`)

  if (configError) throw configError

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

      const { error: insertError } = await supabase
        .from('pending_tasks')
        .insert({
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

      if (insertError) {
        console.error(`Error creating task for config ${config.id}:`, insertError)
        continue
      }

      const nextDate = calculateNextRecurringDate(config, occurrenceDueDate)

      const { error: updateError } = await supabase
        .from('task_recurrence_configs')
        .update({
          last_generated_at: now.toISOString(),
          next_generation_at: nextDate.toISOString(),
        })
        .eq('id', config.id)

      if (updateError) {
        console.error(`Error updating config ${config.id}:`, updateError)
      }

      results.push({ config_id: config.id, tasks_created: 1 })
    } catch (err) {
      console.error(`Error processing config ${config.id}:`, err)
      continue
    }
  }

  return { message: `Generated ${results.length} recurring tasks`, results }
}
