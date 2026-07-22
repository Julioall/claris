-- Scope every Moodle-dependent consumer to an owned, immutable connection.
-- Existing prototype rows must be reset instead of assigned to an arbitrary site.

ALTER TABLE public.bulk_message_jobs
  ADD COLUMN IF NOT EXISTS moodle_connection_id UUID REFERENCES public.user_moodle_connections(id) ON DELETE RESTRICT;
ALTER TABLE public.ai_grade_suggestion_jobs
  ADD COLUMN IF NOT EXISTS moodle_connection_id UUID REFERENCES public.user_moodle_connections(id) ON DELETE RESTRICT;
ALTER TABLE public.ai_grade_suggestion_history
  ADD COLUMN IF NOT EXISTS moodle_connection_id UUID REFERENCES public.user_moodle_connections(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.bulk_message_jobs WHERE moodle_connection_id IS NULL)
    OR EXISTS (SELECT 1 FROM public.ai_grade_suggestion_jobs WHERE moodle_connection_id IS NULL)
    OR EXISTS (SELECT 1 FROM public.ai_grade_suggestion_history WHERE moodle_connection_id IS NULL)
  THEN
    RAISE EXCEPTION 'Reset pre-publication Moodle consumer data before applying connection scope';
  END IF;
END $$;

ALTER TABLE public.bulk_message_jobs ALTER COLUMN moodle_connection_id SET NOT NULL;
ALTER TABLE public.ai_grade_suggestion_jobs ALTER COLUMN moodle_connection_id SET NOT NULL;
ALTER TABLE public.ai_grade_suggestion_history ALTER COLUMN moodle_connection_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS bulk_message_jobs_connection_created_idx
  ON public.bulk_message_jobs (moodle_connection_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS ai_grade_suggestion_jobs_connection_created_idx
  ON public.ai_grade_suggestion_jobs (moodle_connection_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS ai_grade_suggestion_history_connection_created_idx
  ON public.ai_grade_suggestion_history (moodle_connection_id, created_at DESC, id);

CREATE OR REPLACE FUNCTION public.validate_moodle_consumer_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  connection_owner UUID;
  connection_site UUID;
  course_site UUID;
BEGIN
  SELECT user_id, moodle_site_id INTO connection_owner, connection_site
  FROM public.user_moodle_connections WHERE id = NEW.moodle_connection_id;

  IF connection_owner IS NULL OR connection_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'Moodle consumer connection must belong to its user';
  END IF;

  IF TG_TABLE_NAME IN ('ai_grade_suggestion_jobs', 'ai_grade_suggestion_history') THEN
    SELECT moodle_site_id INTO course_site FROM public.courses WHERE id = NEW.course_id;
    IF course_site IS NULL OR course_site <> connection_site THEN
      RAISE EXCEPTION 'Grade suggestion course and Moodle connection must belong to the same site';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_bulk_message_job_scope ON public.bulk_message_jobs;
CREATE TRIGGER validate_bulk_message_job_scope
  BEFORE INSERT OR UPDATE OF user_id, moodle_connection_id ON public.bulk_message_jobs
  FOR EACH ROW EXECUTE FUNCTION public.validate_moodle_consumer_scope();
DROP TRIGGER IF EXISTS validate_grade_suggestion_job_scope ON public.ai_grade_suggestion_jobs;
CREATE TRIGGER validate_grade_suggestion_job_scope
  BEFORE INSERT OR UPDATE OF user_id, moodle_connection_id, course_id ON public.ai_grade_suggestion_jobs
  FOR EACH ROW EXECUTE FUNCTION public.validate_moodle_consumer_scope();
DROP TRIGGER IF EXISTS validate_grade_suggestion_history_scope ON public.ai_grade_suggestion_history;
CREATE TRIGGER validate_grade_suggestion_history_scope
  BEFORE INSERT OR UPDATE OF user_id, moodle_connection_id, course_id ON public.ai_grade_suggestion_history
  FOR EACH ROW EXECUTE FUNCTION public.validate_moodle_consumer_scope();

CREATE OR REPLACE FUNCTION public.validate_bulk_message_recipient_site()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  job_site UUID;
  student_site UUID;
BEGIN
  SELECT connection.moodle_site_id INTO job_site
  FROM public.bulk_message_jobs job
  JOIN public.user_moodle_connections connection ON connection.id = job.moodle_connection_id
  WHERE job.id = NEW.job_id;
  SELECT moodle_site_id INTO student_site FROM public.students WHERE id = NEW.student_id;

  IF job_site IS NULL OR student_site IS NULL OR job_site <> student_site THEN
    RAISE EXCEPTION 'Bulk message recipient and job connection must belong to the same Moodle site';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_bulk_message_recipient_site ON public.bulk_message_recipients;
CREATE TRIGGER validate_bulk_message_recipient_site
  BEFORE INSERT OR UPDATE OF job_id, student_id ON public.bulk_message_recipients
  FOR EACH ROW EXECUTE FUNCTION public.validate_bulk_message_recipient_site();

CREATE OR REPLACE FUNCTION public.backend_create_grade_suggestion_job_with_items(
  p_user_id UUID,
  p_course_id UUID,
  p_moodle_connection_id UUID,
  p_moodle_activity_id TEXT,
  p_activity_name TEXT,
  p_max_grade NUMERIC,
  p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_job_id UUID;
  v_item_count INTEGER;
  v_job_id UUID;
BEGIN
  IF p_user_id IS NULL OR p_course_id IS NULL OR p_moodle_connection_id IS NULL
    OR length(trim(COALESCE(p_moodle_activity_id, ''))) NOT BETWEEN 1 AND 255
    OR length(trim(COALESCE(p_activity_name, ''))) NOT BETWEEN 1 AND 1000
    OR (p_max_grade IS NOT NULL AND p_max_grade < 0)
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'Invalid grade suggestion job' USING ERRCODE = '22023';
  END IF;

  IF NOT public.user_has_course_access(p_user_id, p_course_id) THEN
    RAISE EXCEPTION 'Course access denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_moodle_connections connection
    JOIN public.courses course ON course.id = p_course_id
    WHERE connection.id = p_moodle_connection_id
      AND connection.user_id = p_user_id
      AND connection.status = 'active'
      AND connection.moodle_site_id = course.moodle_site_id
  ) THEN
    RAISE EXCEPTION 'Moodle connection/course scope denied' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_item_count
  FROM jsonb_to_recordset(p_items) AS item_row(
    moodle_activity_id TEXT, student_activity_id UUID, student_id UUID, student_name TEXT
  );
  IF v_item_count NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Invalid grade suggestion job item count' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS item_row(
      moodle_activity_id TEXT, student_activity_id UUID, student_id UUID, student_name TEXT
    )
    WHERE item_row.student_activity_id IS NULL
      OR item_row.student_id IS NULL
      OR item_row.moodle_activity_id IS DISTINCT FROM p_moodle_activity_id
      OR length(trim(COALESCE(item_row.student_name, ''))) NOT BETWEEN 1 AND 1000
      OR NOT EXISTS (
        SELECT 1 FROM public.student_activities activity
        WHERE activity.id = item_row.student_activity_id
          AND activity.student_id = item_row.student_id
          AND activity.course_id = p_course_id
          AND activity.moodle_activity_id = p_moodle_activity_id
          AND activity.activity_type IN ('assign', 'assignment')
      )
  ) OR (
    SELECT count(DISTINCT item_row.student_activity_id)
    FROM jsonb_to_recordset(p_items) AS item_row(student_activity_id UUID)
  ) <> v_item_count THEN
    RAISE EXCEPTION 'Invalid grade suggestion job item' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_user_id::TEXT || ':' || p_moodle_connection_id::TEXT || ':' || p_course_id::TEXT || ':' || p_moodle_activity_id,
    0
  ));
  SELECT id INTO v_existing_job_id
  FROM public.ai_grade_suggestion_jobs
  WHERE user_id = p_user_id
    AND moodle_connection_id = p_moodle_connection_id
    AND course_id = p_course_id
    AND moodle_activity_id = p_moodle_activity_id
    AND status IN ('pending', 'processing')
  ORDER BY created_at DESC, id DESC LIMIT 1;
  IF v_existing_job_id IS NOT NULL THEN RETURN v_existing_job_id; END IF;

  INSERT INTO public.ai_grade_suggestion_jobs (
    activity_name, course_id, max_grade, moodle_activity_id,
    moodle_connection_id, total_items, user_id
  ) VALUES (
    trim(p_activity_name), p_course_id, p_max_grade, trim(p_moodle_activity_id),
    p_moodle_connection_id, v_item_count, p_user_id
  ) RETURNING id INTO v_job_id;

  INSERT INTO public.ai_grade_suggestion_job_items (
    job_id, moodle_activity_id, student_activity_id, student_id, student_name, user_id
  )
  SELECT v_job_id, item_row.moodle_activity_id, item_row.student_activity_id,
    item_row.student_id, trim(item_row.student_name), p_user_id
  FROM jsonb_to_recordset(p_items) AS item_row(
    moodle_activity_id TEXT, student_activity_id UUID, student_id UUID, student_name TEXT
  );
  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.backend_create_grade_suggestion_job_with_items(
  UUID, UUID, UUID, TEXT, TEXT, NUMERIC, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_create_grade_suggestion_job_with_items(
  UUID, UUID, UUID, TEXT, TEXT, NUMERIC, JSONB
) TO service_role;
