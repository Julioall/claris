-- Tighten RLS on tasks, task_comments, task_history, tags, task_tags, and calendar_events.
-- The initial migration (20260317200000) used permissive "auth.uid() IS NOT NULL" policies
-- that allowed every authenticated user to read and mutate all records.
-- These policies are replaced with ownership-scoped equivalents.

-- ───────────────────────────── tasks ──────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage tasks" ON public.tasks;

CREATE POLICY "tasks_select"
  ON public.tasks FOR SELECT
  USING (created_by = auth.uid() OR assigned_to = auth.uid());

CREATE POLICY "tasks_insert"
  ON public.tasks FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "tasks_update"
  ON public.tasks FOR UPDATE
  USING (created_by = auth.uid() OR assigned_to = auth.uid())
  WITH CHECK (created_by = auth.uid() OR assigned_to = auth.uid());

CREATE POLICY "tasks_delete"
  ON public.tasks FOR DELETE
  USING (created_by = auth.uid());

-- ───────────────────────────── task_comments ──────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage task_comments" ON public.task_comments;

CREATE POLICY "task_comments_select"
  ON public.task_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
    )
  );

CREATE POLICY "task_comments_insert"
  ON public.task_comments FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
    )
  );

CREATE POLICY "task_comments_update"
  ON public.task_comments FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "task_comments_delete"
  ON public.task_comments FOR DELETE
  USING (author_id = auth.uid());

-- ───────────────────────────── task_history ──────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage task_history" ON public.task_history;

CREATE POLICY "task_history_select"
  ON public.task_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
    )
  );

CREATE POLICY "task_history_insert"
  ON public.task_history FOR INSERT
  WITH CHECK (
    changed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
    )
  );

-- ───────────────────────────── tags ──────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage tags" ON public.tags;

CREATE POLICY "tags_select"
  ON public.tags FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "tags_insert"
  ON public.tags FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "tags_update"
  ON public.tags FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "tags_delete"
  ON public.tags FOR DELETE
  USING (created_by = auth.uid());

-- ───────────────────────────── task_tags ─────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage task_tags" ON public.task_tags;

CREATE POLICY "task_tags_select"
  ON public.task_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
    )
  );

CREATE POLICY "task_tags_insert"
  ON public.task_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
    )
  );

CREATE POLICY "task_tags_delete"
  ON public.task_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND t.created_by = auth.uid()
    )
  );

-- ───────────────────────────── calendar_events ───────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage calendar_events" ON public.calendar_events;

CREATE POLICY "calendar_events_select"
  ON public.calendar_events FOR SELECT
  USING (owner = auth.uid());

CREATE POLICY "calendar_events_insert"
  ON public.calendar_events FOR INSERT
  WITH CHECK (owner = auth.uid());

CREATE POLICY "calendar_events_update"
  ON public.calendar_events FOR UPDATE
  USING (owner = auth.uid())
  WITH CHECK (owner = auth.uid());

CREATE POLICY "calendar_events_delete"
  ON public.calendar_events FOR DELETE
  USING (owner = auth.uid());
