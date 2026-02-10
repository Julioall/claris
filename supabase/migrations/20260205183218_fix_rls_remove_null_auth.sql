-- ============================================================
-- Remove auth.uid() IS NULL from RLS policies
-- This prevents unauthenticated access to data
-- Edge functions use service role key which bypasses RLS
-- ============================================================

-- COURSES TABLE: Users can only access courses they're associated with
DROP POLICY IF EXISTS "Users can view courses they have access to" ON public.courses;
DROP POLICY IF EXISTS "Users can insert courses" ON public.courses;
DROP POLICY IF EXISTS "Users can update courses" ON public.courses;

CREATE POLICY "Users can view courses they have access to" ON public.courses
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = courses.id AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert courses" ON public.courses
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update courses" ON public.courses
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = courses.id AND uc.user_id = auth.uid()
  )
);

-- STUDENTS TABLE: Users can only access students in their courses
DROP POLICY IF EXISTS "Users can view students in their courses" ON public.students;
DROP POLICY IF EXISTS "Users can insert students" ON public.students;
DROP POLICY IF EXISTS "Users can update students" ON public.students;

CREATE POLICY "Users can view students in their courses" ON public.students
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    JOIN public.student_courses sc ON sc.course_id = uc.course_id
    WHERE uc.user_id = auth.uid() AND sc.student_id = students.id
  )
);

CREATE POLICY "Users can insert students" ON public.students
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update students" ON public.students
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    JOIN public.student_courses sc ON sc.course_id = uc.course_id
    WHERE uc.user_id = auth.uid() AND sc.student_id = students.id
  )
);

-- STUDENT_COURSES TABLE: Users can only access student-course links for their courses
DROP POLICY IF EXISTS "Users can view student-course associations" ON public.student_courses;
DROP POLICY IF EXISTS "Users can insert student-course associations" ON public.student_courses;
DROP POLICY IF EXISTS "Users can update student-course associations" ON public.student_courses;

CREATE POLICY "Users can view student-course associations" ON public.student_courses
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = student_courses.course_id AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert student-course associations" ON public.student_courses
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = student_courses.course_id AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update student-course associations" ON public.student_courses
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = student_courses.course_id AND uc.user_id = auth.uid()
  )
);

-- STUDENT_ACTIVITIES TABLE: Users can only access activities for students in their courses
DROP POLICY IF EXISTS "Users can view activities of students in their courses" ON public.student_activities;

CREATE POLICY "Users can view activities of students in their courses" ON public.student_activities
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = student_activities.course_id AND uc.user_id = auth.uid()
  )
);

-- PENDING_TASKS TABLE: Users can access tasks they created or are assigned to
DROP POLICY IF EXISTS "Users can view tasks for students in their courses" ON public.pending_tasks;
DROP POLICY IF EXISTS "Users can create tasks" ON public.pending_tasks;
DROP POLICY IF EXISTS "Users can update tasks" ON public.pending_tasks;
DROP POLICY IF EXISTS "Users can delete tasks" ON public.pending_tasks;

CREATE POLICY "Users can view tasks for students in their courses" ON public.pending_tasks
FOR SELECT USING (
  created_by_user_id = auth.uid() OR
  assigned_to_user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = pending_tasks.course_id AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create tasks" ON public.pending_tasks
FOR INSERT WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "Users can update tasks" ON public.pending_tasks
FOR UPDATE USING (
  created_by_user_id = auth.uid() OR
  assigned_to_user_id = auth.uid()
);

CREATE POLICY "Users can delete tasks" ON public.pending_tasks
FOR DELETE USING (created_by_user_id = auth.uid());

-- ACTIVITY_FEED TABLE: Users can only access activity feed for their courses/students
DROP POLICY IF EXISTS "Users can view activity feed" ON public.activity_feed;
DROP POLICY IF EXISTS "Users can create activity feed" ON public.activity_feed;

CREATE POLICY "Users can view activity feed" ON public.activity_feed
FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = activity_feed.course_id AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create activity feed" ON public.activity_feed
FOR INSERT WITH CHECK (user_id = auth.uid());

-- RISK_HISTORY TABLE: Users can only access risk history for students in their courses
DROP POLICY IF EXISTS "Users can view risk history" ON public.risk_history;
DROP POLICY IF EXISTS "Users can create risk history" ON public.risk_history;

CREATE POLICY "Users can view risk history" ON public.risk_history
FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    JOIN public.student_courses sc ON sc.course_id = uc.course_id
    WHERE uc.user_id = auth.uid() AND sc.student_id = risk_history.student_id
  )
);

CREATE POLICY "Users can create risk history" ON public.risk_history
FOR INSERT WITH CHECK (user_id = auth.uid());

-- USERS, USER_COURSES, USER_IGNORED_COURSES, NOTES, ACTIONS tables
-- These already have proper policies without auth.uid() IS NULL
-- (only checking user_id = auth.uid())
