-- Student Sync Snapshots
-- Records the state of each student at every Moodle synchronisation.
-- This allows tutors and the Claris IA to track evolution over time and
-- evaluate whether interventions are having an effect.

CREATE TABLE IF NOT EXISTS public.student_sync_snapshots (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           uuid NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  course_id            uuid NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  synced_at            timestamptz NOT NULL DEFAULT now(),
  risk_level           text NOT NULL DEFAULT 'normal' CHECK (risk_level IN ('normal', 'atencao', 'risco', 'critico')),
  enrollment_status    text NOT NULL DEFAULT 'ativo',
  last_access          timestamptz,
  days_since_access    integer,
  pending_activities   integer NOT NULL DEFAULT 0,
  overdue_activities   integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate snapshots for the same student+course within the same
-- calendar day (one snapshot per sync session is enough).
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_sync_snapshot_day
  ON public.student_sync_snapshots (student_id, course_id, (synced_at::date));

CREATE INDEX IF NOT EXISTS idx_student_sync_snapshots_student
  ON public.student_sync_snapshots (student_id, synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_sync_snapshots_course
  ON public.student_sync_snapshots (course_id, synced_at DESC);

-- -----------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------
ALTER TABLE public.student_sync_snapshots ENABLE ROW LEVEL SECURITY;

-- Tutors may read snapshots for students in courses they are linked to.
CREATE POLICY "snapshots_select"
  ON public.student_sync_snapshots
  FOR SELECT
  USING (
    course_id IN (
      SELECT course_id FROM public.user_courses WHERE user_id = auth.uid()
    )
  );

-- Only the service role (Edge Functions) may insert snapshots.
CREATE POLICY "snapshots_insert_service"
  ON public.student_sync_snapshots
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
