-- Add moodle_source to courses table
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS moodle_source TEXT NOT NULL DEFAULT 'goias';

-- Backfill existing rows
UPDATE public.courses SET moodle_source = 'goias' WHERE moodle_source IS NULL OR moodle_source = '';

-- Drop old unique constraint on moodle_course_id alone
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_moodle_course_id_key;

-- Add composite unique constraint
ALTER TABLE public.courses
  ADD CONSTRAINT courses_moodle_source_moodle_course_id_key UNIQUE (moodle_source, moodle_course_id);

-- Add moodle_source to students table
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS moodle_source TEXT NOT NULL DEFAULT 'goias';

-- Backfill existing rows
UPDATE public.students SET moodle_source = 'goias' WHERE moodle_source IS NULL OR moodle_source = '';

-- Drop old unique constraint on moodle_user_id alone
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_moodle_user_id_key;

-- Add composite unique constraint
ALTER TABLE public.students
  ADD CONSTRAINT students_moodle_source_moodle_user_id_key UNIQUE (moodle_source, moodle_user_id);

-- Create index for efficient lookup by source
CREATE INDEX IF NOT EXISTS idx_courses_moodle_source ON public.courses (moodle_source);
CREATE INDEX IF NOT EXISTS idx_students_moodle_source ON public.students (moodle_source);
