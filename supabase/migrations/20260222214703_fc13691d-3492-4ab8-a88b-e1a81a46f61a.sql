
-- Add missing columns to pending_tasks
ALTER TABLE public.pending_tasks 
  ADD COLUMN IF NOT EXISTS automation_type text;

-- Add missing columns to student_activities
ALTER TABLE public.student_activities 
  ADD COLUMN IF NOT EXISTS submitted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS graded_at timestamp with time zone;

-- Create index for automation deduplication
CREATE INDEX IF NOT EXISTS idx_pending_tasks_automation 
  ON public.pending_tasks (student_id, course_id, automation_type) 
  WHERE automation_type IS NOT NULL;
