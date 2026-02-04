-- Ensure Moodle IDs are unique to allow efficient UPSERTs
DO $$
BEGIN
  -- courses.moodle_course_id
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'courses_moodle_course_id_key'
  ) THEN
    ALTER TABLE public.courses
    ADD CONSTRAINT courses_moodle_course_id_key UNIQUE (moodle_course_id);
  END IF;

  -- students.moodle_user_id
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'students_moodle_user_id_key'
  ) THEN
    ALTER TABLE public.students
    ADD CONSTRAINT students_moodle_user_id_key UNIQUE (moodle_user_id);
  END IF;

  -- users.moodle_user_id
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_moodle_user_id_key'
  ) THEN
    ALTER TABLE public.users
    ADD CONSTRAINT users_moodle_user_id_key UNIQUE (moodle_user_id);
  END IF;

  -- Prevent duplicate links user<->course
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_courses_user_id_course_id_key'
  ) THEN
    ALTER TABLE public.user_courses
    ADD CONSTRAINT user_courses_user_id_course_id_key UNIQUE (user_id, course_id);
  END IF;
END $$;