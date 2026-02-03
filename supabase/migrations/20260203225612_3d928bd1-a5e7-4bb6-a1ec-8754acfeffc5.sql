-- Create table to store student activities/grades from Moodle
CREATE TABLE public.student_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  moodle_activity_id TEXT NOT NULL,
  activity_name TEXT NOT NULL,
  activity_type TEXT,
  grade DECIMAL(10, 2),
  grade_max DECIMAL(10, 2),
  percentage DECIMAL(5, 2),
  status TEXT, -- 'completed', 'pending', 'not_started'
  completed_at TIMESTAMP WITH TIME ZONE,
  due_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(student_id, course_id, moodle_activity_id)
);

-- Create index for faster lookups
CREATE INDEX idx_student_activities_student ON public.student_activities(student_id);
CREATE INDEX idx_student_activities_course ON public.student_activities(course_id);
CREATE INDEX idx_student_activities_status ON public.student_activities(status);

-- Enable RLS
ALTER TABLE public.student_activities ENABLE ROW LEVEL SECURITY;

-- Create policies for user access via their courses
CREATE POLICY "Users can view activities of students in their courses"
ON public.student_activities
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = student_activities.course_id
    AND uc.user_id = auth.uid()
  )
);

-- Allow service role to insert/update
CREATE POLICY "Service role can manage activities"
ON public.student_activities
FOR ALL
USING (true)
WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_student_activities_updated_at
BEFORE UPDATE ON public.student_activities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();