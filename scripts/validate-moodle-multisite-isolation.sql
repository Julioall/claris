BEGIN;

DO $$
DECLARE
  v_user UUID := gen_random_uuid();
  v_fieg_connection UUID := gen_random_uuid();
  v_senai_connection UUID := gen_random_uuid();
  v_fieg_course UUID := gen_random_uuid();
  v_senai_course UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.users (id, full_name, email)
  VALUES (v_user, 'Multi-site integration test', 'multisite@example.invalid');

  INSERT INTO public.user_moodle_connections (
    id, user_id, moodle_site_id, alias, moodle_user_id, status
  ) VALUES
    (
      v_fieg_connection,
      v_user,
      'f7c320d5-1c39-4d69-906d-42289f6b92a4',
      'FIEG test',
      'same-external-user',
      'active'
    ),
    (
      v_senai_connection,
      v_user,
      'b09deea6-fb9f-4318-b2a6-981881512db4',
      'SENAI test',
      'same-external-user',
      'active'
    );

  INSERT INTO public.courses (id, moodle_site_id, moodle_course_id, name)
  VALUES
    (
      v_fieg_course,
      'f7c320d5-1c39-4d69-906d-42289f6b92a4',
      'same-external-course',
      'FIEG synthetic course'
    ),
    (
      v_senai_course,
      'b09deea6-fb9f-4318-b2a6-981881512db4',
      'same-external-course',
      'SENAI synthetic course'
    );

  INSERT INTO public.students (moodle_site_id, moodle_user_id, full_name)
  VALUES
    (
      'f7c320d5-1c39-4d69-906d-42289f6b92a4',
      'same-external-student',
      'FIEG synthetic student'
    ),
    (
      'b09deea6-fb9f-4318-b2a6-981881512db4',
      'same-external-student',
      'SENAI synthetic student'
    );

  INSERT INTO public.user_course_catalog_eligibility (
    user_id, moodle_connection_id, course_id
  ) VALUES
    (v_user, v_fieg_connection, v_fieg_course),
    (v_user, v_senai_connection, v_senai_course);

  INSERT INTO public.user_moodle_sync_preferences (
    user_id, moodle_connection_id, selected_keys
  ) VALUES
    (v_user, v_fieg_connection, '["fieg-only"]'::JSONB),
    (v_user, v_senai_connection, '["senai-only"]'::JSONB);

  IF (
    SELECT count(*)
    FROM public.courses
    WHERE moodle_course_id = 'same-external-course'
  ) <> 2 THEN
    RAISE EXCEPTION 'Courses with equal external IDs crossed site scope';
  END IF;

  IF (
    SELECT count(*)
    FROM public.students
    WHERE moodle_user_id = 'same-external-student'
  ) <> 2 THEN
    RAISE EXCEPTION 'Students with equal external IDs crossed site scope';
  END IF;

  IF (
    SELECT selected_keys
    FROM public.user_moodle_sync_preferences
    WHERE moodle_connection_id = v_fieg_connection
  ) <> '["fieg-only"]'::JSONB THEN
    RAISE EXCEPTION 'FIEG preferences were overwritten by SENAI';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_course_catalog_eligibility eligibility
    JOIN public.courses course_row ON course_row.id = eligibility.course_id
    JOIN public.user_moodle_connections connection_row
      ON connection_row.id = eligibility.moodle_connection_id
    WHERE eligibility.user_id = v_user
      AND course_row.moodle_site_id <> connection_row.moodle_site_id
  ) THEN
    RAISE EXCEPTION 'Catalog eligibility crossed Moodle site scope';
  END IF;

  RAISE NOTICE 'multi-site isolation integration passed';
END $$;

ROLLBACK;
