ALTER TABLE public.task_recurrence_configs
  ADD COLUMN IF NOT EXISTS weekly_day SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'task_recurrence_configs_weekly_day_check'
  ) THEN
    ALTER TABLE public.task_recurrence_configs
      ADD CONSTRAINT task_recurrence_configs_weekly_day_check
      CHECK (weekly_day IS NULL OR weekly_day BETWEEN 0 AND 6);
  END IF;
END
$$;

COMMENT ON COLUMN public.task_recurrence_configs.weekly_day IS
  'Dia da semana da recorrencia semanal: 0=domingo, 6=sabado.';
