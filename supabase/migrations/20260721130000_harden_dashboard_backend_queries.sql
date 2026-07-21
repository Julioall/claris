-- Restrict aggregate refreshes to trusted backend callers. The function is
-- SECURITY DEFINER, so browser roles must not be able to invoke it directly.
REVOKE EXECUTE ON FUNCTION public.refresh_course_dashboard_aggregate(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_course_dashboard_aggregate(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_course_dashboard_aggregate(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_course_dashboard_aggregate(UUID) TO service_role;

-- Daily agenda lookup for the authenticated owner.
CREATE INDEX IF NOT EXISTS idx_calendar_events_owner_start_at
  ON public.calendar_events (owner, start_at);

-- The dashboard reads open tasks due in a date window through either side of
-- the ownership relation. Separate indexes allow PostgreSQL to combine both
-- branches of the OR with bitmap scans.
CREATE INDEX IF NOT EXISTS idx_tasks_created_by_open_due_date
  ON public.tasks (created_by, due_date)
  WHERE status <> 'done'
    AND created_by IS NOT NULL
    AND due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_open_due_date
  ON public.tasks (assigned_to, due_date)
  WHERE status <> 'done'
    AND assigned_to IS NOT NULL
    AND due_date IS NOT NULL;

-- Recent feed queries are independently scoped by owner or course.
CREATE INDEX IF NOT EXISTS idx_activity_feed_user_created_at
  ON public.activity_feed (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_feed_course_created_at
  ON public.activity_feed (course_id, created_at DESC)
  WHERE course_id IS NOT NULL;

-- Reassert the temporal student lookup already introduced by the performance
-- baseline. IF NOT EXISTS keeps this migration safe on every environment.
CREATE INDEX IF NOT EXISTS idx_risk_history_student_recorded
  ON public.risk_history (student_id, created_at DESC);

-- Narrow the high-volume activity scan to visible assignment candidates. The
-- leading course/student pair also supports the active-enrollment join used by
-- dashboard academic rules.
CREATE INDEX IF NOT EXISTS idx_student_activities_dashboard_candidates
  ON public.student_activities (course_id, student_id, due_date, submitted_at)
  WHERE hidden = false
    AND activity_type IN ('assign', 'assignment');
