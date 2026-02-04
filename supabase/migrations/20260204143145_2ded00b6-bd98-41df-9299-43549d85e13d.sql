-- Add unique constraint for student_activities upsert
DO $$
BEGIN
  -- student_courses unique
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_courses_student_id_course_id_key'
  ) THEN
    ALTER TABLE public.student_courses
    ADD CONSTRAINT student_courses_student_id_course_id_key UNIQUE (student_id, course_id);
  END IF;

  -- student_activities unique
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_activities_student_course_activity_key'
  ) THEN
    ALTER TABLE public.student_activities
    ADD CONSTRAINT student_activities_student_course_activity_key UNIQUE (student_id, course_id, moodle_activity_id);
  END IF;
END $$;