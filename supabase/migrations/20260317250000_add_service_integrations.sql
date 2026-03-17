-- ============================================================
-- Service Integrations: "Serviços da Aplicação"
-- Supports WhatsApp (via Evolution API) and future connectors
-- (Microsoft Email, Calendar, Teams, etc.)
-- ============================================================

-- Ensure the shared updated_at trigger function exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. app_service_instances
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_service_instances (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT        NOT NULL,
  description            TEXT,
  service_type           TEXT        NOT NULL DEFAULT 'whatsapp'
    CONSTRAINT app_service_instances_service_type_check
      CHECK (service_type IN ('whatsapp', 'microsoft_email', 'microsoft_calendar', 'microsoft_teams')),
  provider               TEXT        NOT NULL DEFAULT 'evolution_api',
  scope                  TEXT        NOT NULL DEFAULT 'personal'
    CONSTRAINT app_service_instances_scope_check
      CHECK (scope IN ('personal', 'shared')),
  owner_user_id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  evolution_instance_name TEXT,
  external_id            TEXT,
  connection_status      TEXT        NOT NULL DEFAULT 'draft'
    CONSTRAINT app_service_instances_connection_status_check
      CHECK (connection_status IN ('draft', 'pending_connection', 'connected', 'disconnected', 'limited', 'cooling_down', 'blocked', 'disabled', 'error')),
  operational_status     TEXT        NOT NULL DEFAULT 'draft'
    CONSTRAINT app_service_instances_operational_status_check
      CHECK (operational_status IN ('draft', 'pending_connection', 'connected', 'disconnected', 'limited', 'cooling_down', 'blocked', 'disabled', 'error')),
  health_status          TEXT        NOT NULL DEFAULT 'healthy'
    CONSTRAINT app_service_instances_health_status_check
      CHECK (health_status IN ('healthy', 'warning', 'critical')),
  is_active              BOOLEAN     NOT NULL DEFAULT true,
  is_blocked             BOOLEAN     NOT NULL DEFAULT false,
  warmup_mode            BOOLEAN     NOT NULL DEFAULT false,
  send_window            JSONB,
  limits                 JSONB,
  last_sync_at           TIMESTAMPTZ,
  last_activity_at       TIMESTAMPTZ,
  admin_notes            TEXT,
  metadata               JSONB       DEFAULT '{}'::jsonb,
  created_by_user_id     UUID        REFERENCES auth.users(id),
  updated_by_user_id     UUID        REFERENCES auth.users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index: one personal instance per user per service_type
CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_service_instance
  ON public.app_service_instances(owner_user_id, service_type)
  WHERE scope = 'personal';

CREATE INDEX IF NOT EXISTS idx_app_service_instances_owner
  ON public.app_service_instances(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_app_service_instances_scope
  ON public.app_service_instances(scope);

CREATE INDEX IF NOT EXISTS idx_app_service_instances_service_type
  ON public.app_service_instances(service_type);

ALTER TABLE public.app_service_instances ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_app_service_instances_updated_at ON public.app_service_instances;
CREATE TRIGGER update_app_service_instances_updated_at
  BEFORE UPDATE ON public.app_service_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Personal instances: owner can fully manage their own
CREATE POLICY "app_service_instances_personal_select"
ON public.app_service_instances
FOR SELECT
USING (
  (scope = 'personal' AND owner_user_id = auth.uid())
  OR scope = 'shared'
  OR public.is_application_admin()
);

CREATE POLICY "app_service_instances_personal_insert"
ON public.app_service_instances
FOR INSERT
WITH CHECK (
  (
    scope = 'personal'
    AND owner_user_id = auth.uid()
    AND auth.uid() IS NOT NULL
  )
  OR (
    scope = 'shared'
    AND public.is_application_admin()
  )
);

CREATE POLICY "app_service_instances_personal_update"
ON public.app_service_instances
FOR UPDATE
USING (
  (scope = 'personal' AND owner_user_id = auth.uid())
  OR (scope = 'shared' AND public.is_application_admin())
)
WITH CHECK (
  (scope = 'personal' AND owner_user_id = auth.uid())
  OR (scope = 'shared' AND public.is_application_admin())
);

CREATE POLICY "app_service_instances_personal_delete"
ON public.app_service_instances
FOR DELETE
USING (
  (scope = 'personal' AND owner_user_id = auth.uid())
  OR (scope = 'shared' AND public.is_application_admin())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_service_instances TO authenticated;

-- ============================================================
-- 2. app_service_instance_events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_service_instance_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id     UUID        NOT NULL REFERENCES public.app_service_instances(id) ON DELETE CASCADE,
  instance_scope  TEXT        NOT NULL DEFAULT 'personal',
  event_type      TEXT        NOT NULL
    CONSTRAINT app_service_instance_events_event_type_check
      CHECK (event_type IN (
        'instance_created', 'instance_updated', 'instance_deleted',
        'connected', 'disconnected',
        'send_attempt', 'send_success', 'send_failed', 'reprocessed',
        'cooldown_activated', 'auto_paused', 'preventive_blocked',
        'webhook_received', 'status_synced', 'health_checked', 'warmup_routine'
      )),
  origin          TEXT        NOT NULL DEFAULT 'user'
    CONSTRAINT app_service_instance_events_origin_check
      CHECK (origin IN ('user', 'system', 'admin', 'webhook', 'automation')),
  context         JSONB       DEFAULT '{}'::jsonb,
  status          TEXT        NOT NULL DEFAULT 'success'
    CONSTRAINT app_service_instance_events_status_check
      CHECK (status IN ('success', 'failure', 'pending', 'skipped')),
  error_summary   TEXT,
  actor_user_id   UUID        REFERENCES auth.users(id),
  correlation_id  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_service_instance_events_instance
  ON public.app_service_instance_events(instance_id);

CREATE INDEX IF NOT EXISTS idx_app_service_instance_events_created_at
  ON public.app_service_instance_events(created_at DESC);

-- Composite index for common filter: events by instance + type + recency
CREATE INDEX IF NOT EXISTS idx_app_service_instance_events_instance_type_created
  ON public.app_service_instance_events(instance_id, event_type, created_at DESC);

ALTER TABLE public.app_service_instance_events ENABLE ROW LEVEL SECURITY;

-- Users can SELECT events for their own personal instances
CREATE POLICY "app_service_instance_events_select"
ON public.app_service_instance_events
FOR SELECT
USING (
  public.is_application_admin()
  OR EXISTS (
    SELECT 1 FROM public.app_service_instances asi
    WHERE asi.id = app_service_instance_events.instance_id
      AND asi.scope = 'personal'
      AND asi.owner_user_id = auth.uid()
  )
);

-- INSERT only via service role (edge functions bypass RLS with service key)
-- Authenticated users are not granted INSERT to enforce service-role-only writes.

GRANT SELECT ON public.app_service_instance_events TO authenticated;

-- ============================================================
-- 3. app_service_instance_jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_service_instance_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id     UUID        NOT NULL REFERENCES public.app_service_instances(id) ON DELETE CASCADE,
  instance_scope  TEXT        NOT NULL DEFAULT 'personal',
  job_type        TEXT        NOT NULL
    CONSTRAINT app_service_instance_jobs_job_type_check
      CHECK (job_type IN ('send_message', 'process_queue', 'health_check', 'status_reconcile', 'warmup')),
  status          TEXT        NOT NULL DEFAULT 'pending'
    CONSTRAINT app_service_instance_jobs_status_check
      CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'cooldown')),
  payload         JSONB       DEFAULT '{}'::jsonb,
  result          JSONB       DEFAULT '{}'::jsonb,
  error_summary   TEXT,
  attempts        INT         NOT NULL DEFAULT 0,
  max_attempts    INT         NOT NULL DEFAULT 3,
  scheduled_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  actor_user_id   UUID        REFERENCES auth.users(id),
  correlation_id  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_service_instance_jobs_instance_status
  ON public.app_service_instance_jobs(instance_id, status);

-- Index for queue processor: find pending/scheduled jobs ready to run
CREATE INDEX IF NOT EXISTS idx_app_service_instance_jobs_status_scheduled
  ON public.app_service_instance_jobs(status, scheduled_at)
  WHERE status IN ('pending', 'cooldown');

ALTER TABLE public.app_service_instance_jobs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_app_service_instance_jobs_updated_at ON public.app_service_instance_jobs;
CREATE TRIGGER update_app_service_instance_jobs_updated_at
  BEFORE UPDATE ON public.app_service_instance_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Same pattern as events: user can see jobs for their own instances
CREATE POLICY "app_service_instance_jobs_select"
ON public.app_service_instance_jobs
FOR SELECT
USING (
  public.is_application_admin()
  OR EXISTS (
    SELECT 1 FROM public.app_service_instances asi
    WHERE asi.id = app_service_instance_jobs.instance_id
      AND asi.scope = 'personal'
      AND asi.owner_user_id = auth.uid()
  )
);

-- INSERT/UPDATE only via service role
GRANT SELECT ON public.app_service_instance_jobs TO authenticated;

-- ============================================================
-- 4. app_service_instance_limits
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_service_instance_limits (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id  UUID        NOT NULL REFERENCES public.app_service_instances(id) ON DELETE CASCADE,
  limit_type   TEXT        NOT NULL
    CONSTRAINT app_service_instance_limits_limit_type_check
      CHECK (limit_type IN ('daily_sends', 'hourly_sends', 'cooldown_after_errors', 'min_delay_ms', 'max_delay_ms', 'max_retries')),
  limit_value  INT         NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (instance_id, limit_type)
);

ALTER TABLE public.app_service_instance_limits ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_app_service_instance_limits_updated_at ON public.app_service_instance_limits;
CREATE TRIGGER update_app_service_instance_limits_updated_at
  BEFORE UPDATE ON public.app_service_instance_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Owner of personal instance can SELECT their limits
CREATE POLICY "app_service_instance_limits_select"
ON public.app_service_instance_limits
FOR SELECT
USING (
  public.is_application_admin()
  OR EXISTS (
    SELECT 1 FROM public.app_service_instances asi
    WHERE asi.id = app_service_instance_limits.instance_id
      AND asi.scope = 'personal'
      AND asi.owner_user_id = auth.uid()
  )
);

CREATE POLICY "app_service_instance_limits_insert"
ON public.app_service_instance_limits
FOR INSERT
WITH CHECK (public.is_application_admin());

CREATE POLICY "app_service_instance_limits_update"
ON public.app_service_instance_limits
FOR UPDATE
USING (public.is_application_admin())
WITH CHECK (public.is_application_admin());

CREATE POLICY "app_service_instance_limits_delete"
ON public.app_service_instance_limits
FOR DELETE
USING (public.is_application_admin());

GRANT SELECT ON public.app_service_instance_limits TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.app_service_instance_limits TO authenticated;

-- ============================================================
-- 5. app_service_instance_health_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_service_instance_health_logs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id        UUID        NOT NULL REFERENCES public.app_service_instances(id) ON DELETE CASCADE,
  health_status      TEXT        NOT NULL
    CONSTRAINT app_service_instance_health_logs_health_status_check
      CHECK (health_status IN ('healthy', 'warning', 'critical')),
  connection_status  TEXT,
  details            JSONB       DEFAULT '{}'::jsonb,
  checked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_service_instance_health_logs ENABLE ROW LEVEL SECURITY;

-- Owner can SELECT health logs for their own instances
CREATE POLICY "app_service_instance_health_logs_select"
ON public.app_service_instance_health_logs
FOR SELECT
USING (
  public.is_application_admin()
  OR EXISTS (
    SELECT 1 FROM public.app_service_instances asi
    WHERE asi.id = app_service_instance_health_logs.instance_id
      AND asi.scope = 'personal'
      AND asi.owner_user_id = auth.uid()
  )
);

-- INSERT only via service role
GRANT SELECT ON public.app_service_instance_health_logs TO authenticated;

-- ============================================================
-- 6. app_service_webhook_events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_service_webhook_events (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id             UUID        REFERENCES public.app_service_instances(id) ON DELETE SET NULL,
  evolution_instance_name TEXT,
  event_type              TEXT        NOT NULL,
  payload                 JSONB       NOT NULL DEFAULT '{}'::jsonb,
  processed               BOOLEAN     NOT NULL DEFAULT false,
  processed_at            TIMESTAMPTZ,
  error_summary           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_service_webhook_events_processed_created
  ON public.app_service_webhook_events(processed, created_at);

ALTER TABLE public.app_service_webhook_events ENABLE ROW LEVEL SECURITY;

-- Only admins and service role can access webhook events
CREATE POLICY "app_service_webhook_events_select"
ON public.app_service_webhook_events
FOR SELECT
USING (public.is_application_admin());

CREATE POLICY "app_service_webhook_events_insert"
ON public.app_service_webhook_events
FOR INSERT
WITH CHECK (public.is_application_admin());

CREATE POLICY "app_service_webhook_events_update"
ON public.app_service_webhook_events
FOR UPDATE
USING (public.is_application_admin())
WITH CHECK (public.is_application_admin());

CREATE POLICY "app_service_webhook_events_delete"
ON public.app_service_webhook_events
FOR DELETE
USING (public.is_application_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_service_webhook_events TO authenticated;

-- ============================================================
-- 7. app_service_instance_group_permissions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_service_instance_group_permissions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id  UUID        NOT NULL REFERENCES public.app_service_instances(id) ON DELETE CASCADE,
  group_id     UUID        NOT NULL, -- forward reference: will reference a groups table when it exists
  can_view     BOOLEAN     NOT NULL DEFAULT true,
  can_use      BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (instance_id, group_id)
);

ALTER TABLE public.app_service_instance_group_permissions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_app_service_instance_group_permissions_updated_at ON public.app_service_instance_group_permissions;
CREATE TRIGGER update_app_service_instance_group_permissions_updated_at
  BEFORE UPDATE ON public.app_service_instance_group_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Only admins can manage group permissions
CREATE POLICY "app_service_instance_group_permissions_select"
ON public.app_service_instance_group_permissions
FOR SELECT
USING (public.is_application_admin());

CREATE POLICY "app_service_instance_group_permissions_insert"
ON public.app_service_instance_group_permissions
FOR INSERT
WITH CHECK (public.is_application_admin());

CREATE POLICY "app_service_instance_group_permissions_update"
ON public.app_service_instance_group_permissions
FOR UPDATE
USING (public.is_application_admin())
WITH CHECK (public.is_application_admin());

CREATE POLICY "app_service_instance_group_permissions_delete"
ON public.app_service_instance_group_permissions
FOR DELETE
USING (public.is_application_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_service_instance_group_permissions TO authenticated;
