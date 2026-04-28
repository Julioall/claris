DO $$
DECLARE
  v_monitor_group_id UUID;
BEGIN
  INSERT INTO public.app_groups (slug, name, description)
  VALUES ('monitor', 'Monitor', 'Grupo operacional para monitores de curso.')
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        updated_at = now()
  RETURNING id INTO v_monitor_group_id;

  DELETE FROM public.app_group_permissions
  WHERE group_id = v_monitor_group_id;

  INSERT INTO public.app_group_permissions (group_id, permission_key)
  SELECT v_monitor_group_id, key
  FROM public.app_permission_definitions
  WHERE key = ANY (
    ARRAY[
      'dashboard.view',
      'courses.catalog.view',
      'courses.panel.view',
      'schools.view',
      'students.view',
      'tasks.view',
      'agenda.view',
      'messages.view',
      'services.view',
      'claris.view',
      'reports.view',
      'settings.view'
    ]::TEXT[]
  );
END $$;

