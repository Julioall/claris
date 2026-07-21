-- Epic 5 / SB-0504: keep grade-suggestion job state behind backend use cases.

-- Resolve legacy duplicate active jobs deterministically before enforcing the
-- invariant. The newest job remains active; older duplicates and their open
-- items become terminal and will no longer be resumed by workers.
WITH duplicate_active_jobs AS (
  SELECT id
  FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY user_id, course_id, moodle_activity_id
        ORDER BY created_at DESC, id DESC
      ) AS position
    FROM public.ai_grade_suggestion_jobs
    WHERE status IN ('pending', 'processing')
  ) ranked_jobs
  WHERE position > 1
)
UPDATE public.ai_grade_suggestion_job_items item_row
SET
  completed_at = COALESCE(item_row.completed_at, now()),
  error_message = COALESCE(
    item_row.error_message,
    'Job duplicado encerrado durante a migracao de seguranca.'
  ),
  status = 'cancelled'
WHERE item_row.job_id IN (SELECT id FROM duplicate_active_jobs)
  AND item_row.status IN ('pending', 'processing');

WITH duplicate_active_jobs AS (
  SELECT id
  FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY user_id, course_id, moodle_activity_id
        ORDER BY created_at DESC, id DESC
      ) AS position
    FROM public.ai_grade_suggestion_jobs
    WHERE status IN ('pending', 'processing')
  ) ranked_jobs
  WHERE position > 1
)
UPDATE public.ai_grade_suggestion_jobs job_row
SET
  completed_at = COALESCE(job_row.completed_at, now()),
  error_message = COALESCE(
    job_row.error_message,
    'Job duplicado encerrado durante a migracao de seguranca.'
  ),
  status = 'cancelled'
WHERE job_row.id IN (SELECT id FROM duplicate_active_jobs);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_grade_suggestion_jobs_one_active_activity
  ON public.ai_grade_suggestion_jobs (user_id, course_id, moodle_activity_id)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_ai_grade_suggestion_jobs_relevant_activity
  ON public.ai_grade_suggestion_jobs (
    user_id,
    course_id,
    moodle_activity_id,
    created_at DESC,
    id DESC
  )
  WHERE status IN ('pending', 'processing', 'failed', 'completed');

CREATE OR REPLACE FUNCTION public.backend_create_grade_suggestion_job_with_items(
  p_user_id UUID,
  p_course_id UUID,
  p_moodle_activity_id TEXT,
  p_activity_name TEXT,
  p_max_grade NUMERIC,
  p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_job_id UUID;
  v_item_count INTEGER;
  v_job_id UUID;
BEGIN
  IF p_user_id IS NULL
    OR p_course_id IS NULL
    OR length(trim(COALESCE(p_moodle_activity_id, ''))) = 0
    OR length(p_moodle_activity_id) > 255
    OR length(trim(COALESCE(p_activity_name, ''))) = 0
    OR length(p_activity_name) > 1000
    OR (p_max_grade IS NOT NULL AND p_max_grade < 0)
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid grade suggestion job' USING ERRCODE = '22023';
  END IF;

  IF NOT public.user_has_course_access(p_user_id, p_course_id) THEN
    RAISE EXCEPTION 'Course access denied' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)
  INTO v_item_count
  FROM jsonb_to_recordset(p_items) AS item_row(
    moodle_activity_id TEXT,
    student_activity_id UUID,
    student_id UUID,
    student_name TEXT
  );

  IF v_item_count = 0 OR v_item_count > 2000 THEN
    RAISE EXCEPTION 'Invalid grade suggestion job item count' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS item_row(
      moodle_activity_id TEXT,
      student_activity_id UUID,
      student_id UUID,
      student_name TEXT
    )
    WHERE item_row.student_activity_id IS NULL
      OR item_row.student_id IS NULL
      OR item_row.moodle_activity_id IS DISTINCT FROM p_moodle_activity_id
      OR length(trim(COALESCE(item_row.student_name, ''))) = 0
      OR length(item_row.student_name) > 1000
  ) THEN
    RAISE EXCEPTION 'Invalid grade suggestion job item' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT item_row.student_activity_id)
    FROM jsonb_to_recordset(p_items) AS item_row(student_activity_id UUID)
  ) <> v_item_count THEN
    RAISE EXCEPTION 'Duplicate grade suggestion job item' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS item_row(
      moodle_activity_id TEXT,
      student_activity_id UUID,
      student_id UUID,
      student_name TEXT
    )
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.student_activities activity_row
      WHERE activity_row.id = item_row.student_activity_id
        AND activity_row.student_id = item_row.student_id
        AND activity_row.course_id = p_course_id
        AND activity_row.moodle_activity_id = p_moodle_activity_id
        AND activity_row.activity_type IN ('assign', 'assignment')
    )
  ) THEN
    RAISE EXCEPTION 'Grade suggestion activity not found' USING ERRCODE = 'P0002';
  END IF;

  -- Serialize creation for one actor/activity. The partial unique index remains
  -- the final invariant for any future backend caller.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_user_id::TEXT || ':' || p_course_id::TEXT || ':' || p_moodle_activity_id,
    0
  ));

  SELECT job_row.id
  INTO v_existing_job_id
  FROM public.ai_grade_suggestion_jobs job_row
  WHERE job_row.user_id = p_user_id
    AND job_row.course_id = p_course_id
    AND job_row.moodle_activity_id = p_moodle_activity_id
    AND job_row.status IN ('pending', 'processing')
  ORDER BY job_row.created_at DESC, job_row.id DESC
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    RETURN v_existing_job_id;
  END IF;

  INSERT INTO public.ai_grade_suggestion_jobs (
    activity_name,
    course_id,
    max_grade,
    moodle_activity_id,
    total_items,
    user_id
  )
  VALUES (
    trim(p_activity_name),
    p_course_id,
    p_max_grade,
    trim(p_moodle_activity_id),
    v_item_count,
    p_user_id
  )
  RETURNING id INTO v_job_id;

  INSERT INTO public.ai_grade_suggestion_job_items (
    job_id,
    moodle_activity_id,
    student_activity_id,
    student_id,
    student_name,
    user_id
  )
  SELECT
    v_job_id,
    item_row.moodle_activity_id,
    item_row.student_activity_id,
    item_row.student_id,
    trim(item_row.student_name),
    p_user_id
  FROM jsonb_to_recordset(p_items) AS item_row(
    moodle_activity_id TEXT,
    student_activity_id UUID,
    student_id UUID,
    student_name TEXT
  );

  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_cancel_grade_suggestion_job(
  p_user_id UUID,
  p_job_id UUID,
  p_error_message TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job_status public.ai_grade_suggestion_job_status;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_user_id IS NULL
    OR p_job_id IS NULL
    OR length(trim(COALESCE(p_error_message, ''))) = 0
    OR length(p_error_message) > 2000 THEN
    RAISE EXCEPTION 'Invalid grade suggestion job cancellation' USING ERRCODE = '22023';
  END IF;

  SELECT job_row.status
  INTO v_job_status
  FROM public.ai_grade_suggestion_jobs job_row
  WHERE job_row.id = p_job_id
    AND job_row.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grade suggestion job not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_job_status NOT IN ('pending', 'processing') THEN
    RETURN false;
  END IF;

  UPDATE public.ai_grade_suggestion_job_items
  SET
    completed_at = v_now,
    error_message = trim(p_error_message),
    status = 'cancelled'
  WHERE job_id = p_job_id
    AND user_id = p_user_id
    AND status = 'pending';

  UPDATE public.ai_grade_suggestion_jobs job_row
  SET
    completed_at = v_now,
    error_count = counters.error_count,
    error_message = trim(p_error_message),
    processed_items = counters.processed_items,
    status = 'cancelled',
    success_count = counters.success_count,
    total_items = counters.total_items
  FROM (
    SELECT
      count(*) FILTER (WHERE item_row.status = 'failed')::INTEGER AS error_count,
      count(*) FILTER (
        WHERE item_row.status IN ('completed', 'failed', 'cancelled')
      )::INTEGER AS processed_items,
      count(*) FILTER (WHERE item_row.status = 'completed')::INTEGER AS success_count,
      count(*)::INTEGER AS total_items
    FROM public.ai_grade_suggestion_job_items item_row
    WHERE item_row.job_id = p_job_id
      AND item_row.user_id = p_user_id
  ) counters
  WHERE job_row.id = p_job_id
    AND job_row.user_id = p_user_id
    AND job_row.status IN ('pending', 'processing');

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.backend_create_grade_suggestion_job_with_items(
  UUID, UUID, TEXT, TEXT, NUMERIC, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_create_grade_suggestion_job_with_items(
  UUID, UUID, TEXT, TEXT, NUMERIC, JSONB
) TO service_role;

REVOKE ALL ON FUNCTION public.backend_cancel_grade_suggestion_job(
  UUID, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_cancel_grade_suggestion_job(
  UUID, UUID, TEXT
) TO service_role;

REVOKE ALL ON TABLE
  public.ai_grade_suggestion_jobs,
  public.ai_grade_suggestion_job_items,
  public.ai_grade_suggestion_history
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.ai_grade_suggestion_jobs,
  public.ai_grade_suggestion_job_items,
  public.ai_grade_suggestion_history
TO service_role;
