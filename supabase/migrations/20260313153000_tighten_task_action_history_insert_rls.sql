DROP POLICY IF EXISTS "task_action_history_insert" ON public.task_action_history;

CREATE POLICY "task_action_history_insert" ON public.task_action_history
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      changed_by_user_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.pending_tasks pt
        WHERE pt.id = task_action_history.pending_task_id
          AND (
            pt.created_by_user_id = auth.uid()
            OR pt.assigned_to_user_id = auth.uid()
          )
      )
      AND EXISTS (
        SELECT 1
        FROM public.task_actions ta
        WHERE ta.id = task_action_history.task_action_id
          AND ta.pending_task_id = task_action_history.pending_task_id
      )
    )
  );