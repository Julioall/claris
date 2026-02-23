import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'

interface RecurrenceGeneration {
  config_id: string
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

    const now = new Date()
    const results: RecurrenceGeneration[] = []

    // Fetch active recurrence configurations that are due for generation
    const { data: configs, error: configError } = await supabase
      .from('task_recurrence_configs')
      .select('*')
      .eq('is_active', true)
      .or(`next_generation_at.is.null,next_generation_at.lte.${now.toISOString()}`)
      .or(`end_date.is.null,end_date.gte.${now.toISOString()}`)

    if (configError) throw configError

    if (!configs || configs.length === 0) {
      return jsonResponse({
        message: 'No recurrence configurations due for generation',
        results: [],
      })
    }

    // Process each configuration
    for (const config of configs) {
      try {
        const { data: newTask, error: insertError } = await supabase
          .from('pending_tasks')
          .insert({
            title: config.title,
            description: config.description,
            task_type: config.task_type,
            priority: config.priority,
            status: 'aberta',
            student_id: config.student_id,
            course_id: config.course_id,
            created_by_user_id: config.created_by_user_id,
            automation_type: 'recurring',
            is_recurring: true,
            recurrence_id: config.id,
            created_at: now.toISOString(),
          })
          .select()
          .single()

        if (insertError) {
          console.error(`Error creating task for config ${config.id}:`, insertError)
          continue
        }

        // Calculate next generation date
        const { data: nextDate } = await supabase.rpc('calculate_next_recurrence_date', {
          current_date: now.toISOString(),
          pattern: config.pattern,
        })

        const { error: updateError } = await supabase
          .from('task_recurrence_configs')
          .update({
            last_generated_at: now.toISOString(),
            next_generation_at: nextDate || now.toISOString(),
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

    return jsonResponse({
      message: `Generated ${results.length} recurring tasks`,
      results,
    })
  } catch (error) {
    console.error('Error in generate-recurring-tasks:', error)
    return errorResponse((error as Error).message, 500)
  }
})
