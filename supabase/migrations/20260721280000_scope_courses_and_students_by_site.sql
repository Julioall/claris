-- 20260721280000_scope_courses_and_students_by_site.sql

-- Greenfield migration: existing development data must be reset/reseeded, never
-- silently attributed to FIEG.
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS moodle_site_id UUID REFERENCES public.moodle_sites(id) ON DELETE RESTRICT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS moodle_site_id UUID REFERENCES public.moodle_sites(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.courses WHERE moodle_site_id IS NULL)
    OR EXISTS (SELECT 1 FROM public.students WHERE moodle_site_id IS NULL) THEN
    RAISE EXCEPTION 'Greenfield Moodle schema requires an empty/reseeded development database';
  END IF;
END;
$$;

ALTER TABLE public.courses ALTER COLUMN moodle_site_id SET NOT NULL;
ALTER TABLE public.students ALTER COLUMN moodle_site_id SET NOT NULL;

-- Replace prototype global identifiers with site-scoped identities.
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_moodle_course_id_key;
ALTER TABLE public.courses ADD CONSTRAINT courses_moodle_site_id_moodle_course_id_key UNIQUE (moodle_site_id, moodle_course_id);

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_moodle_user_id_key;
ALTER TABLE public.students ADD CONSTRAINT students_moodle_site_id_moodle_user_id_key UNIQUE (moodle_site_id, moodle_user_id);
