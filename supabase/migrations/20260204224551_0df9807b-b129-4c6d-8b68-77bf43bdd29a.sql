-- Create table for storing student course grades (total grade per course)
CREATE TABLE public.student_course_grades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  grade_raw NUMERIC NULL,
  grade_max NUMERIC NULL DEFAULT 100,
  grade_percentage NUMERIC NULL,
  grade_formatted TEXT NULL,
  letter_grade TEXT NULL,
  last_sync TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT student_course_grades_unique UNIQUE (student_id, course_id)
);

-- Enable RLS
ALTER TABLE public.student_course_grades ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view grades of students in their courses"
ON public.student_course_grades
FOR SELECT
USING (
  auth.uid() IS NULL OR 
  EXISTS (
    SELECT 1 FROM user_courses uc
    WHERE uc.course_id = student_course_grades.course_id
    AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage grades"
ON public.student_course_grades
FOR ALL
USING (auth.uid() IS NULL)
WITH CHECK (auth.uid() IS NULL);

-- Create index for faster lookups
CREATE INDEX idx_student_course_grades_student ON public.student_course_grades(student_id);
CREATE INDEX idx_student_course_grades_course ON public.student_course_grades(course_id);