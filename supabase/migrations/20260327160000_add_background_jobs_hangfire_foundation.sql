CREATE TYPE public.background_job_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled'
);

CREATE TYPE public.background_job_item_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled'
);

CREATE TABLE IF NOT EXISTS public.background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL,
  source TEXT NOT NULL,
  source_table TEXT,
  source_record_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  status public.background_job_status NOT NULL DEFAULT 'pending',
  total_items INTEGER NOT NULL DEFAULT 0 CHECK (total_items >= 0),
  processed_items INTEGER NOT NULL DEFAULT 0 CHECK (processed_items >= 0),
  success_count INTEGER NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.background_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.background_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_table TEXT,
  source_record_id UUID,
  item_key TEXT,
  label TEXT NOT NULL,
  status public.background_job_item_status NOT NULL DEFAULT 'pending',
  progress_current INTEGER NOT NULL DEFAULT 0 CHECK (progress_current >= 0),
  progress_total INTEGER NOT NULL DEFAULT 0 CHECK (progress_total >= 0),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.background_job_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.background_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  job_item_id UUID REFERENCES public.background_job_items(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT background_job_events_level_check CHECK (level IN ('info', 'warning', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_user_created
  ON public.background_jobs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_background_jobs_status_created
  ON public.background_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_background_jobs_source_created
  ON public.background_jobs(source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_background_jobs_type_created
  ON public.background_jobs(job_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_background_jobs_source_ref
  ON public.background_jobs(source_table, source_record_id);

CREATE INDEX IF NOT EXISTS idx_background_job_items_job_created
  ON public.background_job_items(job_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_background_job_items_job_status
  ON public.background_job_items(job_id, status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_background_job_events_job_created
  ON public.background_job_events(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_background_job_events_item_created
  ON public.background_job_events(job_item_id, created_at DESC);

ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_job_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_job_events ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_background_jobs_updated_at ON public.background_jobs;
CREATE TRIGGER update_background_jobs_updated_at
  BEFORE UPDATE ON public.background_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_background_job_items_updated_at ON public.background_job_items;
CREATE TRIGGER update_background_job_items_updated_at
  BEFORE UPDATE ON public.background_job_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "background_jobs_select_owner_or_admin"
ON public.background_jobs
FOR SELECT
USING (user_id = auth.uid() OR public.is_application_admin());

CREATE POLICY "background_jobs_insert_owner_or_admin"
ON public.background_jobs
FOR INSERT
WITH CHECK (user_id = auth.uid() OR public.is_application_admin());

CREATE POLICY "background_jobs_update_owner_or_admin"
ON public.background_jobs
FOR UPDATE
USING (user_id = auth.uid() OR public.is_application_admin())
WITH CHECK (user_id = auth.uid() OR public.is_application_admin());

CREATE POLICY "background_job_items_select_owner_or_admin"
ON public.background_job_items
FOR SELECT
USING (user_id = auth.uid() OR public.is_application_admin());

CREATE POLICY "background_job_items_insert_owner_or_admin"
ON public.background_job_items
FOR INSERT
WITH CHECK (
  public.is_application_admin()
  OR EXISTS (
    SELECT 1
    FROM public.background_jobs bj
    WHERE bj.id = background_job_items.job_id
      AND bj.user_id = auth.uid()
  )
);

CREATE POLICY "background_job_items_update_owner_or_admin"
ON public.background_job_items
FOR UPDATE
USING (user_id = auth.uid() OR public.is_application_admin())
WITH CHECK (user_id = auth.uid() OR public.is_application_admin());

CREATE POLICY "background_job_events_select_owner_or_admin"
ON public.background_job_events
FOR SELECT
USING (user_id = auth.uid() OR public.is_application_admin());

CREATE POLICY "background_job_events_insert_owner_or_admin"
ON public.background_job_events
FOR INSERT
WITH CHECK (
  public.is_application_admin()
  OR EXISTS (
    SELECT 1
    FROM public.background_jobs bj
    WHERE bj.id = background_job_events.job_id
      AND bj.user_id = auth.uid()
  )
);

GRANT SELECT, INSERT, UPDATE ON public.background_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.background_job_items TO authenticated;
GRANT SELECT, INSERT ON public.background_job_events TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.background_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.background_job_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.background_job_events;

COMMENT ON TABLE public.background_jobs IS
  'Registro unificado de jobs em background no estilo Hangfire para monitoramento operacional e administrativo.';

COMMENT ON TABLE public.background_job_items IS
  'Itens internos de um job em background, usados para progresso detalhado por destinatario, entrega, etapa ou curso.';

COMMENT ON TABLE public.background_job_events IS
  'Linha do tempo operacional de eventos relevantes de um job em background.';
