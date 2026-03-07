-- Reconcile schema with migration history and allow generic tasks without
-- binding them to a specific student or course.
ALTER TABLE public.pending_tasks
  DROP CONSTRAINT IF EXISTS pending_tasks_student_or_class;

ALTER TABLE public.task_recurrence_configs
  DROP CONSTRAINT IF EXISTS recurrence_student_or_class;
