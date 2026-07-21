-- Move Claris suggestions behind a backend use case. Accepting or dismissing a
-- suggestion is a single transaction so its lifecycle, generated entity and
-- cooldown cannot diverge.

CREATE OR REPLACE FUNCTION public.backend_act_on_claris_suggestion(
  p_actor_id uuid,
  p_suggestion_id uuid,
  p_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  selected_suggestion public.claris_suggestions%ROWTYPE;
  action_payload jsonb := '{}'::jsonb;
  created_entity_id uuid;
  created_effect text := 'none';
  trigger_key text;
  normalized_tags text[] := ARRAY[]::text[];
  task_title text;
  task_description text;
  task_priority text;
  task_due_date date;
  due_date_text text;
  event_title text;
  event_description text;
  event_type text;
  event_start_at timestamptz;
  event_end_at timestamptz;
  event_start_text text;
  event_end_text text;
  event_all_day boolean := false;
BEGIN
  IF p_actor_id IS NULL OR p_suggestion_id IS NULL OR p_outcome IS NULL
    OR p_outcome NOT IN ('accepted', 'dismissed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_claris_suggestion_command';
  END IF;

  SELECT suggestion.*
  INTO selected_suggestion
  FROM public.claris_suggestions suggestion
  WHERE suggestion.id = p_suggestion_id
    AND suggestion.user_id = p_actor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  IF selected_suggestion.status <> 'pending' THEN
    RETURN jsonb_build_object('result', 'not_actionable');
  END IF;

  IF selected_suggestion.expires_at IS NOT NULL
    AND selected_suggestion.expires_at <= now() THEN
    UPDATE public.claris_suggestions
    SET status = 'expired', acted_at = now()
    WHERE id = selected_suggestion.id;

    RETURN jsonb_build_object('result', 'not_actionable');
  END IF;

  IF jsonb_typeof(selected_suggestion.action_payload) = 'object' THEN
    action_payload := selected_suggestion.action_payload;
  END IF;

  IF p_outcome = 'accepted' THEN
    CASE selected_suggestion.action_type
      WHEN 'create_task' THEN
        task_title := left(coalesce(
          nullif(btrim(CASE
            WHEN jsonb_typeof(action_payload -> 'title') = 'string'
              THEN action_payload ->> 'title'
            ELSE NULL
          END), ''),
          selected_suggestion.title
        ), 240);
        task_description := left(coalesce(
          CASE
            WHEN jsonb_typeof(action_payload -> 'description') = 'string'
              THEN action_payload ->> 'description'
            ELSE NULL
          END,
          selected_suggestion.body
        ), 8000);
        task_priority := CASE
          WHEN action_payload ->> 'priority' IN ('low', 'medium', 'high', 'urgent')
            THEN action_payload ->> 'priority'
          WHEN selected_suggestion.priority IN ('low', 'medium', 'high', 'urgent')
            THEN selected_suggestion.priority
          ELSE 'medium'
        END;

        due_date_text := CASE
          WHEN jsonb_typeof(action_payload -> 'due_date') = 'string'
            THEN nullif(btrim(action_payload ->> 'due_date'), '')
          WHEN jsonb_typeof(action_payload -> 'dueDate') = 'string'
            THEN nullif(btrim(action_payload ->> 'dueDate'), '')
          ELSE NULL
        END;
        IF due_date_text IS NOT NULL THEN
          BEGIN
            task_due_date := due_date_text::timestamptz::date;
          EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('result', 'invalid_action_payload');
          END;
        END IF;

        IF jsonb_typeof(action_payload -> 'tags') = 'array' THEN
          SELECT coalesce(array_agg(tag_value ORDER BY tag_value), ARRAY[]::text[])
          INTO normalized_tags
          FROM (
            SELECT DISTINCT left(btrim(element #>> '{}'), 80) AS tag_value
            FROM jsonb_array_elements(action_payload -> 'tags') element
            WHERE jsonb_typeof(element) = 'string'
              AND btrim(element #>> '{}') <> ''
            LIMIT 20
          ) tags;
        END IF;

        INSERT INTO public.tasks (
          title,
          description,
          status,
          priority,
          assigned_to,
          created_by,
          due_date,
          entity_type,
          entity_id,
          origin_reason,
          suggested_by_ai,
          tags
        ) VALUES (
          task_title,
          task_description,
          'todo',
          task_priority,
          p_actor_id,
          p_actor_id,
          task_due_date,
          selected_suggestion.entity_type,
          selected_suggestion.entity_id,
          left(coalesce(selected_suggestion.reason, selected_suggestion.body), 8000),
          true,
          normalized_tags
        )
        RETURNING id INTO created_entity_id;
        created_effect := 'task_created';

      WHEN 'create_event' THEN
        event_title := left(coalesce(
          nullif(btrim(CASE
            WHEN jsonb_typeof(action_payload -> 'title') = 'string'
              THEN action_payload ->> 'title'
            ELSE NULL
          END), ''),
          selected_suggestion.title
        ), 240);
        event_description := left(coalesce(
          CASE
            WHEN jsonb_typeof(action_payload -> 'description') = 'string'
              THEN action_payload ->> 'description'
            ELSE NULL
          END,
          selected_suggestion.body
        ), 8000);
        event_type := CASE
          WHEN action_payload ->> 'type' IN (
            'manual', 'webclass', 'meeting', 'alignment', 'delivery', 'training', 'other'
          ) THEN action_payload ->> 'type'
          ELSE 'other'
        END;
        event_start_text := CASE
          WHEN jsonb_typeof(action_payload -> 'start_at') = 'string'
            THEN nullif(btrim(action_payload ->> 'start_at'), '')
          WHEN jsonb_typeof(action_payload -> 'startAt') = 'string'
            THEN nullif(btrim(action_payload ->> 'startAt'), '')
          ELSE NULL
        END;
        event_end_text := CASE
          WHEN jsonb_typeof(action_payload -> 'end_at') = 'string'
            THEN nullif(btrim(action_payload ->> 'end_at'), '')
          WHEN jsonb_typeof(action_payload -> 'endAt') = 'string'
            THEN nullif(btrim(action_payload ->> 'endAt'), '')
          ELSE NULL
        END;

        IF event_start_text IS NULL THEN
          RETURN jsonb_build_object('result', 'invalid_action_payload');
        END IF;
        BEGIN
          event_start_at := event_start_text::timestamptz;
          IF event_end_text IS NOT NULL THEN
            event_end_at := event_end_text::timestamptz;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RETURN jsonb_build_object('result', 'invalid_action_payload');
        END;
        IF event_end_at IS NOT NULL AND event_end_at < event_start_at THEN
          RETURN jsonb_build_object('result', 'invalid_action_payload');
        END IF;

        IF jsonb_typeof(action_payload -> 'all_day') = 'boolean' THEN
          event_all_day := (action_payload ->> 'all_day')::boolean;
        ELSIF jsonb_typeof(action_payload -> 'allDay') = 'boolean' THEN
          event_all_day := (action_payload ->> 'allDay')::boolean;
        END IF;

        IF jsonb_typeof(action_payload -> 'tags') = 'array' THEN
          SELECT coalesce(array_agg(tag_value ORDER BY tag_value), ARRAY[]::text[])
          INTO normalized_tags
          FROM (
            SELECT DISTINCT left(btrim(element #>> '{}'), 80) AS tag_value
            FROM jsonb_array_elements(action_payload -> 'tags') element
            WHERE jsonb_typeof(element) = 'string'
              AND btrim(element #>> '{}') <> ''
            LIMIT 20
          ) tags;
        END IF;

        INSERT INTO public.calendar_events (
          title,
          description,
          start_at,
          end_at,
          type,
          owner,
          external_source,
          all_day,
          ia_source,
          related_entity_type,
          related_entity_id,
          tags
        ) VALUES (
          event_title,
          event_description,
          event_start_at,
          event_end_at,
          event_type,
          p_actor_id,
          'manual',
          event_all_day,
          'sugestao_confirmada',
          selected_suggestion.entity_type,
          selected_suggestion.entity_id,
          normalized_tags
        )
        RETURNING id INTO created_entity_id;
        created_effect := 'event_created';

      ELSE
        -- open_chat and suggestions without an action only change lifecycle.
        NULL;
    END CASE;
  END IF;

  UPDATE public.claris_suggestions
  SET status = p_outcome, acted_at = now()
  WHERE id = selected_suggestion.id;

  trigger_key := CASE
    WHEN jsonb_typeof(selected_suggestion.trigger_context) = 'object'
      AND jsonb_typeof(selected_suggestion.trigger_context -> 'trigger_key') = 'string'
      THEN left(nullif(btrim(selected_suggestion.trigger_context ->> 'trigger_key'), ''), 160)
    ELSE NULL
  END;

  IF selected_suggestion.trigger_engine IS NOT NULL AND trigger_key IS NOT NULL THEN
    INSERT INTO public.claris_suggestion_cooldowns (
      user_id,
      trigger_engine,
      trigger_key,
      entity_type,
      entity_id,
      expires_at,
      outcome,
      suggestion_id
    ) VALUES (
      p_actor_id,
      selected_suggestion.trigger_engine,
      trigger_key,
      selected_suggestion.entity_type,
      selected_suggestion.entity_id,
      now() + interval '48 hours',
      p_outcome,
      selected_suggestion.id
    );
  END IF;

  RETURN jsonb_build_object(
    'result', 'succeeded',
    'suggestion_id', selected_suggestion.id,
    'suggestion_status', p_outcome,
    'action_type', selected_suggestion.action_type,
    'effect', created_effect,
    'created_entity_id', created_entity_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.backend_act_on_claris_suggestion(uuid, uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backend_act_on_claris_suggestion(uuid, uuid, text)
TO service_role;

REVOKE ALL ON TABLE
  public.claris_suggestions,
  public.claris_suggestion_cooldowns
FROM anon, authenticated;

GRANT ALL ON TABLE
  public.claris_suggestions,
  public.claris_suggestion_cooldowns
TO service_role;

COMMENT ON FUNCTION public.backend_act_on_claris_suggestion(uuid, uuid, text) IS
  'Service-role-only atomic lifecycle command for actor-scoped Claris suggestions.';
