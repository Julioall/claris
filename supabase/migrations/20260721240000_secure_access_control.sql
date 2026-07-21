-- Move authorization context and administrative access management behind the
-- access-control backend. Every privileged operation receives the verified
-- actor explicitly, executes atomically and records an immutable audit event.

CREATE TABLE IF NOT EXISTS public.app_access_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  action TEXT NOT NULL,
  target_user_id UUID,
  target_group_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_access_audit_log_actor_created_at
  ON public.app_access_audit_log(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_access_audit_log_target_user_created_at
  ON public.app_access_audit_log(target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

ALTER TABLE public.app_access_audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reject_app_access_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Access audit events are immutable' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS reject_app_access_audit_mutation
  ON public.app_access_audit_log;
CREATE TRIGGER reject_app_access_audit_mutation
  BEFORE UPDATE OR DELETE ON public.app_access_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.reject_app_access_audit_mutation();

CREATE OR REPLACE FUNCTION public.backend_get_authorization_context(
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin BOOLEAN := false;
  v_group_id UUID;
  v_group_name TEXT;
  v_group_slug TEXT;
  v_permissions TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated actor is required' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.is_user_application_admin(p_actor_id);

  SELECT ag.id, ag.name, ag.slug
  INTO v_group_id, v_group_name, v_group_slug
  FROM public.user_group_memberships ugm
  JOIN public.app_groups ag ON ag.id = ugm.group_id
  WHERE ugm.user_id = p_actor_id
  LIMIT 1;

  v_permissions := public.get_user_permission_keys(p_actor_id);

  RETURN jsonb_build_object(
    'is_admin', v_is_admin,
    'group_id', v_group_id,
    'group_name', v_group_name,
    'group_slug', v_group_slug,
    'permissions', to_jsonb(COALESCE(v_permissions, ARRAY[]::TEXT[]))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_list_permission_definitions(
  p_actor_id UUID
)
RETURNS TABLE (
  key TEXT,
  category TEXT,
  label TEXT,
  description TEXT,
  sort_order INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_actor_id IS NULL OR NOT public.is_user_application_admin(p_actor_id) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    apd.key,
    apd.category,
    apd.label,
    apd.description,
    apd.sort_order
  FROM public.app_permission_definitions apd
  ORDER BY apd.category, apd.sort_order, apd.key;
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_list_access_groups(
  p_actor_id UUID
)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  name TEXT,
  description TEXT,
  user_count BIGINT,
  permissions TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_actor_id IS NULL OR NOT public.is_user_application_admin(p_actor_id) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ag.id,
    ag.slug,
    ag.name,
    ag.description,
    COUNT(DISTINCT ugm.user_id) AS user_count,
    COALESCE(
      array_agg(DISTINCT agp.permission_key ORDER BY agp.permission_key)
        FILTER (WHERE agp.permission_key IS NOT NULL),
      ARRAY[]::TEXT[]
    ) AS permissions
  FROM public.app_groups ag
  LEFT JOIN public.user_group_memberships ugm ON ugm.group_id = ag.id
  LEFT JOIN public.app_group_permissions agp ON agp.group_id = ag.id
  GROUP BY ag.id, ag.slug, ag.name, ag.description
  ORDER BY ag.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_search_access_users(
  p_actor_id UUID,
  p_query TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 25,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  moodle_username TEXT,
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
      u.id AS user_id,
      u.full_name,
      u.moodle_username,
      u.email,
      public.is_user_application_admin(u.id) AS is_admin,
      ag.id AS group_id,
      ag.name AS group_name,
      ag.slug AS group_slug
    FROM public.users u
    LEFT JOIN public.user_group_memberships ugm ON ugm.user_id = u.id
    LEFT JOIN public.app_groups ag ON ag.id = ugm.group_id
    WHERE (
      v_query = ''
      OR u.full_name ILIKE ('%' || v_query || '%')
      OR u.moodle_username ILIKE ('%' || v_query || '%')
      OR COALESCE(u.email, '') ILIKE ('%' || v_query || '%')
    )
  )
  SELECT
    matched.user_id,
    matched.full_name,
    matched.moodle_username,
    matched.email,
    matched.is_admin,
    matched.group_id,
    matched.group_name,
    matched.group_slug,
    COUNT(*) OVER() AS total_count
  FROM matched
  ORDER BY matched.full_name, matched.moodle_username
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_upsert_access_group(
  p_actor_id UUID,
  p_group_id UUID DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_permission_keys TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_created BOOLEAN := p_group_id IS NULL;
  v_group_id UUID := COALESCE(p_group_id, gen_random_uuid());
  v_group_name TEXT := btrim(COALESCE(p_name, ''));
  v_group_slug TEXT;
  v_permission_keys TEXT[];
BEGIN
  IF p_actor_id IS NULL OR NOT public.is_user_application_admin(p_actor_id) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF v_group_name = '' THEN
    RETURN jsonb_build_object('result', 'invalid_name');
  END IF;

  v_group_slug := public.slugify_app_group_name(v_group_name);
  IF v_group_slug = '' THEN
    RETURN jsonb_build_object('result', 'invalid_name');
  END IF;

  SELECT COALESCE(array_agg(permission_key ORDER BY permission_key), ARRAY[]::TEXT[])
  INTO v_permission_keys
  FROM (
    SELECT DISTINCT btrim(requested.permission_key) AS permission_key
    FROM unnest(COALESCE(p_permission_keys, ARRAY[]::TEXT[])) AS requested(permission_key)
    WHERE btrim(requested.permission_key) <> ''
  ) normalized;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_permission_keys) AS requested(permission_key)
    LEFT JOIN public.app_permission_definitions apd
      ON apd.key = requested.permission_key
    WHERE apd.key IS NULL
  ) THEN
    RETURN jsonb_build_object('result', 'invalid_permissions');
  END IF;

  IF p_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.app_groups ag WHERE ag.id = p_group_id
  ) THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.app_groups ag
    WHERE ag.id <> v_group_id
      AND (ag.slug = v_group_slug OR lower(ag.name) = lower(v_group_name))
  ) THEN
    RETURN jsonb_build_object('result', 'conflict');
  END IF;

  IF v_created THEN
    INSERT INTO public.app_groups (
      id,
      slug,
      name,
      description,
      created_by,
      updated_by
    )
    VALUES (
      v_group_id,
      v_group_slug,
      v_group_name,
      NULLIF(btrim(COALESCE(p_description, '')), ''),
      p_actor_id,
      p_actor_id
    );
  ELSE
    UPDATE public.app_groups
    SET slug = v_group_slug,
        name = v_group_name,
        description = NULLIF(btrim(COALESCE(p_description, '')), ''),
        updated_by = p_actor_id,
        updated_at = now()
    WHERE id = v_group_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('result', 'not_found');
    END IF;
  END IF;

  DELETE FROM public.app_group_permissions
  WHERE group_id = v_group_id;

  INSERT INTO public.app_group_permissions (group_id, permission_key)
  SELECT v_group_id, permission_key
  FROM unnest(v_permission_keys) AS normalized(permission_key);

  INSERT INTO public.app_access_audit_log (
    actor_id,
    action,
    target_group_id,
    details
  )
  VALUES (
    p_actor_id,
    CASE WHEN v_created THEN 'group_created' ELSE 'group_updated' END,
    v_group_id,
    jsonb_build_object(
      'name', v_group_name,
      'permissionCount', cardinality(v_permission_keys)
    )
  );

  RETURN jsonb_build_object(
    'result', 'saved',
    'group_id', v_group_id,
    'created', v_created
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('result', 'conflict');
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_delete_access_group(
  p_actor_id UUID,
  p_group_id UUID,
  p_reassign_to_group_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_group_name TEXT;
  v_member_count BIGINT := 0;
  v_reassigned_count INTEGER := 0;
BEGIN
  IF p_actor_id IS NULL OR NOT public.is_user_application_admin(p_actor_id) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT ag.name
  INTO v_group_name
  FROM public.app_groups ag
  WHERE ag.id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  IF p_reassign_to_group_id = p_group_id THEN
    RETURN jsonb_build_object('result', 'invalid_reassignment');
  END IF;

  IF p_reassign_to_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.app_groups ag WHERE ag.id = p_reassign_to_group_id
  ) THEN
    RETURN jsonb_build_object('result', 'destination_not_found');
  END IF;

  SELECT COUNT(*)
  INTO v_member_count
  FROM public.user_group_memberships ugm
  WHERE ugm.group_id = p_group_id;

  IF v_member_count > 0 AND p_reassign_to_group_id IS NULL THEN
    RETURN jsonb_build_object(
      'result', 'group_has_users',
      'member_count', v_member_count
    );
  END IF;

  IF p_reassign_to_group_id IS NOT NULL THEN
    UPDATE public.user_group_memberships
    SET group_id = p_reassign_to_group_id,
        assigned_by = p_actor_id,
        updated_at = now()
    WHERE group_id = p_group_id;
    GET DIAGNOSTICS v_reassigned_count = ROW_COUNT;
  END IF;

  DELETE FROM public.app_groups
  WHERE id = p_group_id;

  INSERT INTO public.app_access_audit_log (
    actor_id,
    action,
    target_group_id,
    details
  )
  VALUES (
    p_actor_id,
    'group_deleted',
    p_group_id,
    jsonb_build_object(
      'name', v_group_name,
      'reassignedToGroupId', p_reassign_to_group_id,
      'reassignedUserCount', v_reassigned_count
    )
  );

  RETURN jsonb_build_object(
    'result', 'deleted',
    'group_id', p_group_id,
    'reassigned_user_count', v_reassigned_count
  );
END;
$$;

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
  v_protected_admin BOOLEAN := false;
BEGIN
  IF p_actor_id IS NULL OR NOT public.is_user_application_admin(p_actor_id) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_is_admin IS NULL THEN
    RETURN jsonb_build_object('result', 'invalid_access');
  END IF;

  PERFORM 1
  FROM public.users u
  WHERE u.id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  IF p_actor_id = p_target_user_id AND NOT p_is_admin THEN
    RETURN jsonb_build_object('result', 'self_lockout');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_target_user_id
      AND (
        u.moodle_username = '04112637225'
        OR lower(COALESCE(u.email, '')) = 'julioalves@fieg.com.br'
      )
  )
  INTO v_protected_admin;

  IF v_protected_admin AND NOT p_is_admin THEN
    RETURN jsonb_build_object('result', 'protected_admin');
  END IF;

  IF p_is_admin AND p_group_id IS NOT NULL THEN
    RETURN jsonb_build_object('result', 'invalid_access');
  END IF;

  IF NOT p_is_admin AND p_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.app_groups ag WHERE ag.id = p_group_id
  ) THEN
    RETURN jsonb_build_object('result', 'group_not_found');
  END IF;

  v_previous_is_admin := public.is_user_application_admin(p_target_user_id);

  SELECT ugm.group_id
  INTO v_previous_group_id
  FROM public.user_group_memberships ugm
  WHERE ugm.user_id = p_target_user_id;

  IF p_is_admin THEN
    INSERT INTO public.admin_user_roles (user_id, role, permissions, granted_by)
    VALUES (p_target_user_id, 'admin', '["admin"]'::JSONB, p_actor_id)
    ON CONFLICT (user_id) DO UPDATE
      SET role = 'admin',
          permissions = '["admin"]'::JSONB,
          granted_by = p_actor_id,
          updated_at = now();

    DELETE FROM public.user_group_memberships
    WHERE user_id = p_target_user_id;
  ELSE
    DELETE FROM public.admin_user_roles
    WHERE user_id = p_target_user_id
      AND role = 'admin';

    IF p_group_id IS NULL THEN
      DELETE FROM public.user_group_memberships
      WHERE user_id = p_target_user_id;
    ELSE
      INSERT INTO public.user_group_memberships (user_id, group_id, assigned_by)
      VALUES (p_target_user_id, p_group_id, p_actor_id)
      ON CONFLICT (user_id) DO UPDATE
        SET group_id = EXCLUDED.group_id,
            assigned_by = p_actor_id,
            updated_at = now();
    END IF;
  END IF;

  INSERT INTO public.app_access_audit_log (
    actor_id,
    action,
    target_user_id,
    target_group_id,
    details
  )
  VALUES (
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

-- The browser no longer owns access-control persistence or RPC orchestration.
REVOKE ALL PRIVILEGES ON TABLE public.app_permission_definitions
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.app_groups
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.app_group_permissions
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.user_group_memberships
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.admin_user_roles
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.app_access_audit_log
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_permission_definitions
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_groups
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_group_permissions
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_group_memberships
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_user_roles
  TO service_role;
GRANT SELECT, INSERT ON TABLE public.app_access_audit_log
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_current_user_authorization_context()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_permission_definitions()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_groups()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_search_users(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_group(UUID, TEXT, TEXT, TEXT[])
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_delete_group(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_group(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_admin(UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.reject_app_access_audit_mutation()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backend_get_authorization_context(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backend_list_permission_definitions(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backend_list_access_groups(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backend_search_access_users(UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backend_upsert_access_group(UUID, UUID, TEXT, TEXT, TEXT[])
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backend_delete_access_group(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.backend_set_user_access(UUID, UUID, BOOLEAN, UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.backend_get_authorization_context(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_list_permission_definitions(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_list_access_groups(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_search_access_users(UUID, TEXT, INTEGER, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_upsert_access_group(UUID, UUID, TEXT, TEXT, TEXT[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_delete_access_group(UUID, UUID, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.backend_set_user_access(UUID, UUID, BOOLEAN, UUID)
  TO service_role;

COMMENT ON TABLE public.app_access_audit_log IS
  'Trilha imutavel das alteracoes administrativas de grupos e acessos.';
COMMENT ON FUNCTION public.backend_set_user_access(UUID, UUID, BOOLEAN, UUID) IS
  'Atualiza papel administrativo e grupo em uma unica transacao, com protecao contra auto-lockout.';
