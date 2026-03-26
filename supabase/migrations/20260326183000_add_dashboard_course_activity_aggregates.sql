CREATE TABLE IF NOT EXISTS public.dashboard_course_activity_aggregates (
  course_id uuid PRIMARY KEY REFERENCES public.courses (id) ON DELETE CASCADE,
  pending_submission_assignments integer NOT NULL DEFAULT 0,
  pending_correction_assignments integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_course_activity_aggregates_updated_at
  ON public.dashboard_course_activity_aggregates (updated_at DESC);

ALTER TABLE public.dashboard_course_activity_aggregates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dashboard_course_activity_aggregates_select"
  ON public.dashboard_course_activity_aggregates
  FOR SELECT
  USING (
    course_id IN (
      SELECT course_id FROM public.user_courses WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "dashboard_course_activity_aggregates_insert_service"
  ON public.dashboard_course_activity_aggregates
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "dashboard_course_activity_aggregates_update_service"
  ON public.dashboard_course_activity_aggregates
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

WITH normalized_student_activities AS (
  SELECT
    sa.course_id,
    sa.student_id,
    sa.grade,
    sa.grade_max,
    sa.percentage,
    sa.completed_at,
    sa.submitted_at,
    sa.graded_at,
    sa.due_date,
    sa.hidden,
    translate(lower(trim(coalesce(sa.status, ''))), 'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') AS normalized_status
  FROM public.student_activities sa
  WHERE lower(trim(coalesce(sa.activity_type, ''))) IN ('assign', 'assignment')
),
active_enrollments AS (
  SELECT DISTINCT
    sc.course_id,
    sc.student_id
  FROM public.student_courses sc
  WHERE translate(lower(trim(coalesce(sc.enrollment_status, ''))), 'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') <> 'suspenso'
),
course_aggregate_rows AS (
  SELECT
    ae.course_id,
    count(*) FILTER (
      WHERE
        nsa.hidden = false
        AND (
          coalesce(nsa.grade_max, 0) > 0
          OR nsa.grade IS NOT NULL
          OR nsa.percentage IS NOT NULL
        )
        AND nsa.grade IS NULL
        AND nsa.graded_at IS NULL
        AND nsa.normalized_status <> 'graded'
        AND NOT (
          nsa.submitted_at IS NOT NULL
          OR nsa.completed_at IS NOT NULL
          OR nsa.normalized_status = 'submitted'
          OR nsa.normalized_status IN ('completed', 'complete_pass', 'complete_fail', 'concluida', 'finalizada')
        )
        AND nsa.due_date IS NOT NULL
        AND nsa.due_date < now()
    ) AS pending_submission_assignments,
    count(*) FILTER (
      WHERE
        nsa.hidden = false
        AND (
          coalesce(nsa.grade_max, 0) > 0
          OR nsa.grade IS NOT NULL
          OR nsa.percentage IS NOT NULL
        )
        AND nsa.grade IS NULL
        AND nsa.graded_at IS NULL
        AND nsa.normalized_status <> 'graded'
        AND (
          nsa.submitted_at IS NOT NULL
          OR nsa.completed_at IS NOT NULL
          OR nsa.normalized_status = 'submitted'
          OR nsa.normalized_status IN ('completed', 'complete_pass', 'complete_fail', 'concluida', 'finalizada')
        )
    ) AS pending_correction_assignments
  FROM active_enrollments ae
  LEFT JOIN normalized_student_activities nsa
    ON nsa.course_id = ae.course_id
   AND nsa.student_id = ae.student_id
  GROUP BY ae.course_id
)
INSERT INTO public.dashboard_course_activity_aggregates (
  course_id,
  pending_submission_assignments,
  pending_correction_assignments,
  updated_at
)
SELECT
  course_id,
  pending_submission_assignments,
  pending_correction_assignments,
  now()
FROM course_aggregate_rows
ON CONFLICT (course_id) DO UPDATE
SET
  pending_submission_assignments = EXCLUDED.pending_submission_assignments,
  pending_correction_assignments = EXCLUDED.pending_correction_assignments,
  updated_at = EXCLUDED.updated_at;
