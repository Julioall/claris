-- Final greenfield account contract: public.users is a Claris identity only.

DROP FUNCTION IF EXISTS public.backend_search_access_users(UUID, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.prevent_admin_field_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('role', true) <> 'service_role' THEN
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END;
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

  SELECT invitation_row.* INTO v_invitation
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
  IF v_invitation.auth_user_id IS NOT NULL AND v_invitation.auth_user_id <> p_auth_user_id THEN
    RAISE EXCEPTION 'Claris invitation already belongs to another account' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.users (id, full_name, email)
  VALUES (p_auth_user_id, v_invitation.full_name, v_email)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(NULLIF(public.users.full_name, ''), EXCLUDED.full_name),
      updated_at = NOW();

  SELECT group_row.id INTO v_group_id
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
    SELECT 1 FROM public.user_moodle_connections connection_row
    WHERE connection_row.user_id = p_auth_user_id
      AND connection_row.status = 'active'
  ) INTO v_onboarding_required;

  RETURN jsonb_build_object(
    'userId', p_auth_user_id,
    'onboardingRequired', v_onboarding_required,
    'nextPath', CASE WHEN v_onboarding_required THEN '/onboarding/moodle' ELSE '/' END
  );
END;
$$;

DROP TABLE IF EXISTS public.user_moodle_reauth_credentials;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_moodle_user_id_key,
  DROP COLUMN IF EXISTS moodle_user_id,
  DROP COLUMN IF EXISTS moodle_username,
  DROP COLUMN IF EXISTS background_reauth_enabled;

ALTER TABLE public.app_settings
  DROP COLUMN IF EXISTS moodle_connection_url,
  DROP COLUMN IF EXISTS moodle_connection_service;

CREATE OR REPLACE FUNCTION public.backend_search_access_users(
  p_actor_id UUID,
  p_query TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 25,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  is_admin BOOLEAN,
  group_id UUID,
  group_name TEXT,
  group_slug TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_query TEXT := btrim(COALESCE(p_query, ''));
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF p_actor_id IS NULL OR NOT public.is_user_application_admin(p_actor_id) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH matched AS (
    SELECT
      user_row.id AS user_id,
      user_row.full_name,
      user_row.email,
      public.is_user_application_admin(user_row.id) AS is_admin,
      group_row.id AS group_id,
      group_row.name AS group_name,
      group_row.slug AS group_slug
    FROM public.users user_row
    LEFT JOIN public.user_group_memberships membership_row ON membership_row.user_id = user_row.id
    LEFT JOIN public.app_groups group_row ON group_row.id = membership_row.group_id
    WHERE v_query = ''
      OR user_row.full_name ILIKE ('%' || v_query || '%')
      OR COALESCE(user_row.email, '') ILIKE ('%' || v_query || '%')
  )
  SELECT
    matched.user_id,
    matched.full_name,
    matched.email,
    matched.is_admin,
    matched.group_id,
    matched.group_name,
    matched.group_slug,
    COUNT(*) OVER() AS total_count
  FROM matched
  ORDER BY matched.full_name, matched.email
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.backend_search_access_users(UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_search_access_users(UUID, TEXT, INTEGER, INTEGER)
  TO service_role;
REVOKE ALL ON FUNCTION public.backend_provision_claris_account(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_provision_claris_account(UUID, TEXT)
  TO service_role;

-- Remove the obsolete browser-facing search RPC whose return type exposed a
-- Moodle username. The backend-only replacement above is authoritative.
DROP FUNCTION IF EXISTS public.admin_search_users(TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.backend_set_user_access(
  p_actor_id UUID,
  p_target_user_id UUID,
  p_is_admin BOOLEAN,
  p_group_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_previous_group_id UUID;
  v_previous_is_admin BOOLEAN := false;
BEGIN
  IF p_actor_id IS NULL OR NOT public.is_user_application_admin(p_actor_id) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_is_admin IS NULL THEN
    RETURN jsonb_build_object('result', 'invalid_access');
  END IF;

  PERFORM 1 FROM public.users user_row
  WHERE user_row.id = p_target_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;
  IF p_actor_id = p_target_user_id AND NOT p_is_admin THEN
    RETURN jsonb_build_object('result', 'self_lockout');
  END IF;
  IF p_is_admin AND p_group_id IS NOT NULL THEN
    RETURN jsonb_build_object('result', 'invalid_access');
  END IF;
  IF NOT p_is_admin AND p_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.app_groups group_row WHERE group_row.id = p_group_id
  ) THEN
    RETURN jsonb_build_object('result', 'group_not_found');
  END IF;

  v_previous_is_admin := public.is_user_application_admin(p_target_user_id);
  SELECT membership_row.group_id INTO v_previous_group_id
  FROM public.user_group_memberships membership_row
  WHERE membership_row.user_id = p_target_user_id;

  IF p_is_admin THEN
    INSERT INTO public.admin_user_roles (user_id, role, permissions, granted_by)
    VALUES (p_target_user_id, 'admin', '["admin"]'::JSONB, p_actor_id)
    ON CONFLICT (user_id) DO UPDATE
    SET role = 'admin',
        permissions = '["admin"]'::JSONB,
        granted_by = p_actor_id,
        updated_at = NOW();
    DELETE FROM public.user_group_memberships WHERE user_id = p_target_user_id;
  ELSE
    DELETE FROM public.admin_user_roles
    WHERE user_id = p_target_user_id AND role = 'admin';
    IF p_group_id IS NULL THEN
      DELETE FROM public.user_group_memberships WHERE user_id = p_target_user_id;
    ELSE
      INSERT INTO public.user_group_memberships (user_id, group_id, assigned_by)
      VALUES (p_target_user_id, p_group_id, p_actor_id)
      ON CONFLICT (user_id) DO UPDATE
      SET group_id = EXCLUDED.group_id,
          assigned_by = p_actor_id,
          updated_at = NOW();
    END IF;
  END IF;

  INSERT INTO public.app_access_audit_log (
    actor_id, action, target_user_id, target_group_id, details
  ) VALUES (
    p_actor_id,
    'user_access_updated',
    p_target_user_id,
    CASE WHEN p_is_admin THEN NULL ELSE p_group_id END,
    jsonb_build_object(
      'previousIsAdmin', v_previous_is_admin,
      'previousGroupId', v_previous_group_id,
      'isAdmin', p_is_admin,
      'groupId', CASE WHEN p_is_admin THEN NULL ELSE p_group_id END
    )
  );

  RETURN jsonb_build_object(
    'result', 'saved',
    'target_user_id', p_target_user_id,
    'is_admin', p_is_admin,
    'group_id', CASE WHEN p_is_admin THEN NULL ELSE p_group_id END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.backend_set_user_access(UUID, UUID, BOOLEAN, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_set_user_access(UUID, UUID, BOOLEAN, UUID)
  TO service_role;
