-- Move the modern tasks and calendar modules behind authenticated backend use cases.
-- Browser roles no longer receive table or helper-RPC privileges after the frontend
-- adapters have been migrated to Edge Functions.

CREATE INDEX IF NOT EXISTS tasks_created_by_created_at_idx
  ON public.tasks (created_by, created_at DESC, id);

CREATE INDEX IF NOT EXISTS tasks_assigned_to_created_at_idx
  ON public.tasks (assigned_to, created_at DESC, id);

CREATE INDEX IF NOT EXISTS task_comments_task_created_at_idx
  ON public.task_comments (task_id, created_at, id);

CREATE INDEX IF NOT EXISTS task_tags_tag_task_idx
  ON public.task_tags (tag_id, task_id);

CREATE INDEX IF NOT EXISTS calendar_events_owner_start_at_idx
  ON public.calendar_events (owner, start_at, id);

-- Consolidate legacy duplicates before enforcing the actor-owned tag identity.
WITH ranked_tags AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY
        created_by,
        lower(btrim(label)),
        coalesce(nullif(btrim(entity_id), ''), ''),
        coalesce(nullif(btrim(entity_type), ''), 'custom')
      ORDER BY created_at, id
    ) AS canonical_id,
    row_number() OVER (
      PARTITION BY
        created_by,
        lower(btrim(label)),
        coalesce(nullif(btrim(entity_id), ''), ''),
        coalesce(nullif(btrim(entity_type), ''), 'custom')
      ORDER BY created_at, id
    ) AS row_number
  FROM public.tags
  WHERE created_by IS NOT NULL
), duplicate_tags AS (
  SELECT id, canonical_id
  FROM ranked_tags
  WHERE row_number > 1
)
INSERT INTO public.task_tags (task_id, tag_id)
SELECT task_tags.task_id, duplicate_tags.canonical_id
FROM public.task_tags
JOIN duplicate_tags ON duplicate_tags.id = task_tags.tag_id
ON CONFLICT (task_id, tag_id) DO NOTHING;

WITH ranked_tags AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        created_by,
        lower(btrim(label)),
        coalesce(nullif(btrim(entity_id), ''), ''),
        coalesce(nullif(btrim(entity_type), ''), 'custom')
      ORDER BY created_at, id
    ) AS row_number
  FROM public.tags
  WHERE created_by IS NOT NULL
)
DELETE FROM public.task_tags
USING ranked_tags
WHERE ranked_tags.row_number > 1
  AND task_tags.tag_id = ranked_tags.id;

WITH ranked_tags AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        created_by,
        lower(btrim(label)),
        coalesce(nullif(btrim(entity_id), ''), ''),
        coalesce(nullif(btrim(entity_type), ''), 'custom')
      ORDER BY created_at, id
    ) AS row_number
  FROM public.tags
  WHERE created_by IS NOT NULL
)
DELETE FROM public.tags
USING ranked_tags
WHERE ranked_tags.row_number > 1
  AND tags.id = ranked_tags.id;

CREATE UNIQUE INDEX IF NOT EXISTS tags_actor_identity_uidx
  ON public.tags (
    created_by,
    lower(btrim(label)),
    coalesce(nullif(btrim(entity_id), ''), ''),
    coalesce(nullif(btrim(entity_type), ''), 'custom')
  )
  WHERE created_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.backend_list_tasks_page(
  p_user_id uuid,
  p_status text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_due_from date DEFAULT NULL,
  p_due_to date DEFAULT NULL,
  p_suggested_by_ai boolean DEFAULT NULL,
  p_tag_search text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH scoped_tasks AS (
    SELECT
      task.*,
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', tag.id,
            'label', tag.label,
            'prefix', tag.prefix,
            'entity_id', tag.entity_id,
            'entity_type', tag.entity_type,
            'color', tag.color,
            'created_at', tag.created_at
          )
          ORDER BY lower(tag.label), tag.id
        )
        FROM public.task_tags task_tag
        JOIN public.tags tag ON tag.id = task_tag.tag_id
        WHERE task_tag.task_id = task.id
      ), '[]'::jsonb) AS linked_tags
    FROM public.tasks task
    WHERE task.created_by = p_user_id OR task.assigned_to = p_user_id
  ), filtered_tasks AS (
    SELECT *
    FROM scoped_tasks task
    WHERE (p_status IS NULL OR task.status = p_status)
      AND (p_priority IS NULL OR task.priority = p_priority)
      AND (p_due_from IS NULL OR task.due_date >= p_due_from)
      AND (p_due_to IS NULL OR task.due_date <= p_due_to)
      AND (p_suggested_by_ai IS NULL OR task.suggested_by_ai = p_suggested_by_ai)
      AND (
        nullif(btrim(p_tag_search), '') IS NULL
        OR EXISTS (
          SELECT 1
          FROM unnest(coalesce(task.tags, '{}'::text[])) ai_tag
          WHERE strpos(lower(ai_tag), lower(btrim(p_tag_search))) > 0
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(task.linked_tags) linked_tag
          WHERE strpos(lower(linked_tag ->> 'label'), lower(btrim(p_tag_search))) > 0
        )
      )
  ), page AS (
    SELECT *
    FROM filtered_tasks
    ORDER BY created_at DESC, id
    LIMIT greatest(1, least(coalesce(p_limit, 100), 1000))
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'items', coalesce((
      SELECT jsonb_agg(to_jsonb(page) ORDER BY page.created_at DESC, page.id)
      FROM page
    ), '[]'::jsonb),
    'total_count', (SELECT count(*) FROM filtered_tasks)
  );
$function$;

CREATE OR REPLACE FUNCTION public.backend_add_task_tag(
  p_actor_id uuid,
  p_task_id uuid,
  p_label text,
  p_prefix text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_entity_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  normalized_label text := btrim(p_label);
  normalized_prefix text := nullif(btrim(p_prefix), '');
  normalized_entity_id text := nullif(btrim(p_entity_id), '');
  normalized_entity_type text := coalesce(nullif(btrim(p_entity_type), ''), 'custom');
  selected_tag public.tags%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_task_id IS NULL OR normalized_label IS NULL OR normalized_label = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_task_tag_input';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tasks task
    WHERE task.id = p_task_id
      AND (task.created_by = p_actor_id OR task.assigned_to = p_actor_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'task_not_found';
  END IF;

  INSERT INTO public.tags (
    label,
    prefix,
    entity_id,
    entity_type,
    created_by
  ) VALUES (
    normalized_label,
    normalized_prefix,
    normalized_entity_id,
    normalized_entity_type,
    p_actor_id
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO selected_tag;

  IF selected_tag.id IS NULL THEN
    SELECT * INTO STRICT selected_tag
    FROM public.tags tag
    WHERE tag.created_by = p_actor_id
      AND lower(btrim(tag.label)) = lower(normalized_label)
      AND coalesce(nullif(btrim(tag.entity_id), ''), '') = coalesce(normalized_entity_id, '')
      AND coalesce(nullif(btrim(tag.entity_type), ''), 'custom') = normalized_entity_type
    ORDER BY tag.created_at, tag.id
    LIMIT 1;
  END IF;

  INSERT INTO public.task_tags (task_id, tag_id)
  VALUES (p_task_id, selected_tag.id)
  ON CONFLICT (task_id, tag_id) DO NOTHING;

  RETURN jsonb_build_object(
    'id', selected_tag.id,
    'label', selected_tag.label,
    'prefix', selected_tag.prefix,
    'entity_id', selected_tag.entity_id,
    'entity_type', selected_tag.entity_type,
    'color', selected_tag.color,
    'created_at', selected_tag.created_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.backend_list_tasks_page(
  uuid, text, text, date, date, boolean, text, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_list_tasks_page(
  uuid, text, text, date, date, boolean, text, integer, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.backend_add_task_tag(
  uuid, uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_add_task_tag(
  uuid, uuid, text, text, text, text
) TO service_role;

REVOKE ALL ON TABLE
  public.tasks,
  public.task_comments,
  public.task_history,
  public.tags,
  public.task_tags,
  public.calendar_events
FROM anon, authenticated;

GRANT ALL ON TABLE
  public.tasks,
  public.task_comments,
  public.task_history,
  public.tags,
  public.task_tags,
  public.calendar_events
TO service_role;
