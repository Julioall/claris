-- Administrative observability is exposed only through authenticated backend
-- use cases. Support ticket SELECT remains available to authenticated admins
-- solely so the approved Realtime notification adapter can receive inserts.

DROP POLICY IF EXISTS "app_usage_events_insert" ON public.app_usage_events;
DROP POLICY IF EXISTS "app_usage_events_select" ON public.app_usage_events;
REVOKE ALL PRIVILEGES ON TABLE public.app_usage_events FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.app_usage_events TO service_role;

DROP POLICY IF EXISTS "app_error_logs_insert" ON public.app_error_logs;
DROP POLICY IF EXISTS "app_error_logs_select" ON public.app_error_logs;
DROP POLICY IF EXISTS "app_error_logs_update" ON public.app_error_logs;
REVOKE ALL PRIVILEGES ON TABLE public.app_error_logs FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.app_error_logs TO service_role;

DROP POLICY IF EXISTS "claris_conversations_select" ON public.claris_conversations;
DROP POLICY IF EXISTS "claris_conversations_insert" ON public.claris_conversations;
DROP POLICY IF EXISTS "claris_conversations_update" ON public.claris_conversations;
DROP POLICY IF EXISTS "claris_conversations_delete" ON public.claris_conversations;
REVOKE ALL PRIVILEGES ON TABLE public.claris_conversations FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.claris_conversations TO service_role;

DROP POLICY IF EXISTS "support_tickets_select" ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_insert" ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_update" ON public.support_tickets;

REVOKE ALL PRIVILEGES ON TABLE public.support_tickets FROM anon, authenticated;
GRANT SELECT ON TABLE public.support_tickets TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.support_tickets TO service_role;

CREATE POLICY "support_tickets_admin_realtime_select"
ON public.support_tickets
FOR SELECT
TO authenticated
USING (public.is_application_admin());

COMMENT ON TABLE public.app_usage_events IS
  'Eventos de uso acessiveis somente pelo backend admin-observability.';
COMMENT ON TABLE public.app_error_logs IS
  'Logs de erro acessiveis somente pelo backend admin-observability.';
COMMENT ON TABLE public.claris_conversations IS
  'Conversas Claris acessiveis somente pelos casos de uso de backend.';
COMMENT ON TABLE public.support_tickets IS
  'Tickets gravados e gerenciados pelo backend support-tickets; SELECT autenticado e restrito a admins suporta notificacoes Realtime.';
