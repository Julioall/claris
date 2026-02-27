
-- 1. Make student_id nullable for "coringa" tasks
ALTER TABLE public.pending_tasks ALTER COLUMN student_id DROP NOT NULL;

-- 2. Add category/school scope field
ALTER TABLE public.pending_tasks ADD COLUMN IF NOT EXISTS category_name text;

-- 3. Add template reference
ALTER TABLE public.pending_tasks ADD COLUMN IF NOT EXISTS template_id uuid;

-- 4. Task Templates table
CREATE TABLE public.task_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  task_type task_type DEFAULT 'interna',
  priority task_priority DEFAULT 'media',
  auto_message_template text,
  auto_close_on_action boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_templates_select" ON public.task_templates
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "task_templates_insert" ON public.task_templates
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "task_templates_update" ON public.task_templates
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "task_templates_delete" ON public.task_templates
  FOR DELETE USING (user_id = auth.uid());

-- 5. Task Action Logs table (history of actions per task)
CREATE TABLE public.task_action_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pending_task_id uuid NOT NULL REFERENCES public.pending_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action_type text NOT NULL DEFAULT 'registro',
  description text NOT NULL,
  effectiveness text DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_action_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_action_logs_select" ON public.task_action_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "task_action_logs_insert" ON public.task_action_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "task_action_logs_delete" ON public.task_action_logs
  FOR DELETE USING (user_id = auth.uid());

-- 6. Add foreign key from pending_tasks.template_id to task_templates
ALTER TABLE public.pending_tasks 
  ADD CONSTRAINT pending_tasks_template_id_fkey 
  FOREIGN KEY (template_id) REFERENCES public.task_templates(id) ON DELETE SET NULL;

-- 7. Trigger for updated_at on task_templates
CREATE TRIGGER update_task_templates_updated_at
  BEFORE UPDATE ON public.task_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
