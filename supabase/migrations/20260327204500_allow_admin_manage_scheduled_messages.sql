DROP POLICY IF EXISTS "scheduled_messages_select_admin" ON public.scheduled_messages;
CREATE POLICY "scheduled_messages_select_admin"
ON public.scheduled_messages
FOR SELECT
USING (public.is_application_admin());

DROP POLICY IF EXISTS "scheduled_messages_update_admin" ON public.scheduled_messages;
CREATE POLICY "scheduled_messages_update_admin"
ON public.scheduled_messages
FOR UPDATE
USING (public.is_application_admin())
WITH CHECK (public.is_application_admin());
