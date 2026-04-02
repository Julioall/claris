-- Migration: Epic 5 - Expandir dashboard_course_activity_aggregates com métricas adicionais
-- e criar função refresh_course_dashboard_aggregate(p_course_id uuid)

-- 1. Adicionar colunas ausentes na tabela de agregados
ALTER TABLE public.dashboard_course_activity_aggregates
  ADD COLUMN IF NOT EXISTS at_risk_student_count     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_student_count      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uncorrected_activities_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_at_risk_this_week     INT NOT NULL DEFAULT 0;

-- 2. Função de refresh incremental: recalcula todas as métricas de um curso
CREATE OR REPLACE FUNCTION public.refresh_course_dashboard_aggregate(p_course_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_at_risk            INT;
  v_active             INT;
  v_uncorrected        INT;
  v_pending_submission INT;
  v_pending_correction INT;
  v_new_at_risk        INT;
BEGIN
  -- Estudantes com risco crítico ou em risco neste curso
  SELECT COUNT(DISTINCT s.id)
    INTO v_at_risk
    FROM public.student_courses sc
    JOIN public.students s ON s.id = sc.student_id
   WHERE sc.course_id = p_course_id
     AND s.current_risk_level IN ('risco', 'critico');

  -- Estudantes com matrícula ativa neste curso
  SELECT COUNT(DISTINCT sc.student_id)
    INTO v_active
    FROM public.student_courses sc
   WHERE sc.course_id = p_course_id
     AND LOWER(TRIM(sc.enrollment_status)) = 'ativo';

  -- Atividades do tipo assign pendentes de correção
  SELECT COUNT(*)
    INTO v_uncorrected
    FROM public.student_activities sa
   WHERE sa.course_id = p_course_id
     AND sa.activity_type = 'assign'
     AND sa.hidden = false
     AND sa.submitted_at IS NOT NULL
     AND (sa.graded_at IS NULL OR sa.graded_at > sa.submitted_at)
     AND (sa.grade IS NULL OR sa.grade < 0);

  -- Atividades com submissão pendente (prazo passado, não enviado)
  SELECT COUNT(*)
    INTO v_pending_submission
    FROM public.student_activities sa
   WHERE sa.course_id = p_course_id
     AND sa.activity_type = 'assign'
     AND sa.hidden = false
     AND sa.due_date IS NOT NULL
     AND sa.due_date < NOW()
     AND sa.submitted_at IS NULL
     AND (sa.grade IS NULL OR sa.grade < 0);

  -- Atividades pendentes de correção (enviadas mas sem nota)
  SELECT COUNT(*)
    INTO v_pending_correction
    FROM public.student_activities sa
   WHERE sa.course_id = p_course_id
     AND sa.activity_type = 'assign'
     AND sa.hidden = false
     AND sa.submitted_at IS NOT NULL
     AND (sa.graded_at IS NULL OR sa.grade IS NULL OR sa.grade < 0);

  -- Novos estudantes em risco nos últimos 7 dias (janela rolante)
  SELECT COUNT(DISTINCT rh.student_id)
    INTO v_new_at_risk
    FROM public.risk_history rh
    JOIN public.student_courses sc ON sc.student_id = rh.student_id
                                  AND sc.course_id  = p_course_id
   WHERE rh.new_level IN ('risco', 'critico')
     AND rh.created_at >= NOW() - INTERVAL '7 days';

  -- Upsert no registro de agregação
  INSERT INTO public.dashboard_course_activity_aggregates (
    course_id,
    at_risk_student_count,
    active_student_count,
    uncorrected_activities_count,
    new_at_risk_this_week,
    pending_submission_assignments,
    pending_correction_assignments,
    updated_at
  )
  VALUES (
    p_course_id,
    v_at_risk,
    v_active,
    v_uncorrected,
    v_new_at_risk,
    v_pending_submission,
    v_pending_correction,
    NOW()
  )
  ON CONFLICT (course_id) DO UPDATE SET
    at_risk_student_count        = EXCLUDED.at_risk_student_count,
    active_student_count         = EXCLUDED.active_student_count,
    uncorrected_activities_count = EXCLUDED.uncorrected_activities_count,
    new_at_risk_this_week        = EXCLUDED.new_at_risk_this_week,
    pending_submission_assignments = EXCLUDED.pending_submission_assignments,
    pending_correction_assignments = EXCLUDED.pending_correction_assignments,
    updated_at                   = EXCLUDED.updated_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_course_dashboard_aggregate(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_course_dashboard_aggregate(UUID) TO service_role;
