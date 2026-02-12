CREATE TABLE public.attendance_course_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_course_settings_user_course_key UNIQUE (user_id, course_id)
);

CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('presente', 'ausente', 'justificado')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_records_user_course_student_date_key UNIQUE (user_id, course_id, student_id, attendance_date)
);

ALTER TABLE public.attendance_course_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_course_settings_select"
  ON public.attendance_course_settings
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "attendance_course_settings_insert"
  ON public.attendance_course_settings
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "attendance_course_settings_delete"
  ON public.attendance_course_settings
  FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "attendance_records_select"
  ON public.attendance_records
  FOR SELECT
  USING (user_id = auth.uid());

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

CREATE POLICY "attendance_records_delete"
  ON public.attendance_records
  FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX idx_attendance_course_settings_user_id
  ON public.attendance_course_settings(user_id);

CREATE INDEX idx_attendance_course_settings_course_id
  ON public.attendance_course_settings(course_id);

CREATE INDEX idx_attendance_records_user_course_date
  ON public.attendance_records(user_id, course_id, attendance_date);

CREATE INDEX idx_attendance_records_student_id
  ON public.attendance_records(student_id);

CREATE TRIGGER update_attendance_records_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
