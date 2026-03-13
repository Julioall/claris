-- Reconcile attendance schema after an accidental duplicate migration.
--
-- Goals:
-- 1. Remove permissive duplicate RLS policies introduced later.
-- 2. Ensure user_id FKs point to public.users, matching the rest of the app.
-- 3. Restore indexes and the updated_at trigger if an environment was created
--    from the duplicate attendance DDL alone.

DROP POLICY IF EXISTS "Users manage own attendance settings"
  ON public.attendance_course_settings;

DROP POLICY IF EXISTS "Users manage own attendance records"
  ON public.attendance_records;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.attendance_course_settings'::regclass
      AND conname = 'attendance_course_settings_user_id_fkey'
      AND pg_get_constraintdef(oid) LIKE '%REFERENCES auth.users(id)%'
  ) THEN
    ALTER TABLE public.attendance_course_settings
      DROP CONSTRAINT attendance_course_settings_user_id_fkey;

    ALTER TABLE public.attendance_course_settings
      ADD CONSTRAINT attendance_course_settings_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.attendance_records'::regclass
      AND conname = 'attendance_records_user_id_fkey'
      AND pg_get_constraintdef(oid) LIKE '%REFERENCES auth.users(id)%'
  ) THEN
    ALTER TABLE public.attendance_records
      DROP CONSTRAINT attendance_records_user_id_fkey;

    ALTER TABLE public.attendance_records
      ADD CONSTRAINT attendance_records_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'attendance_course_settings'
      AND policyname = 'attendance_course_settings_select'
  ) THEN
    CREATE POLICY "attendance_course_settings_select"
      ON public.attendance_course_settings
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'attendance_course_settings'
      AND policyname = 'attendance_course_settings_insert'
  ) THEN
    CREATE POLICY "attendance_course_settings_insert"
      ON public.attendance_course_settings
      FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'attendance_course_settings'
      AND policyname = 'attendance_course_settings_delete'
  ) THEN
    CREATE POLICY "attendance_course_settings_delete"
      ON public.attendance_course_settings
      FOR DELETE
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'attendance_records'
      AND policyname = 'attendance_records_select'
  ) THEN
    CREATE POLICY "attendance_records_select"
      ON public.attendance_records
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'attendance_records'
      AND policyname = 'attendance_records_insert'
  ) THEN
    CREATE POLICY "attendance_records_insert"
      ON public.attendance_records
      FOR INSERT
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.attendance_course_settings acs
          WHERE acs.user_id = auth.uid()
            AND acs.course_id = attendance_records.course_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'attendance_records'
      AND policyname = 'attendance_records_update'
  ) THEN
    CREATE POLICY "attendance_records_update"
      ON public.attendance_records
      FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.attendance_course_settings acs
          WHERE acs.user_id = auth.uid()
            AND acs.course_id = attendance_records.course_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'attendance_records'
      AND policyname = 'attendance_records_delete'
  ) THEN
    CREATE POLICY "attendance_records_delete"
      ON public.attendance_records
      FOR DELETE
      USING (user_id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_course_settings_user_id
  ON public.attendance_course_settings(user_id);

CREATE INDEX IF NOT EXISTS idx_attendance_course_settings_course_id
  ON public.attendance_course_settings(course_id);

CREATE INDEX IF NOT EXISTS idx_attendance_records_user_course_date
  ON public.attendance_records(user_id, course_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_attendance_records_student_id
  ON public.attendance_records(student_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_attendance_records_updated_at'
      AND tgrelid = 'public.attendance_records'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER update_attendance_records_updated_at
      BEFORE UPDATE ON public.attendance_records
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;