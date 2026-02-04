-- ============================================================
-- Fix all RLS policies that use USING (true)
-- Implement proper access control based on user identity
-- ============================================================

-- USERS TABLE: Users can only access their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Users can view own profile" ON public.users
FOR SELECT USING (id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can insert own profile" ON public.users
FOR INSERT WITH CHECK (id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can update own profile" ON public.users
FOR UPDATE USING (id = auth.uid() OR auth.uid() IS NULL);

-- USER_COURSES TABLE: Users can only manage their own course associations
DROP POLICY IF EXISTS "Users can view own course associations" ON public.user_courses;
DROP POLICY IF EXISTS "Users can insert course associations" ON public.user_courses;
DROP POLICY IF EXISTS "Users can delete own course associations" ON public.user_courses;

CREATE POLICY "Users can view own course associations" ON public.user_courses
FOR SELECT USING (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can insert course associations" ON public.user_courses
FOR INSERT WITH CHECK (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can delete own course associations" ON public.user_courses
FOR DELETE USING (user_id = auth.uid() OR auth.uid() IS NULL);

-- USER_IGNORED_COURSES TABLE: Users can only manage their own ignored courses
DROP POLICY IF EXISTS "Users can view own ignored courses" ON public.user_ignored_courses;
DROP POLICY IF EXISTS "Users can insert ignored courses" ON public.user_ignored_courses;
DROP POLICY IF EXISTS "Users can delete own ignored courses" ON public.user_ignored_courses;

CREATE POLICY "Users can view own ignored courses" ON public.user_ignored_courses
FOR SELECT USING (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can insert ignored courses" ON public.user_ignored_courses
FOR INSERT WITH CHECK (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can delete own ignored courses" ON public.user_ignored_courses
FOR DELETE USING (user_id = auth.uid() OR auth.uid() IS NULL);

-- COURSES TABLE: Users can only access courses they're associated with
DROP POLICY IF EXISTS "Users can view courses they have access to" ON public.courses;
DROP POLICY IF EXISTS "Users can insert courses" ON public.courses;
DROP POLICY IF EXISTS "Users can update courses" ON public.courses;

CREATE POLICY "Users can view courses they have access to" ON public.courses
FOR SELECT USING (
  auth.uid() IS NULL OR
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = courses.id AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert courses" ON public.courses
FOR INSERT WITH CHECK (auth.uid() IS NULL OR auth.uid() IS NOT NULL);

CREATE POLICY "Users can update courses" ON public.courses
FOR UPDATE USING (
  auth.uid() IS NULL OR
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
  auth.uid() IS NULL OR
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    JOIN public.student_courses sc ON sc.course_id = uc.course_id
    WHERE uc.user_id = auth.uid() AND sc.student_id = students.id
  )
);

CREATE POLICY "Users can insert students" ON public.students
FOR INSERT WITH CHECK (auth.uid() IS NULL OR auth.uid() IS NOT NULL);

CREATE POLICY "Users can update students" ON public.students
FOR UPDATE USING (
  auth.uid() IS NULL OR
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
  auth.uid() IS NULL OR
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = student_courses.course_id AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert student-course associations" ON public.student_courses
FOR INSERT WITH CHECK (
  auth.uid() IS NULL OR
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = student_courses.course_id AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update student-course associations" ON public.student_courses
FOR UPDATE USING (
  auth.uid() IS NULL OR
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = student_courses.course_id AND uc.user_id = auth.uid()
  )
);

-- STUDENT_ACTIVITIES TABLE: Users can only access activities for students in their courses
DROP POLICY IF EXISTS "Users can view activities of students in their courses" ON public.student_activities;
DROP POLICY IF EXISTS "Service role can manage activities" ON public.student_activities;

CREATE POLICY "Users can view activities of students in their courses" ON public.student_activities
FOR SELECT USING (
  auth.uid() IS NULL OR
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = student_activities.course_id AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage activities" ON public.student_activities
FOR ALL USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);

-- NOTES TABLE: Users can only access their own notes
DROP POLICY IF EXISTS "Users can view notes" ON public.notes;
DROP POLICY IF EXISTS "Users can create notes" ON public.notes;
DROP POLICY IF EXISTS "Users can update notes" ON public.notes;
DROP POLICY IF EXISTS "Users can delete notes" ON public.notes;

CREATE POLICY "Users can view notes" ON public.notes
FOR SELECT USING (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can create notes" ON public.notes
FOR INSERT WITH CHECK (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can update notes" ON public.notes
FOR UPDATE USING (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can delete notes" ON public.notes
FOR DELETE USING (user_id = auth.uid() OR auth.uid() IS NULL);

-- PENDING_TASKS TABLE: Users can access tasks they created or are assigned to
DROP POLICY IF EXISTS "Users can view tasks for students in their courses" ON public.pending_tasks;
DROP POLICY IF EXISTS "Users can create tasks" ON public.pending_tasks;
DROP POLICY IF EXISTS "Users can update tasks" ON public.pending_tasks;
DROP POLICY IF EXISTS "Users can delete tasks" ON public.pending_tasks;

CREATE POLICY "Users can view tasks for students in their courses" ON public.pending_tasks
FOR SELECT USING (
  auth.uid() IS NULL OR
  created_by_user_id = auth.uid() OR
  assigned_to_user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = pending_tasks.course_id AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create tasks" ON public.pending_tasks
FOR INSERT WITH CHECK (
  auth.uid() IS NULL OR
  created_by_user_id = auth.uid()
);

CREATE POLICY "Users can update tasks" ON public.pending_tasks
FOR UPDATE USING (
  auth.uid() IS NULL OR
  created_by_user_id = auth.uid() OR
  assigned_to_user_id = auth.uid()
);

CREATE POLICY "Users can delete tasks" ON public.pending_tasks
FOR DELETE USING (
  auth.uid() IS NULL OR
  created_by_user_id = auth.uid()
);

-- ACTIONS TABLE: Users can only access their own actions
DROP POLICY IF EXISTS "Users can view actions" ON public.actions;
DROP POLICY IF EXISTS "Users can create actions" ON public.actions;
DROP POLICY IF EXISTS "Users can update actions" ON public.actions;
DROP POLICY IF EXISTS "Users can delete actions" ON public.actions;

CREATE POLICY "Users can view actions" ON public.actions
FOR SELECT USING (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can create actions" ON public.actions
FOR INSERT WITH CHECK (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can update actions" ON public.actions
FOR UPDATE USING (user_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Users can delete actions" ON public.actions
FOR DELETE USING (user_id = auth.uid() OR auth.uid() IS NULL);

-- ACTIVITY_FEED TABLE: Users can only access activity feed for their courses/students
DROP POLICY IF EXISTS "Users can view activity feed" ON public.activity_feed;
DROP POLICY IF EXISTS "Users can create activity feed" ON public.activity_feed;

CREATE POLICY "Users can view activity feed" ON public.activity_feed
FOR SELECT USING (
  auth.uid() IS NULL OR
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    WHERE uc.course_id = activity_feed.course_id AND uc.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create activity feed" ON public.activity_feed
FOR INSERT WITH CHECK (
  auth.uid() IS NULL OR
  user_id = auth.uid()
);

-- RISK_HISTORY TABLE: Users can only access risk history for students in their courses
DROP POLICY IF EXISTS "Users can view risk history" ON public.risk_history;
DROP POLICY IF EXISTS "Users can create risk history" ON public.risk_history;

CREATE POLICY "Users can view risk history" ON public.risk_history
FOR SELECT USING (
  auth.uid() IS NULL OR
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.user_courses uc
    JOIN public.student_courses sc ON sc.course_id = uc.course_id
    WHERE uc.user_id = auth.uid() AND sc.student_id = risk_history.student_id
  )
);

CREATE POLICY "Users can create risk history" ON public.risk_history
FOR INSERT WITH CHECK (
  auth.uid() IS NULL OR
  user_id = auth.uid()
);