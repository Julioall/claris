
-- Drop ALL existing policies on action_types (both with and without trailing space)
DROP POLICY IF EXISTS "Users can view own action types" ON public.action_types;
DROP POLICY IF EXISTS "Users can view own action types " ON public.action_types;
DROP POLICY IF EXISTS "Users can create own action types" ON public.action_types;
DROP POLICY IF EXISTS "Users can create own action types " ON public.action_types;
DROP POLICY IF EXISTS "Users can update own action types" ON public.action_types;
DROP POLICY IF EXISTS "Users can update own action types " ON public.action_types;
DROP POLICY IF EXISTS "Users can delete own action types" ON public.action_types;
DROP POLICY IF EXISTS "Users can delete own action types " ON public.action_types;

CREATE POLICY "action_types_select" ON public.action_types FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "action_types_insert" ON public.action_types FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "action_types_update" ON public.action_types FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "action_types_delete" ON public.action_types FOR DELETE USING (user_id = auth.uid());

-- Fix actions
DROP POLICY IF EXISTS "Users can view actions" ON public.actions;
DROP POLICY IF EXISTS "Users can view actions " ON public.actions;
DROP POLICY IF EXISTS "Users can create actions" ON public.actions;
DROP POLICY IF EXISTS "Users can create actions " ON public.actions;
DROP POLICY IF EXISTS "Users can update actions" ON public.actions;
DROP POLICY IF EXISTS "Users can update actions " ON public.actions;
DROP POLICY IF EXISTS "Users can delete actions" ON public.actions;
DROP POLICY IF EXISTS "Users can delete actions " ON public.actions;

CREATE POLICY "actions_select" ON public.actions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "actions_insert" ON public.actions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "actions_update" ON public.actions FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "actions_delete" ON public.actions FOR DELETE USING (user_id = auth.uid());

-- Fix activity_feed
DROP POLICY IF EXISTS "Users can view activity feed" ON public.activity_feed;
DROP POLICY IF EXISTS "Users can view activity feed " ON public.activity_feed;
DROP POLICY IF EXISTS "Users can create activity feed" ON public.activity_feed;
DROP POLICY IF EXISTS "Users can create activity feed " ON public.activity_feed;

CREATE POLICY "activity_feed_select" ON public.activity_feed FOR SELECT USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM user_courses uc WHERE uc.course_id = activity_feed.course_id AND uc.user_id = auth.uid()));
CREATE POLICY "activity_feed_insert" ON public.activity_feed FOR INSERT WITH CHECK (user_id = auth.uid());

-- Fix courses
DROP POLICY IF EXISTS "Users can view courses they have access to" ON public.courses;
DROP POLICY IF EXISTS "Users can view courses they have access to " ON public.courses;
DROP POLICY IF EXISTS "Users can insert courses" ON public.courses;
DROP POLICY IF EXISTS "Users can insert courses " ON public.courses;
DROP POLICY IF EXISTS "Users can update courses" ON public.courses;
DROP POLICY IF EXISTS "Users can update courses " ON public.courses;

CREATE POLICY "courses_select" ON public.courses FOR SELECT USING (EXISTS (SELECT 1 FROM user_courses uc WHERE uc.course_id = courses.id AND uc.user_id = auth.uid()));
CREATE POLICY "courses_insert" ON public.courses FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "courses_update" ON public.courses FOR UPDATE USING (EXISTS (SELECT 1 FROM user_courses uc WHERE uc.course_id = courses.id AND uc.user_id = auth.uid()));

-- Fix notes
DROP POLICY IF EXISTS "Users can view notes" ON public.notes;
DROP POLICY IF EXISTS "Users can view notes " ON public.notes;
DROP POLICY IF EXISTS "Users can create notes" ON public.notes;
DROP POLICY IF EXISTS "Users can create notes " ON public.notes;
DROP POLICY IF EXISTS "Users can update notes" ON public.notes;
DROP POLICY IF EXISTS "Users can update notes " ON public.notes;
DROP POLICY IF EXISTS "Users can delete notes" ON public.notes;
DROP POLICY IF EXISTS "Users can delete notes " ON public.notes;

CREATE POLICY "notes_select" ON public.notes FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notes_insert" ON public.notes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "notes_update" ON public.notes FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notes_delete" ON public.notes FOR DELETE USING (user_id = auth.uid());

-- Fix pending_tasks
DROP POLICY IF EXISTS "Users can view tasks for students in their courses" ON public.pending_tasks;
DROP POLICY IF EXISTS "Users can view tasks for students in their courses " ON public.pending_tasks;
DROP POLICY IF EXISTS "Users can create tasks" ON public.pending_tasks;
DROP POLICY IF EXISTS "Users can create tasks " ON public.pending_tasks;
DROP POLICY IF EXISTS "Users can update tasks" ON public.pending_tasks;
DROP POLICY IF EXISTS "Users can update tasks " ON public.pending_tasks;
DROP POLICY IF EXISTS "Users can delete tasks" ON public.pending_tasks;
DROP POLICY IF EXISTS "Users can delete tasks " ON public.pending_tasks;

CREATE POLICY "pending_tasks_select" ON public.pending_tasks FOR SELECT USING (created_by_user_id = auth.uid() OR assigned_to_user_id = auth.uid() OR EXISTS (SELECT 1 FROM user_courses uc WHERE uc.course_id = pending_tasks.course_id AND uc.user_id = auth.uid()));
CREATE POLICY "pending_tasks_insert" ON public.pending_tasks FOR INSERT WITH CHECK (created_by_user_id = auth.uid());
CREATE POLICY "pending_tasks_update" ON public.pending_tasks FOR UPDATE USING (created_by_user_id = auth.uid() OR assigned_to_user_id = auth.uid());
CREATE POLICY "pending_tasks_delete" ON public.pending_tasks FOR DELETE USING (created_by_user_id = auth.uid());

-- Fix risk_history
DROP POLICY IF EXISTS "Users can view risk history" ON public.risk_history;
DROP POLICY IF EXISTS "Users can view risk history " ON public.risk_history;
DROP POLICY IF EXISTS "Users can create risk history" ON public.risk_history;
DROP POLICY IF EXISTS "Users can create risk history " ON public.risk_history;

CREATE POLICY "risk_history_select" ON public.risk_history FOR SELECT USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM user_courses uc JOIN student_courses sc ON sc.course_id = uc.course_id WHERE uc.user_id = auth.uid() AND sc.student_id = risk_history.student_id));
CREATE POLICY "risk_history_insert" ON public.risk_history FOR INSERT WITH CHECK (user_id = auth.uid());

-- Fix student_activities
DROP POLICY IF EXISTS "Users can view activities of students in their courses" ON public.student_activities;
DROP POLICY IF EXISTS "Users can view activities of students in their courses " ON public.student_activities;
DROP POLICY IF EXISTS "Service role can manage activities" ON public.student_activities;
DROP POLICY IF EXISTS "Service role can manage activities " ON public.student_activities;
DROP POLICY IF EXISTS "Users can update activity visibility" ON public.student_activities;
DROP POLICY IF EXISTS "Users can update activity visibility " ON public.student_activities;

CREATE POLICY "student_activities_select" ON public.student_activities FOR SELECT USING (EXISTS (SELECT 1 FROM user_courses uc WHERE uc.course_id = student_activities.course_id AND uc.user_id = auth.uid()));
CREATE POLICY "student_activities_service" ON public.student_activities FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "student_activities_update" ON public.student_activities FOR UPDATE USING (EXISTS (SELECT 1 FROM user_courses uc WHERE uc.course_id = student_activities.course_id AND uc.user_id = auth.uid()));

-- Fix student_course_grades
DROP POLICY IF EXISTS "Users can view grades of students in their courses" ON public.student_course_grades;
DROP POLICY IF EXISTS "Users can view grades of students in their courses " ON public.student_course_grades;
DROP POLICY IF EXISTS "Service role can manage grades" ON public.student_course_grades;
DROP POLICY IF EXISTS "Service role can manage grades " ON public.student_course_grades;

CREATE POLICY "student_course_grades_select" ON public.student_course_grades FOR SELECT USING (EXISTS (SELECT 1 FROM user_courses uc WHERE uc.course_id = student_course_grades.course_id AND uc.user_id = auth.uid()));
CREATE POLICY "student_course_grades_service" ON public.student_course_grades FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Fix student_courses
DROP POLICY IF EXISTS "Users can view student-course associations" ON public.student_courses;
DROP POLICY IF EXISTS "Users can view student-course associations " ON public.student_courses;
DROP POLICY IF EXISTS "Users can insert student-course associations" ON public.student_courses;
DROP POLICY IF EXISTS "Users can insert student-course associations " ON public.student_courses;
DROP POLICY IF EXISTS "Users can update student-course associations" ON public.student_courses;
DROP POLICY IF EXISTS "Users can update student-course associations " ON public.student_courses;

CREATE POLICY "student_courses_select" ON public.student_courses FOR SELECT USING (EXISTS (SELECT 1 FROM user_courses uc WHERE uc.course_id = student_courses.course_id AND uc.user_id = auth.uid()));
CREATE POLICY "student_courses_insert" ON public.student_courses FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM user_courses uc WHERE uc.course_id = student_courses.course_id AND uc.user_id = auth.uid()));
CREATE POLICY "student_courses_update" ON public.student_courses FOR UPDATE USING (EXISTS (SELECT 1 FROM user_courses uc WHERE uc.course_id = student_courses.course_id AND uc.user_id = auth.uid()));

-- Fix students
DROP POLICY IF EXISTS "Users can view students in their courses" ON public.students;
DROP POLICY IF EXISTS "Users can view students in their courses " ON public.students;
DROP POLICY IF EXISTS "Users can insert students" ON public.students;
DROP POLICY IF EXISTS "Users can insert students " ON public.students;
DROP POLICY IF EXISTS "Users can update students" ON public.students;
DROP POLICY IF EXISTS "Users can update students " ON public.students;

CREATE POLICY "students_select" ON public.students FOR SELECT USING (EXISTS (SELECT 1 FROM user_courses uc JOIN student_courses sc ON sc.course_id = uc.course_id WHERE uc.user_id = auth.uid() AND sc.student_id = students.id));
CREATE POLICY "students_insert" ON public.students FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "students_update" ON public.students FOR UPDATE USING (EXISTS (SELECT 1 FROM user_courses uc JOIN student_courses sc ON sc.course_id = uc.course_id WHERE uc.user_id = auth.uid() AND sc.student_id = students.id));

-- Fix user_courses
DROP POLICY IF EXISTS "Users can view own course associations" ON public.user_courses;
DROP POLICY IF EXISTS "Users can view own course associations " ON public.user_courses;
DROP POLICY IF EXISTS "Users can insert course associations" ON public.user_courses;
DROP POLICY IF EXISTS "Users can insert course associations " ON public.user_courses;
DROP POLICY IF EXISTS "Users can delete own course associations" ON public.user_courses;
DROP POLICY IF EXISTS "Users can delete own course associations " ON public.user_courses;

CREATE POLICY "user_courses_select" ON public.user_courses FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "user_courses_insert" ON public.user_courses FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_courses_delete" ON public.user_courses FOR DELETE USING (user_id = auth.uid());

-- Fix user_ignored_courses
DROP POLICY IF EXISTS "Users can view own ignored courses" ON public.user_ignored_courses;
DROP POLICY IF EXISTS "Users can view own ignored courses " ON public.user_ignored_courses;
DROP POLICY IF EXISTS "Users can insert ignored courses" ON public.user_ignored_courses;
DROP POLICY IF EXISTS "Users can insert ignored courses " ON public.user_ignored_courses;
DROP POLICY IF EXISTS "Users can delete own ignored courses" ON public.user_ignored_courses;
DROP POLICY IF EXISTS "Users can delete own ignored courses " ON public.user_ignored_courses;

CREATE POLICY "user_ignored_courses_select" ON public.user_ignored_courses FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "user_ignored_courses_insert" ON public.user_ignored_courses FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_ignored_courses_delete" ON public.user_ignored_courses FOR DELETE USING (user_id = auth.uid());

-- Fix user_sync_preferences
DROP POLICY IF EXISTS "Allow all operations on sync preferences" ON public.user_sync_preferences;
DROP POLICY IF EXISTS "Allow all operations on sync preferences " ON public.user_sync_preferences;

CREATE POLICY "user_sync_prefs_select" ON public.user_sync_preferences FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY "user_sync_prefs_insert" ON public.user_sync_preferences FOR INSERT WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY "user_sync_prefs_update" ON public.user_sync_preferences FOR UPDATE USING (user_id = auth.uid()::text);
CREATE POLICY "user_sync_prefs_delete" ON public.user_sync_preferences FOR DELETE USING (user_id = auth.uid()::text);

-- Fix users
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile " ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile " ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile " ON public.users;

CREATE POLICY "users_select" ON public.users FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_insert" ON public.users FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "users_update" ON public.users FOR UPDATE USING (id = auth.uid());
