-- Keep privileged maintenance and diagnostic actions behind authenticated
-- backend contracts and retain an immutable operational audit trail.

CREATE TABLE IF NOT EXISTS public.app_admin_operation_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  correlation_id TEXT NOT NULL CHECK (char_length(correlation_id) BETWEEN 1 AND 128),
  operation TEXT NOT NULL CHECK (operation IN ('data_cleanup', 'grade_diagnostic')),
  phase TEXT NOT NULL CHECK (phase IN ('requested', 'completed', 'failed')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'partial_failure', 'failed')),
  details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_admin_operation_audit_operation
  ON public.app_admin_operation_audit_log(operation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_app_admin_operation_audit_actor_created
  ON public.app_admin_operation_audit_log(actor_id, created_at DESC);

ALTER TABLE public.app_admin_operation_audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reject_app_admin_operation_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Administrative operation audit events are immutable'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS reject_app_admin_operation_audit_mutation
  ON public.app_admin_operation_audit_log;
CREATE TRIGGER reject_app_admin_operation_audit_mutation
  BEFORE UPDATE OR DELETE ON public.app_admin_operation_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.reject_app_admin_operation_audit_mutation();

REVOKE ALL PRIVILEGES ON TABLE public.app_admin_operation_audit_log
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.app_admin_operation_audit_log
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.reject_app_admin_operation_audit_mutation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_app_admin_operation_audit_mutation()
  TO service_role;

COMMENT ON TABLE public.app_admin_operation_audit_log IS
  'Trilha imutavel de operacoes administrativas destrutivas e diagnosticos sensiveis.';
