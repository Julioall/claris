-- Operational circuit breaker by Moodle site. It is intentionally service-only:
-- one unhealthy Moodle must not consume workers assigned to another site.

CREATE TABLE IF NOT EXISTS public.moodle_site_circuit_breakers (
  moodle_site_id UUID PRIMARY KEY REFERENCES public.moodle_sites(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'closed',
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_failure_code TEXT,
  last_failure_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  open_until TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (state IN ('closed', 'open')),
  CHECK (consecutive_failures >= 0),
  CHECK (open_until IS NULL OR opened_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_moodle_site_circuit_breakers_open_until
  ON public.moodle_site_circuit_breakers (open_until)
  WHERE state = 'open';

ALTER TABLE public.moodle_site_circuit_breakers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moodle_site_circuit_breakers FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.moodle_site_circuit_breakers TO service_role;

CREATE OR REPLACE FUNCTION public.backend_record_moodle_site_circuit_result(
  p_moodle_site_id UUID,
  p_success BOOLEAN,
  p_failure_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_row public.moodle_site_circuit_breakers;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.moodle_sites
    WHERE id = p_moodle_site_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Moodle site not found or disabled' USING ERRCODE = '42501';
  END IF;

  IF p_success THEN
    INSERT INTO public.moodle_site_circuit_breakers (
      moodle_site_id, state, consecutive_failures, last_success_at, updated_at
    ) VALUES (
      p_moodle_site_id, 'closed', 0, v_now, v_now
    )
    ON CONFLICT (moodle_site_id) DO UPDATE
    SET
      state = 'closed',
      consecutive_failures = 0,
      last_failure_code = NULL,
      open_until = NULL,
      last_success_at = v_now,
      updated_at = v_now
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.moodle_site_circuit_breakers (
      moodle_site_id,
      state,
      consecutive_failures,
      last_failure_code,
      last_failure_at,
      opened_at,
      open_until,
      updated_at
    ) VALUES (
      p_moodle_site_id,
      'closed',
      1,
      NULLIF(left(COALESCE(p_failure_code, ''), 120), ''),
      v_now,
      NULL,
      NULL,
      v_now
    )
    ON CONFLICT (moodle_site_id) DO UPDATE
    SET
      consecutive_failures = CASE
        WHEN moodle_site_circuit_breakers.state = 'open'
          AND moodle_site_circuit_breakers.open_until > v_now
          THEN moodle_site_circuit_breakers.consecutive_failures
        ELSE moodle_site_circuit_breakers.consecutive_failures + 1
      END,
      last_failure_code = NULLIF(left(COALESCE(p_failure_code, ''), 120), ''),
      last_failure_at = v_now,
      state = CASE
        WHEN moodle_site_circuit_breakers.state = 'open'
          AND moodle_site_circuit_breakers.open_until > v_now
          THEN 'open'
        WHEN moodle_site_circuit_breakers.consecutive_failures + 1 >= 3
          THEN 'open'
        ELSE 'closed'
      END,
      opened_at = CASE
        WHEN moodle_site_circuit_breakers.state <> 'open'
          AND moodle_site_circuit_breakers.consecutive_failures + 1 >= 3
          THEN v_now
        ELSE moodle_site_circuit_breakers.opened_at
      END,
      open_until = CASE
        WHEN moodle_site_circuit_breakers.state = 'open'
          AND moodle_site_circuit_breakers.open_until > v_now
          THEN moodle_site_circuit_breakers.open_until
        WHEN moodle_site_circuit_breakers.consecutive_failures + 1 >= 3
          THEN v_now + INTERVAL '5 minutes'
        ELSE NULL
      END,
      updated_at = v_now
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'consecutive_failures', v_row.consecutive_failures,
    'open_until', v_row.open_until,
    'state', v_row.state
  );
END;
$$;

REVOKE ALL ON FUNCTION public.backend_record_moodle_site_circuit_result(UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_record_moodle_site_circuit_result(UUID, BOOLEAN, TEXT)
  TO service_role;

COMMENT ON TABLE public.moodle_site_circuit_breakers IS
  'Service-only per-site circuit breaker for transient Moodle failures.';
