-- Create table to store ignored courses for sync
CREATE TABLE public.user_ignored_courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, course_id)
);

-- Enable Row Level Security
ALTER TABLE public.user_ignored_courses ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own ignored courses"
ON public.user_ignored_courses
FOR SELECT
USING (true);

CREATE POLICY "Users can insert ignored courses"
ON public.user_ignored_courses
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can delete own ignored courses"
ON public.user_ignored_courses
FOR DELETE
USING (true);