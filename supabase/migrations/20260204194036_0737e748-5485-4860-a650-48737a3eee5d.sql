-- Allow users with course access to update the hidden column on activities
CREATE POLICY "Users can update activity visibility"
ON public.student_activities
FOR UPDATE
USING (
  (auth.uid() IS NULL) OR 
  (EXISTS (
    SELECT 1 FROM user_courses uc 
    WHERE uc.course_id = student_activities.course_id 
    AND uc.user_id = auth.uid()
  ))
);