-- Add is_recovery column to student_activities table
-- This allows marking activities as recovery, which affects grade calculations
ALTER TABLE public.student_activities 
ADD COLUMN IF NOT EXISTS is_recovery BOOLEAN NOT NULL DEFAULT false;

-- Create index for faster filtering of recovery activities
CREATE INDEX IF NOT EXISTS idx_student_activities_is_recovery ON public.student_activities(is_recovery);

-- Add comment for documentation
COMMENT ON COLUMN public.student_activities.is_recovery IS 'When true, this activity is a recovery activity. Grade calculation: (sum of all activities including recovery) / 2';
