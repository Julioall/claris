-- Greenfield Claris accounts are independent from Moodle identities.
ALTER TABLE public.users
  ALTER COLUMN moodle_user_id DROP NOT NULL,
  ALTER COLUMN moodle_username DROP NOT NULL;

DROP INDEX IF EXISTS public.idx_users_moodle_username_trgm;

CREATE OR REPLACE FUNCTION public.is_user_application_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_user_roles role_row
    WHERE role_row.user_id = p_user_id
      AND role_row.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.backend_provision_claris_account(
  p_auth_user_id UUID,
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email TEXT := lower(btrim(COALESCE(p_email, '')));
  v_invitation public.claris_invitations%ROWTYPE;
  v_group_id UUID;
  v_onboarding_required BOOLEAN;
BEGIN
  IF p_auth_user_id IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Authenticated user and email are required' USING ERRCODE = '22023';
  END IF;

  SELECT invitation_row.*
  INTO v_invitation
  FROM public.claris_invitations invitation_row
  WHERE invitation_row.email_normalized = v_email
    AND invitation_row.status IN ('pending', 'accepted')
  ORDER BY invitation_row.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A valid Claris invitation was not found' USING ERRCODE = '42501';
  END IF;
  IF v_invitation.status = 'pending' AND v_invitation.expires_at <= NOW() THEN
    UPDATE public.claris_invitations
    SET status = 'expired', updated_at = NOW()
    WHERE id = v_invitation.id;
    RAISE EXCEPTION 'Claris invitation has expired' USING ERRCODE = '42501';
  END IF;
  IF v_invitation.auth_user_id IS NOT NULL
     AND v_invitation.auth_user_id <> p_auth_user_id THEN
    RAISE EXCEPTION 'Claris invitation already belongs to another account' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.users (id, full_name, email, moodle_user_id, moodle_username)
  VALUES (p_auth_user_id, v_invitation.full_name, v_email, NULL, NULL)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(NULLIF(public.users.full_name, ''), EXCLUDED.full_name),
      updated_at = NOW();

  SELECT group_row.id
  INTO v_group_id
  FROM public.app_groups group_row
  WHERE group_row.slug = 'tutor';

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Tutor group is not configured';
  END IF;

  INSERT INTO public.user_group_memberships (user_id, group_id, assigned_by)
  VALUES (p_auth_user_id, v_group_id, v_invitation.invited_by)
  ON CONFLICT (user_id) DO UPDATE
  SET group_id = EXCLUDED.group_id,
      assigned_by = EXCLUDED.assigned_by,
      updated_at = NOW();

  UPDATE public.claris_invitations
  SET auth_user_id = p_auth_user_id,
      status = 'accepted',
      accepted_at = COALESCE(accepted_at, NOW()),
      updated_at = NOW()
  WHERE id = v_invitation.id;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.user_moodle_connections connection
    WHERE connection.user_id = p_auth_user_id
      AND connection.status = 'active'
  )
  INTO v_onboarding_required;

  RETURN jsonb_build_object(
    'userId', p_auth_user_id,
    'onboardingRequired', v_onboarding_required,
    'nextPath', CASE WHEN v_onboarding_required THEN '/onboarding/moodle' ELSE '/' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.backend_provision_claris_account(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_provision_claris_account(UUID, TEXT)
  TO service_role;
