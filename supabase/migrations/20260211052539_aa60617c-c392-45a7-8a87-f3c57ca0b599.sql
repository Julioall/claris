-- Add last_access column to student_courses for course-specific access tracking
ALTER TABLE public.student_courses 
ADD COLUMN IF NOT EXISTS last_access timestamp with time zone;

-- Add comment for clarity
COMMENT ON COLUMN public.student_courses.last_access IS 'Last access to this specific course from Moodle lastcourseaccess field';