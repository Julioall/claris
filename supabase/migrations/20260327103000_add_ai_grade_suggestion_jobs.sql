CREATE TYPE public.ai_grade_suggestion_job_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

CREATE TYPE public.ai_grade_suggestion_job_item_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

CREATE TABLE IF NOT EXISTS public.ai_grade_suggestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  moodle_activity_id TEXT NOT NULL,
  activity_name TEXT NOT NULL,
  max_grade NUMERIC,
  status public.ai_grade_suggestion_job_status NOT NULL DEFAULT 'pending',
  total_items INTEGER NOT NULL DEFAULT 0 CHECK (total_items >= 0),
  processed_items INTEGER NOT NULL DEFAULT 0 CHECK (processed_items >= 0),
  success_count INTEGER NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_grade_suggestion_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.ai_grade_suggestion_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_activity_id UUID NOT NULL REFERENCES public.student_activities(id) ON DELETE CASCADE,
  moodle_activity_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  status public.ai_grade_suggestion_job_item_status NOT NULL DEFAULT 'pending',
  audit_id UUID REFERENCES public.ai_grade_suggestion_history(id) ON DELETE SET NULL,
  result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_grade_suggestion_job_items_unique_activity UNIQUE (job_id, student_activity_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_grade_suggestion_jobs_user_created
  ON public.ai_grade_suggestion_jobs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_grade_suggestion_jobs_activity
  ON public.ai_grade_suggestion_jobs(user_id, course_id, moodle_activity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_grade_suggestion_job_items_job_created
  ON public.ai_grade_suggestion_job_items(job_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ai_grade_suggestion_job_items_status
  ON public.ai_grade_suggestion_job_items(job_id, status, created_at ASC);

ALTER TABLE public.ai_grade_suggestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_grade_suggestion_job_items ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_ai_grade_suggestion_jobs_updated_at ON public.ai_grade_suggestion_jobs;
CREATE TRIGGER update_ai_grade_suggestion_jobs_updated_at
  BEFORE UPDATE ON public.ai_grade_suggestion_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_grade_suggestion_job_items_updated_at ON public.ai_grade_suggestion_job_items;
CREATE TRIGGER update_ai_grade_suggestion_job_items_updated_at
  BEFORE UPDATE ON public.ai_grade_suggestion_job_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "ai_grade_suggestion_jobs_select_own"
ON public.ai_grade_suggestion_jobs
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "ai_grade_suggestion_job_items_select_own"
ON public.ai_grade_suggestion_job_items
FOR SELECT
USING (user_id = auth.uid());

GRANT SELECT ON public.ai_grade_suggestion_jobs TO authenticated;
GRANT SELECT ON public.ai_grade_suggestion_job_items TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_grade_suggestion_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_grade_suggestion_job_items;

COMMENT ON TABLE public.ai_grade_suggestion_jobs IS
  'Jobs assincornos de correcao em lote por atividade para sugestoes de nota e feedback com IA.';

COMMENT ON TABLE public.ai_grade_suggestion_job_items IS
  'Itens individuais de um job de correcao em lote, um por entrega pendente encontrada.';
