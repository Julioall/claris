import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RecurrenceGeneration {
  config_id: string
  tasks_created: number
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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

    if (configError) {
      throw configError
    }

    if (!configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No recurrence configurations due for generation',
          results: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process each configuration
    for (const config of configs) {
      try {
        // Generate pending task from recurrence config
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
            created_at: now.toISOString()
          })
          .select()
          .single()

        if (insertError) {
          console.error(`Error creating task for config ${config.id}:`, insertError)
          continue
        }

        // Calculate next generation date
        const { data: nextDate } = await supabase.rpc(
          'calculate_next_recurrence_date',
          {
            current_date: now.toISOString(),
            pattern: config.pattern
          }
        )

        // Update recurrence config with last and next generation dates
        const { error: updateError } = await supabase
          .from('task_recurrence_configs')
          .update({
            last_generated_at: now.toISOString(),
            next_generation_at: nextDate || now.toISOString()
          })
          .eq('id', config.id)

        if (updateError) {
          console.error(`Error updating config ${config.id}:`, updateError)
        }

        results.push({
          config_id: config.id,
          tasks_created: 1
        })

      } catch (err) {
        console.error(`Error processing config ${config.id}:`, err)
        continue
      }
    }

    return new Response(
      JSON.stringify({
        message: `Generated ${results.length} recurring tasks`,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in generate-recurring-tasks:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
