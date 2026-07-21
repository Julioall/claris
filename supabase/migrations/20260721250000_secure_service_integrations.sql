-- Service integrations are a backend-owned aggregate. Browser roles invoke the
-- whatsapp-instance-manager contract and cannot read or mutate persistence,
-- operational payloads, provider identifiers, health details or job state.

REVOKE ALL PRIVILEGES ON TABLE public.app_service_instances
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.app_service_instance_events
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.app_service_instance_jobs
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.app_service_instance_limits
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.app_service_instance_health_logs
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.app_service_webhook_events
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.app_service_instance_group_permissions
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_service_instances
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_service_instance_events
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_service_instance_jobs
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_service_instance_limits
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_service_instance_health_logs
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_service_webhook_events
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_service_instance_group_permissions
  TO service_role;

COMMENT ON TABLE public.app_service_instances IS
  'Backend-owned service integration instances exposed through versioned use-case APIs.';
COMMENT ON TABLE public.app_service_instance_events IS
  'Backend-owned operational service events; public DTOs intentionally omit raw context.';
