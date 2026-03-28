-- Rework access control for scalable group-based permissions.
-- Keeps application admins as a global override outside groups.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. Permission catalog and groups
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_permission_definitions (
  key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_group_permissions (
  group_id UUID NOT NULL REFERENCES public.app_groups(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.app_permission_definitions(key) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, permission_key)
);

CREATE TABLE IF NOT EXISTS public.user_group_memberships (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.app_groups(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_groups_name
  ON public.app_groups(name);

CREATE INDEX IF NOT EXISTS idx_app_group_permissions_permission_key
  ON public.app_group_permissions(permission_key);

CREATE INDEX IF NOT EXISTS idx_user_group_memberships_group_id
  ON public.user_group_memberships(group_id);

CREATE INDEX IF NOT EXISTS idx_users_full_name_trgm
  ON public.users
  USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_moodle_username_trgm
  ON public.users
  USING gin (moodle_username gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_email_trgm
  ON public.users
  USING gin (COALESCE(email, '') gin_trgm_ops);

ALTER TABLE public.app_permission_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_group_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_group_memberships ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_app_permission_definitions_updated_at ON public.app_permission_definitions;
CREATE TRIGGER update_app_permission_definitions_updated_at
  BEFORE UPDATE ON public.app_permission_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_app_groups_updated_at ON public.app_groups;
CREATE TRIGGER update_app_groups_updated_at
  BEFORE UPDATE ON public.app_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_group_memberships_updated_at ON public.user_group_memberships;
CREATE TRIGGER update_user_group_memberships_updated_at
  BEFORE UPDATE ON public.user_group_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Admin helpers and authorization functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.slugify_app_group_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(BOTH '-' FROM regexp_replace(lower(COALESCE(p_name, '')), '[^a-z0-9]+', '-', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.is_user_application_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_user_roles aur
    WHERE aur.user_id = p_user_id
      AND aur.role = 'admin'
  )
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_user_id
      AND (
        u.moodle_username = '04112637225'
        OR lower(COALESCE(u.email, '')) = 'julioalves@fieg.com.br'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_application_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_user_application_admin(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.user_has_course_access(p_user_id UUID, p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_user_application_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_courses
      WHERE user_id = p_user_id
        AND course_id = p_course_id
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_student_access(p_user_id UUID, p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_user_application_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      JOIN public.student_courses sc ON sc.course_id = uc.course_id
      WHERE uc.user_id = p_user_id
        AND sc.student_id = p_student_id
    );
$$;

CREATE OR REPLACE FUNCTION public.get_user_permission_keys(p_user_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH admin_context AS (
    SELECT public.is_user_application_admin(p_user_id) AS is_admin
  )
  SELECT CASE
    WHEN (SELECT is_admin FROM admin_context) THEN (
      SELECT COALESCE(array_agg(apd.key ORDER BY apd.category, apd.sort_order, apd.key), ARRAY[]::TEXT[])
      FROM public.app_permission_definitions apd
    )
    ELSE (
      SELECT COALESCE(array_agg(DISTINCT agp.permission_key ORDER BY agp.permission_key), ARRAY[]::TEXT[])
      FROM public.user_group_memberships ugm
      JOIN public.app_group_permissions agp ON agp.group_id = ugm.group_id
      WHERE ugm.user_id = p_user_id
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id UUID, p_permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_user_application_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_group_memberships ugm
      JOIN public.app_group_permissions agp ON agp.group_id = ugm.group_id
      WHERE ugm.user_id = p_user_id
        AND agp.permission_key = p_permission_key
    );
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_authorization_context()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_admin BOOLEAN := false;
  v_group_id UUID;
  v_group_name TEXT;
  v_group_slug TEXT;
  v_permissions TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'is_admin', false,
      'group_id', NULL,
      'group_name', NULL,
      'group_slug', NULL,
      'permissions', to_jsonb(ARRAY[]::TEXT[])
    );
  END IF;

  v_is_admin := public.is_user_application_admin(v_user_id);

  SELECT ag.id, ag.name, ag.slug
  INTO v_group_id, v_group_name, v_group_slug
  FROM public.user_group_memberships ugm
  JOIN public.app_groups ag ON ag.id = ugm.group_id
  WHERE ugm.user_id = v_user_id
  LIMIT 1;

  v_permissions := public.get_user_permission_keys(v_user_id);

  RETURN jsonb_build_object(
    'is_admin', v_is_admin,
    'group_id', v_group_id,
    'group_name', v_group_name,
    'group_slug', v_group_slug,
    'permissions', to_jsonb(COALESCE(v_permissions, ARRAY[]::TEXT[]))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_accessible_course_ids(
  p_user_id UUID,
  p_role_filter TEXT DEFAULT NULL
)
RETURNS TABLE (course_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id
  FROM public.courses c
  WHERE public.is_user_application_admin(p_user_id)

  UNION

  SELECT uc.course_id
  FROM public.user_courses uc
  WHERE uc.user_id = p_user_id
    AND (p_role_filter IS NULL OR uc.role = p_role_filter);
$$;

CREATE OR REPLACE FUNCTION public.admin_list_permission_definitions()
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
  IF NOT public.is_application_admin() THEN
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

CREATE OR REPLACE FUNCTION public.admin_list_groups()
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
  IF NOT public.is_application_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ag.id,
    ag.slug,
    ag.name,
    ag.description,
    COUNT(DISTINCT ugm.user_id) AS user_count,
    COALESCE(array_agg(DISTINCT agp.permission_key ORDER BY agp.permission_key) FILTER (WHERE agp.permission_key IS NOT NULL), ARRAY[]::TEXT[]) AS permissions
  FROM public.app_groups ag
  LEFT JOIN public.user_group_memberships ugm ON ugm.group_id = ag.id
  LEFT JOIN public.app_group_permissions agp ON agp.group_id = ag.id
  GROUP BY ag.id, ag.slug, ag.name, ag.description
  ORDER BY ag.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_search_users(
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
  v_query TEXT := trim(COALESCE(p_query, ''));
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT public.is_application_admin() THEN
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

CREATE OR REPLACE FUNCTION public.admin_upsert_group(
  p_group_id UUID DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_permission_keys TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_group_id UUID := COALESCE(p_group_id, gen_random_uuid());
  v_group_name TEXT := trim(COALESCE(p_name, ''));
  v_group_slug TEXT;
BEGIN
  IF NOT public.is_application_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF v_group_name = '' THEN
    RAISE EXCEPTION 'Group name is required';
  END IF;

  v_group_slug := public.slugify_app_group_name(v_group_name);
  IF v_group_slug = '' THEN
    RAISE EXCEPTION 'Invalid group name';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_permission_keys, ARRAY[]::TEXT[])) AS permission_key
    LEFT JOIN public.app_permission_definitions apd ON apd.key = permission_key
    WHERE apd.key IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more permission keys are invalid';
  END IF;

  INSERT INTO public.app_groups (id, slug, name, description, created_by, updated_by)
  VALUES (v_group_id, v_group_slug, v_group_name, NULLIF(trim(COALESCE(p_description, '')), ''), auth.uid(), auth.uid())
  ON CONFLICT (id) DO UPDATE
    SET slug = EXCLUDED.slug,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        updated_by = auth.uid(),
        updated_at = now();

  DELETE FROM public.app_group_permissions
  WHERE group_id = v_group_id;

  INSERT INTO public.app_group_permissions (group_id, permission_key)
  SELECT v_group_id, permission_key
  FROM (
    SELECT DISTINCT unnest(COALESCE(p_permission_keys, ARRAY[]::TEXT[])) AS permission_key
  ) AS permission_keys
  WHERE permission_key <> '';

  RETURN v_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_group(
  p_group_id UUID,
  p_reassign_to_group_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member_count BIGINT;
BEGIN
  IF NOT public.is_application_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'Group id is required';
  END IF;

  IF p_reassign_to_group_id = p_group_id THEN
    RAISE EXCEPTION 'Cannot reassign users to the same group being deleted';
  END IF;

  SELECT COUNT(*)
  INTO v_member_count
  FROM public.user_group_memberships ugm
  WHERE ugm.group_id = p_group_id;

  IF v_member_count > 0 AND p_reassign_to_group_id IS NULL THEN
    RAISE EXCEPTION 'Group has active users and requires reassignment before deletion';
  END IF;

  IF p_reassign_to_group_id IS NOT NULL THEN
    UPDATE public.user_group_memberships
    SET group_id = p_reassign_to_group_id,
        assigned_by = auth.uid(),
        updated_at = now()
    WHERE group_id = p_group_id;
  END IF;

  DELETE FROM public.app_groups
  WHERE id = p_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_group(
  p_target_user_id UUID,
  p_group_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_application_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user id is required';
  END IF;

  IF p_group_id IS NULL THEN
    DELETE FROM public.user_group_memberships
    WHERE user_id = p_target_user_id;
    RETURN;
  END IF;

  INSERT INTO public.user_group_memberships (user_id, group_id, assigned_by)
  VALUES (p_target_user_id, p_group_id, auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET group_id = EXCLUDED.group_id,
        assigned_by = auth.uid(),
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_admin(
  p_target_user_id UUID,
  p_is_admin BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_application_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user id is required';
  END IF;

  IF p_is_admin THEN
    INSERT INTO public.admin_user_roles (user_id, role, permissions, granted_by)
    VALUES (p_target_user_id, 'admin', '["admin"]'::jsonb, auth.uid())
    ON CONFLICT (user_id) DO UPDATE
      SET role = 'admin',
          permissions = '["admin"]'::jsonb,
          granted_by = auth.uid(),
          updated_at = now();
  ELSE
    DELETE FROM public.admin_user_roles
    WHERE user_id = p_target_user_id
      AND role = 'admin';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS policies for new access tables
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "app_permission_definitions_select" ON public.app_permission_definitions;
CREATE POLICY "app_permission_definitions_select"
ON public.app_permission_definitions
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "app_permission_definitions_manage" ON public.app_permission_definitions;
CREATE POLICY "app_permission_definitions_manage"
ON public.app_permission_definitions
FOR ALL
USING (public.is_application_admin())
WITH CHECK (public.is_application_admin());

DROP POLICY IF EXISTS "app_groups_select" ON public.app_groups;
CREATE POLICY "app_groups_select"
ON public.app_groups
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "app_groups_manage" ON public.app_groups;
CREATE POLICY "app_groups_manage"
ON public.app_groups
FOR ALL
USING (public.is_application_admin())
WITH CHECK (public.is_application_admin());

DROP POLICY IF EXISTS "app_group_permissions_select" ON public.app_group_permissions;
CREATE POLICY "app_group_permissions_select"
ON public.app_group_permissions
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "app_group_permissions_manage" ON public.app_group_permissions;
CREATE POLICY "app_group_permissions_manage"
ON public.app_group_permissions
FOR ALL
USING (public.is_application_admin())
WITH CHECK (public.is_application_admin());

DROP POLICY IF EXISTS "user_group_memberships_select" ON public.user_group_memberships;
CREATE POLICY "user_group_memberships_select"
ON public.user_group_memberships
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_application_admin());

DROP POLICY IF EXISTS "user_group_memberships_manage" ON public.user_group_memberships;
CREATE POLICY "user_group_memberships_manage"
ON public.user_group_memberships
FOR ALL
USING (public.is_application_admin())
WITH CHECK (public.is_application_admin());

GRANT SELECT ON public.app_permission_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_groups TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.app_group_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_group_memberships TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Seed permission catalog and default tutor group
-- ---------------------------------------------------------------------------

INSERT INTO public.app_permission_definitions (key, category, label, description, sort_order)
VALUES
  ('dashboard.view', 'Painel', 'Painel de monitoramento', 'Acessar a tela inicial com indicadores operacionais.', 10),
  ('courses.catalog.view', 'Cursos', 'Catalogo de cursos', 'Visualizar a listagem principal de cursos.', 20),
  ('courses.panel.view', 'Cursos', 'Painel do curso', 'Abrir o painel detalhado de um curso.', 30),
  ('schools.view', 'Cursos', 'Escolas', 'Visualizar a navegação por escolas e categorias.', 40),
  ('students.view', 'Alunos', 'Alunos e perfis', 'Listar alunos e acessar perfis individuais.', 50),
  ('tasks.view', 'Operacao', 'Tarefas', 'Usar a tela de tarefas operacionais.', 60),
  ('agenda.view', 'Operacao', 'Agenda', 'Usar a agenda e eventos.', 70),
  ('messages.view', 'Comunicacao', 'Mensagens Moodle', 'Acessar conversas diretas do Moodle.', 80),
  ('messages.bulk_send', 'Comunicacao', 'Envio em massa', 'Disparar mensagens em massa e rotinas relacionadas.', 90),
  ('whatsapp.view', 'Comunicacao', 'WhatsApp', 'Acessar a central de WhatsApp.', 100),
  ('automations.view', 'Operacao', 'Automacoes', 'Acessar automações, agendamentos e modelos.', 110),
  ('services.view', 'Operacao', 'Meus servicos', 'Gerenciar integrações pessoais.', 120),
  ('claris.view', 'IA', 'Claris IA', 'Usar o chat da Claris IA.', 130),
  ('claris.proactive.generate', 'IA', 'Sugestoes proativas', 'Gerar e aceitar sugestões proativas da Claris IA.', 140),
  ('grades.suggestions.manage', 'IA', 'Correcao por IA', 'Gerar e aprovar sugestões de nota e feedback por IA.', 150),
  ('reports.view', 'Relatorios', 'Relatorios', 'Visualizar relatórios analíticos.', 160),
  ('settings.view', 'Configuracoes', 'Configuracoes', 'Acessar configuracoes pessoais e operacionais.', 170)
ON CONFLICT (key) DO UPDATE
SET
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

DO $$
DECLARE
  v_tutor_group_id UUID;
BEGIN
  INSERT INTO public.app_groups (slug, name, description)
  VALUES ('tutor', 'Tutor', 'Grupo padrao com acesso operacional ao produto.')
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        updated_at = now()
  RETURNING id INTO v_tutor_group_id;

  DELETE FROM public.app_group_permissions
  WHERE group_id = v_tutor_group_id;

  INSERT INTO public.app_group_permissions (group_id, permission_key)
  SELECT v_tutor_group_id, key
  FROM public.app_permission_definitions;

  -- Migrate any previous non-admin admin-role assignments into the tutor group
  -- so legacy support/analyst users keep non-admin product access.
  INSERT INTO public.user_group_memberships (user_id, group_id, assigned_by)
  SELECT aur.user_id, v_tutor_group_id, aur.granted_by
  FROM public.admin_user_roles aur
  WHERE aur.role <> 'admin'
  ON CONFLICT (user_id) DO NOTHING;

  DELETE FROM public.admin_user_roles
  WHERE role <> 'admin';
END $$;

-- ---------------------------------------------------------------------------
-- 5. Admin-aware policy refresh on critical product tables
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "activity_feed_select" ON public.activity_feed;
CREATE POLICY "activity_feed_select" ON public.activity_feed
  FOR SELECT
  USING (
    public.is_application_admin()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      WHERE uc.course_id = activity_feed.course_id
        AND uc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "courses_select" ON public.courses;
CREATE POLICY "courses_select" ON public.courses
  FOR SELECT
  USING (
    public.is_application_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      WHERE uc.course_id = courses.id
        AND uc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "courses_update" ON public.courses;
CREATE POLICY "courses_update" ON public.courses
  FOR UPDATE
  USING (
    public.is_application_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      WHERE uc.course_id = courses.id
        AND uc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_application_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      WHERE uc.course_id = courses.id
        AND uc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pending_tasks_select" ON public.pending_tasks;
CREATE POLICY "pending_tasks_select" ON public.pending_tasks
  FOR SELECT
  USING (
    public.is_application_admin()
    OR created_by_user_id = auth.uid()
    OR assigned_to_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      WHERE uc.course_id = pending_tasks.course_id
        AND uc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "student_activities_select" ON public.student_activities;
CREATE POLICY "student_activities_select" ON public.student_activities
  FOR SELECT
  USING (
    public.is_application_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      WHERE uc.course_id = student_activities.course_id
        AND uc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "student_activities_update" ON public.student_activities;
CREATE POLICY "student_activities_update" ON public.student_activities
  FOR UPDATE
  USING (
    public.is_application_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      WHERE uc.course_id = student_activities.course_id
        AND uc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_application_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      WHERE uc.course_id = student_activities.course_id
        AND uc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "student_course_grades_select" ON public.student_course_grades;
CREATE POLICY "student_course_grades_select" ON public.student_course_grades
  FOR SELECT
  USING (
    public.is_application_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      WHERE uc.course_id = student_course_grades.course_id
        AND uc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "student_courses_insert" ON public.student_courses;
CREATE POLICY "student_courses_insert" ON public.student_courses
  FOR INSERT
  WITH CHECK (
    public.is_application_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      WHERE uc.course_id = student_courses.course_id
        AND uc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "student_courses_select" ON public.student_courses;
CREATE POLICY "student_courses_select" ON public.student_courses
  FOR SELECT
  USING (
    public.is_application_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      WHERE uc.course_id = student_courses.course_id
        AND uc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "student_courses_update" ON public.student_courses;
CREATE POLICY "student_courses_update" ON public.student_courses
  FOR UPDATE
  USING (
    public.is_application_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      WHERE uc.course_id = student_courses.course_id
        AND uc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_application_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      WHERE uc.course_id = student_courses.course_id
        AND uc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "students_select" ON public.students;
CREATE POLICY "students_select" ON public.students
  FOR SELECT
  USING (
    public.is_application_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      JOIN public.student_courses sc ON sc.course_id = uc.course_id
      WHERE uc.user_id = auth.uid()
        AND sc.student_id = students.id
    )
  );

DROP POLICY IF EXISTS "students_update" ON public.students;
CREATE POLICY "students_update" ON public.students
  FOR UPDATE
  USING (
    public.is_application_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      JOIN public.student_courses sc ON sc.course_id = uc.course_id
      WHERE uc.user_id = auth.uid()
        AND sc.student_id = students.id
    )
  )
  WITH CHECK (
    public.is_application_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_courses uc
      JOIN public.student_courses sc ON sc.course_id = uc.course_id
      WHERE uc.user_id = auth.uid()
        AND sc.student_id = students.id
    )
  );

DROP POLICY IF EXISTS "user_courses_select" ON public.user_courses;
CREATE POLICY "user_courses_select" ON public.user_courses
  FOR SELECT
  USING (
    public.is_application_admin()
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "user_courses_insert" ON public.user_courses;
CREATE POLICY "user_courses_insert" ON public.user_courses
  FOR INSERT
  WITH CHECK (
    public.is_application_admin()
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "user_courses_delete" ON public.user_courses;
CREATE POLICY "user_courses_delete" ON public.user_courses
  FOR DELETE
  USING (
    public.is_application_admin()
    OR user_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 6. Remove deprecated feature flags
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.app_feature_flags CASCADE;
