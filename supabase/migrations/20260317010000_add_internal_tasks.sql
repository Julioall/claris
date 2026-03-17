-- Internal tasks table (Tarefas module)
-- Centralizes team activities, responsible parties, deadlines, history and operational progress.
-- Distinct from pending_tasks which is student/Moodle focused.
CREATE TABLE IF NOT EXISTS public.internal_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog',
  priority TEXT NOT NULL DEFAULT 'media',
  category TEXT,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Future: link to projects
  project_id UUID,
  -- Future: Microsoft Teams integration
  teams_task_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT internal_tasks_status_check CHECK (status IN ('backlog', 'em_andamento', 'concluida', 'cancelada')),
  CONSTRAINT internal_tasks_priority_check CHECK (priority IN ('baixa', 'media', 'alta', 'urgente'))
);

CREATE INDEX IF NOT EXISTS idx_internal_tasks_created_by
  ON public.internal_tasks(created_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_tasks_assigned_to
  ON public.internal_tasks(assigned_to_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_tasks_status
  ON public.internal_tasks(status, due_date);

ALTER TABLE public.internal_tasks ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_internal_tasks_updated_at ON public.internal_tasks;
CREATE TRIGGER update_internal_tasks_updated_at
  BEFORE UPDATE ON public.internal_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Users can see tasks they created or are assigned to
CREATE POLICY "Users can view their own internal tasks"
  ON public.internal_tasks FOR SELECT
  USING (
    created_by_user_id = auth.uid()
    OR assigned_to_user_id = auth.uid()
  );

CREATE POLICY "Users can insert internal tasks"
  ON public.internal_tasks FOR INSERT
  WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "Users can update tasks they created or are assigned to"
  ON public.internal_tasks FOR UPDATE
  USING (
    created_by_user_id = auth.uid()
    OR assigned_to_user_id = auth.uid()
  );

CREATE POLICY "Users can delete tasks they created"
  ON public.internal_tasks FOR DELETE
  USING (created_by_user_id = auth.uid());

-- Internal task comments for history/audit trail
CREATE TABLE IF NOT EXISTS public.internal_task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.internal_tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_task_comments_task
  ON public.internal_task_comments(task_id, created_at ASC);

ALTER TABLE public.internal_task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comments on tasks they can access"
  ON public.internal_task_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_tasks t
      WHERE t.id = task_id
        AND (t.created_by_user_id = auth.uid() OR t.assigned_to_user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert comments on tasks they can access"
  ON public.internal_task_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.internal_tasks t
      WHERE t.id = task_id
        AND (t.created_by_user_id = auth.uid() OR t.assigned_to_user_id = auth.uid())
    )
  );
