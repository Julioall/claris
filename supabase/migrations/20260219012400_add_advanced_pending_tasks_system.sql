-- Advanced Pending Tasks System Migration
-- This migration adds support for:
-- 1. Class-level pending tasks (when no specific student)
-- 2. Recurring pending tasks
-- 3. Automated task generation tracking
-- 4. Action history and effectiveness tracking

-- Add new enum values for task automation types
CREATE TYPE public.task_automation_type AS ENUM (
  'manual',
  'auto_at_risk',
  'auto_missed_assignment',
  'auto_uncorrected_activity',
  'recurring'
);

-- Add new enum values for action effectiveness
CREATE TYPE public.action_effectiveness AS ENUM (
  'pendente',
  'eficaz',
  'nao_eficaz',
  'parcialmente_eficaz'
);

-- Add new enum values for recurrence patterns
CREATE TYPE public.recurrence_pattern AS ENUM (
  'diario',
  'semanal',
  'quinzenal',
  'mensal',
  'bimestral',
  'trimestral'
);

-- Update pending_tasks table to support class-level tasks and automation
ALTER TABLE public.pending_tasks 
  -- Make student_id optional for class-level tasks
  ALTER COLUMN student_id DROP NOT NULL,
  -- Add automation tracking
  ADD COLUMN automation_type task_automation_type DEFAULT 'manual',
  -- Add recurrence tracking
  ADD COLUMN recurrence_id UUID,
  ADD COLUMN is_recurring BOOLEAN DEFAULT false,
  -- Add parent task reference for recurring tasks
  ADD COLUMN parent_task_id UUID REFERENCES public.pending_tasks(id) ON DELETE SET NULL;

-- Add check constraint to ensure either student_id or course_id is set for class-level tasks
ALTER TABLE public.pending_tasks
  ADD CONSTRAINT pending_tasks_student_or_class CHECK (
    student_id IS NOT NULL OR course_id IS NOT NULL
  );

-- Create recurrence configurations table
CREATE TABLE public.task_recurrence_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  pattern recurrence_pattern NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL NOT NULL,
  task_type task_type DEFAULT 'interna',
  priority task_priority DEFAULT 'media',
  is_active BOOLEAN DEFAULT true,
  last_generated_at TIMESTAMP WITH TIME ZONE,
  next_generation_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  -- Ensure either student or class level
  CONSTRAINT recurrence_student_or_class CHECK (
    student_id IS NOT NULL OR course_id IS NOT NULL
  )
);

-- Create task actions table (actions linked to pending tasks)
CREATE TABLE public.task_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_task_id UUID REFERENCES public.pending_tasks(id) ON DELETE CASCADE NOT NULL,
  action_type action_type NOT NULL,
  description TEXT NOT NULL,
  effectiveness action_effectiveness DEFAULT 'pendente',
  executed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  executed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create task action history table (audit trail for actions)
CREATE TABLE public.task_action_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_action_id UUID REFERENCES public.task_actions(id) ON DELETE CASCADE NOT NULL,
  pending_task_id UUID REFERENCES public.pending_tasks(id) ON DELETE CASCADE NOT NULL,
  previous_effectiveness action_effectiveness,
  new_effectiveness action_effectiveness NOT NULL,
  notes TEXT,
  changed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_pending_tasks_automation_type ON public.pending_tasks(automation_type);
CREATE INDEX idx_pending_tasks_recurrence_id ON public.pending_tasks(recurrence_id);
CREATE INDEX idx_pending_tasks_parent_task_id ON public.pending_tasks(parent_task_id);
CREATE INDEX idx_pending_tasks_is_recurring ON public.pending_tasks(is_recurring) WHERE is_recurring = true;

CREATE INDEX idx_recurrence_configs_active ON public.task_recurrence_configs(is_active, next_generation_at) WHERE is_active = true;
CREATE INDEX idx_recurrence_configs_course ON public.task_recurrence_configs(course_id);
CREATE INDEX idx_recurrence_configs_student ON public.task_recurrence_configs(student_id);

CREATE INDEX idx_task_actions_pending_task ON public.task_actions(pending_task_id);
CREATE INDEX idx_task_actions_effectiveness ON public.task_actions(effectiveness);

CREATE INDEX idx_task_action_history_task_action ON public.task_action_history(task_action_id);
CREATE INDEX idx_task_action_history_pending_task ON public.task_action_history(pending_task_id);

-- Add foreign key for recurrence_id
ALTER TABLE public.pending_tasks
  ADD CONSTRAINT fk_pending_tasks_recurrence
  FOREIGN KEY (recurrence_id) REFERENCES public.task_recurrence_configs(id) ON DELETE SET NULL;

-- Enable RLS on new tables
ALTER TABLE public.task_recurrence_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_action_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for task_recurrence_configs
CREATE POLICY "recurrence_configs_select" ON public.task_recurrence_configs 
  FOR SELECT USING (
    created_by_user_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM user_courses uc 
      WHERE uc.course_id = task_recurrence_configs.course_id 
      AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "recurrence_configs_insert" ON public.task_recurrence_configs 
  FOR INSERT WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "recurrence_configs_update" ON public.task_recurrence_configs 
  FOR UPDATE USING (created_by_user_id = auth.uid());

CREATE POLICY "recurrence_configs_delete" ON public.task_recurrence_configs 
  FOR DELETE USING (created_by_user_id = auth.uid());

-- RLS Policies for task_actions
CREATE POLICY "task_actions_select" ON public.task_actions 
  FOR SELECT USING (
    executed_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM pending_tasks pt
      WHERE pt.id = task_actions.pending_task_id
      AND (pt.created_by_user_id = auth.uid() OR pt.assigned_to_user_id = auth.uid())
    )
  );

CREATE POLICY "task_actions_insert" ON public.task_actions 
  FOR INSERT WITH CHECK (
    executed_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM pending_tasks pt
      WHERE pt.id = pending_task_id
      AND (pt.created_by_user_id = auth.uid() OR pt.assigned_to_user_id = auth.uid())
    )
  );

CREATE POLICY "task_actions_update" ON public.task_actions 
  FOR UPDATE USING (executed_by_user_id = auth.uid());

CREATE POLICY "task_actions_delete" ON public.task_actions 
  FOR DELETE USING (executed_by_user_id = auth.uid());

-- RLS Policies for task_action_history
CREATE POLICY "task_action_history_select" ON public.task_action_history 
  FOR SELECT USING (
    changed_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM pending_tasks pt
      WHERE pt.id = task_action_history.pending_task_id
      AND (pt.created_by_user_id = auth.uid() OR pt.assigned_to_user_id = auth.uid())
    )
  );

CREATE POLICY "task_action_history_insert" ON public.task_action_history 
  FOR INSERT WITH CHECK (true);  -- Allow system to insert history

-- Create trigger to update updated_at column
CREATE TRIGGER update_recurrence_configs_updated_at 
  BEFORE UPDATE ON public.task_recurrence_configs 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_task_actions_updated_at 
  BEFORE UPDATE ON public.task_actions 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to auto-update pending task status based on action effectiveness
CREATE OR REPLACE FUNCTION public.update_task_status_from_action()
RETURNS TRIGGER AS $$
BEGIN
  -- If action is marked as effective, close the pending task
  IF NEW.effectiveness = 'eficaz' AND (OLD.effectiveness IS NULL OR OLD.effectiveness != 'eficaz') THEN
    UPDATE public.pending_tasks
    SET 
      status = 'resolvida',
      completed_at = COALESCE(NEW.executed_at, now())
    WHERE id = NEW.pending_task_id
    AND status != 'resolvida';
  
  -- If action is marked as ineffective or partially effective, update task to in progress
  ELSIF NEW.effectiveness IN ('nao_eficaz', 'parcialmente_eficaz') 
    AND (OLD.effectiveness IS NULL OR OLD.effectiveness != NEW.effectiveness) THEN
    UPDATE public.pending_tasks
    SET status = 'em_andamento'
    WHERE id = NEW.pending_task_id
    AND status = 'aberta';
  END IF;

  -- Log the change to action history
  IF OLD.effectiveness IS DISTINCT FROM NEW.effectiveness THEN
    INSERT INTO public.task_action_history (
      task_action_id,
      pending_task_id,
      previous_effectiveness,
      new_effectiveness,
      notes,
      changed_by_user_id
    ) VALUES (
      NEW.id,
      NEW.pending_task_id,
      OLD.effectiveness,
      NEW.effectiveness,
      NEW.notes,
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-update task status when action effectiveness changes
CREATE TRIGGER trigger_update_task_status_from_action
  AFTER UPDATE OF effectiveness ON public.task_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_task_status_from_action();

-- Create function to calculate next generation date for recurring tasks
CREATE OR REPLACE FUNCTION public.calculate_next_recurrence_date(
  current_date TIMESTAMP WITH TIME ZONE,
  pattern recurrence_pattern
)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
BEGIN
  RETURN CASE pattern
    WHEN 'diario' THEN current_date + INTERVAL '1 day'
    WHEN 'semanal' THEN current_date + INTERVAL '1 week'
    WHEN 'quinzenal' THEN current_date + INTERVAL '2 weeks'
    WHEN 'mensal' THEN current_date + INTERVAL '1 month'
    WHEN 'bimestral' THEN current_date + INTERVAL '2 months'
    WHEN 'trimestral' THEN current_date + INTERVAL '3 months'
    ELSE current_date + INTERVAL '1 week'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Comments for documentation
COMMENT ON TABLE public.task_recurrence_configs IS 'Configurações de recorrência para geração automática de pendências';
COMMENT ON TABLE public.task_actions IS 'Ações executadas vinculadas a pendências, com rastreamento de eficácia';
COMMENT ON TABLE public.task_action_history IS 'Histórico de mudanças de eficácia das ações';
COMMENT ON COLUMN public.pending_tasks.automation_type IS 'Tipo de automação que gerou a pendência (manual, auto_at_risk, etc)';
COMMENT ON COLUMN public.pending_tasks.is_recurring IS 'Indica se a pendência foi gerada por uma configuração de recorrência';
COMMENT ON COLUMN public.pending_tasks.recurrence_id IS 'Referência à configuração de recorrência que gerou esta pendência';
COMMENT ON COLUMN public.pending_tasks.parent_task_id IS 'Referência à pendência pai (para tarefas recorrentes)';
