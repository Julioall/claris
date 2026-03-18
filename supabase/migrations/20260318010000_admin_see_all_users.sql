-- Allow application admins to see all users, not just their own record.
-- The existing "users_select" policy only allows `id = auth.uid()`.
-- Admins need to see all users in AdminUsuarios and AdminMetricas pages.

DROP POLICY IF EXISTS "users_select" ON public.users;

CREATE POLICY "users_select"
  ON public.users
  FOR SELECT
  USING (id = auth.uid() OR public.is_application_admin());
