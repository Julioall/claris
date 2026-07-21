-- Move message templates and bulk-message tracking behind authenticated backend
-- use cases. Scheduled messages and service instances remain temporarily granted
-- because the admin/background-job modules still use their legacy repositories.

CREATE INDEX IF NOT EXISTS message_templates_user_favorite_updated_idx
  ON public.message_templates (user_id, is_favorite DESC, updated_at DESC, id);

CREATE INDEX IF NOT EXISTS bulk_message_jobs_user_created_idx
  ON public.bulk_message_jobs (user_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS bulk_message_recipients_job_name_idx
  ON public.bulk_message_recipients (job_id, student_name, id);

CREATE INDEX IF NOT EXISTS scheduled_messages_user_scheduled_idx
  ON public.scheduled_messages (user_id, scheduled_at, id);

CREATE OR REPLACE FUNCTION public.backend_seed_message_templates(
  p_actor_id uuid,
  p_defaults jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF p_actor_id IS NULL
    OR p_defaults IS NULL
    OR jsonb_typeof(p_defaults) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_message_template_defaults';
  END IF;

  -- Serialize the first read/seed for an actor. This preserves the previous
  -- "seed only when empty" behavior without races between simultaneous tabs.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.message_templates template
    WHERE template.user_id = p_actor_id
  ) THEN
    UPDATE public.users
    SET message_templates_seeded_at = coalesce(message_templates_seeded_at, now())
    WHERE id = p_actor_id;
    RETURN 0;
  END IF;

  INSERT INTO public.message_templates (
    user_id,
    title,
    content,
    category,
    is_default,
    default_key
  )
  SELECT
    p_actor_id,
    btrim(item.title),
    btrim(item.content),
    coalesce(nullif(btrim(item.category), ''), 'geral'),
    true,
    nullif(btrim(item.default_key), '')
  FROM jsonb_to_recordset(p_defaults) AS item(
    title text,
    content text,
    category text,
    default_key text
  )
  WHERE nullif(btrim(item.title), '') IS NOT NULL
    AND nullif(btrim(item.content), '') IS NOT NULL
    AND nullif(btrim(item.default_key), '') IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  UPDATE public.users
  SET message_templates_seeded_at = now()
  WHERE id = p_actor_id;

  RETURN inserted_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.backend_seed_message_templates(uuid, jsonb)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.backend_seed_message_templates(uuid, jsonb)
TO service_role;

REVOKE ALL ON TABLE
  public.message_templates,
  public.bulk_message_jobs,
  public.bulk_message_recipients
FROM anon, authenticated;

GRANT ALL ON TABLE
  public.message_templates,
  public.bulk_message_jobs,
  public.bulk_message_recipients
TO service_role;
