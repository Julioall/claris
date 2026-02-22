import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface AutomationResult {
  type: string
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

    const { automation_types } = await req.json()
    const results: AutomationResult[] = []

    // Get user's courses
    const { data: userCourses, error: coursesError } = await supabase
      .from('user_courses')
      .select('course_id')
      .eq('user_id', user.id)

    if (coursesError) throw coursesError

    const courseIds = userCourses?.map(uc => uc.course_id) || []

    if (courseIds.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No courses found for user',
          results: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Generate tasks for at-risk students
    if (!automation_types || automation_types.includes('auto_at_risk')) {
      let atRiskTasksCreated = 0

      // Get students at risk in user's courses
      const { data: atRiskStudents, error: studentsError } = await supabase
        .from('student_courses')
        .select(`
          student_id,
          course_id,
          students!inner (
            id,
            full_name,
            current_risk_level
          )
        `)
        .in('course_id', courseIds)
        .in('students.current_risk_level', ['risco', 'critico'])

      if (!studentsError && atRiskStudents) {
        for (const enrollment of atRiskStudents) {
          const student = enrollment.students as any

          // Check if there's already an open at-risk task for this student
          const { data: existingTask } = await supabase
            .from('pending_tasks')
            .select('id')
            .eq('student_id', enrollment.student_id)
            .eq('course_id', enrollment.course_id)
            .eq('automation_type', 'auto_at_risk')
            .in('status', ['aberta', 'em_andamento'])
            .single()

          if (existingTask) continue // Skip if task already exists

          // Create task for at-risk student
          const { error: insertError } = await supabase
            .from('pending_tasks')
            .insert({
              title: `Acompanhar aluno em ${student.current_risk_level}`,
              description: `Aluno identificado como em ${student.current_risk_level}. Realizar contato e verificar necessidades.`,
              student_id: enrollment.student_id,
              course_id: enrollment.course_id,
              created_by_user_id: user.id,
              task_type: 'interna',
              priority: student.current_risk_level === 'critico' ? 'urgente' : 'alta',
              status: 'aberta',
              automation_type: 'auto_at_risk'
            })

          if (!insertError) {
            atRiskTasksCreated++
          }
        }
      }

      results.push({
        type: 'auto_at_risk',
        tasks_created: atRiskTasksCreated
      })
    }

    // 2. Generate tasks for missed assignments
    if (!automation_types || automation_types.includes('auto_missed_assignment')) {
      let missedTasksCreated = 0
      const now = new Date()

      // Get activities with due date in the past that are not submitted
      const { data: missedActivities, error: activitiesError } = await supabase
        .from('student_activities')
        .select(`
          id,
          student_id,
          course_id,
          activity_name,
          due_date,
          submitted_at,
          students!inner (
            id,
            full_name
          ),
          courses!inner (
            id,
            short_name
          )
        `)
        .in('course_id', courseIds)
        .eq('activity_type', 'assign')
        .not('due_date', 'is', null)
        .lt('due_date', now.toISOString())
        .is('submitted_at', null)
        .eq('hidden', false)

      if (!activitiesError && missedActivities) {
        for (const activity of missedActivities) {
          // Check if there's already a task for this missed activity
          const { data: existingTask } = await supabase
            .from('pending_tasks')
            .select('id')
            .eq('student_id', activity.student_id)
            .eq('course_id', activity.course_id)
            .eq('moodle_activity_id', activity.id)
            .eq('automation_type', 'auto_missed_assignment')
            .in('status', ['aberta', 'em_andamento'])
            .single()

          if (existingTask) continue

          // Create task for missed assignment
          const { error: insertError } = await supabase
            .from('pending_tasks')
            .insert({
              title: `Atividade não entregue: ${activity.activity_name}`,
              description: `Aluno não entregou a atividade no prazo. Data de vencimento: ${new Date(activity.due_date).toLocaleDateString('pt-BR')}`,
              student_id: activity.student_id,
              course_id: activity.course_id,
              created_by_user_id: user.id,
              task_type: 'moodle',
              priority: 'alta',
              status: 'aberta',
              automation_type: 'auto_missed_assignment',
              moodle_activity_id: activity.id
            })

          if (!insertError) {
            missedTasksCreated++
          }
        }
      }

      results.push({
        type: 'auto_missed_assignment',
        tasks_created: missedTasksCreated
      })
    }

    // 3. Generate tasks for uncorrected activities (reuse existing logic)
    if (!automation_types || automation_types.includes('auto_uncorrected_activity')) {
      let uncorrectedTasksCreated = 0
      const now = new Date()

      // Get activities with due date that are not graded yet
      const { data: uncorrectedActivities, error: activitiesError } = await supabase
        .from('student_activities')
        .select(`
          id,
          student_id,
          course_id,
          activity_name,
          due_date,
          graded_at,
          students!inner (
            id,
            full_name
          )
        `)
        .in('course_id', courseIds)
        .eq('activity_type', 'assign')
        .not('due_date', 'is', null)
        .lt('due_date', now.toISOString())
        .is('graded_at', null)
        .eq('hidden', false)
        .not('submitted_at', 'is', null) // Only submitted activities need grading

      if (!activitiesError && uncorrectedActivities) {
        for (const activity of uncorrectedActivities) {
          // Check if there's already a task for this uncorrected activity
          const { data: existingTask } = await supabase
            .from('pending_tasks')
            .select('id')
            .eq('student_id', activity.student_id)
            .eq('course_id', activity.course_id)
            .eq('moodle_activity_id', activity.id)
            .eq('automation_type', 'auto_uncorrected_activity')
            .in('status', ['aberta', 'em_andamento'])
            .single()

          if (existingTask) continue

          // Create task for uncorrected activity
          const { error: insertError } = await supabase
            .from('pending_tasks')
            .insert({
              title: `Corrigir atividade: ${activity.activity_name}`,
              description: `Atividade aguardando correção. Venceu em: ${new Date(activity.due_date).toLocaleDateString('pt-BR')}`,
              student_id: activity.student_id,
              course_id: activity.course_id,
              created_by_user_id: user.id,
              task_type: 'moodle',
              priority: 'media',
              status: 'aberta',
              automation_type: 'auto_uncorrected_activity',
              moodle_activity_id: activity.id
            })

          if (!insertError) {
            uncorrectedTasksCreated++
          }
        }
      }

      results.push({
        type: 'auto_uncorrected_activity',
        tasks_created: uncorrectedTasksCreated
      })
    }

    const totalCreated = results.reduce((sum, r) => sum + r.tasks_created, 0)

    return new Response(
      JSON.stringify({
        message: `Generated ${totalCreated} automated tasks`,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in generate-automated-tasks:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
