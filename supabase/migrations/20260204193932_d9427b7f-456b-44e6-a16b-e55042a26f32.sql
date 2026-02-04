-- Add hidden column to student_activities table
-- This allows hiding specific activities from metrics calculations
ALTER TABLE public.student_activities 
ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

-- Create index for faster filtering of visible activities
CREATE INDEX IF NOT EXISTS idx_student_activities_hidden ON public.student_activities(hidden);

-- Add comment for documentation
COMMENT ON COLUMN public.student_activities.hidden IS 'When true, this activity is excluded from all student metrics and evaluations';