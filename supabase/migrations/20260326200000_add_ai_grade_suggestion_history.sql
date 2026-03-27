CREATE TABLE IF NOT EXISTS public.ai_grade_suggestion_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_activity_id UUID REFERENCES public.student_activities(id) ON DELETE SET NULL,
  moodle_activity_id TEXT NOT NULL,
  moodle_assign_id BIGINT,
  status TEXT NOT NULL DEFAULT 'processing',
  confidence TEXT,
  suggested_grade NUMERIC,
  suggested_feedback TEXT,
  approved_grade NUMERIC,
  approved_feedback TEXT,
  max_grade NUMERIC,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  context_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  submission_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider TEXT,
  model TEXT,
  error_message TEXT,
  approval_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_grade_suggestion_history_status_check CHECK (
    status IN (
      'processing',
      'success',
      'invalid',
      'manual_review_required',
      'error',
      'approved',
      'approval_error'
    )
  ),
  CONSTRAINT ai_grade_suggestion_history_confidence_check CHECK (
    confidence IS NULL OR confidence IN ('high', 'medium', 'low')
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_grade_suggestion_history_user_created
  ON public.ai_grade_suggestion_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_grade_suggestion_history_student_activity
  ON public.ai_grade_suggestion_history(student_id, course_id, moodle_activity_id, created_at DESC);

ALTER TABLE public.ai_grade_suggestion_history ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_ai_grade_suggestion_history_updated_at ON public.ai_grade_suggestion_history;
CREATE TRIGGER update_ai_grade_suggestion_history_updated_at
  BEFORE UPDATE ON public.ai_grade_suggestion_history
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "ai_grade_suggestion_history_select_own"
ON public.ai_grade_suggestion_history
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "ai_grade_suggestion_history_insert_own"
ON public.ai_grade_suggestion_history
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "ai_grade_suggestion_history_update_own"
ON public.ai_grade_suggestion_history
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.ai_grade_suggestion_history TO authenticated;

COMMENT ON TABLE public.ai_grade_suggestion_history IS
  'Auditoria das sugestões de feedback e nota geradas por IA antes do lançamento manual no Moodle.';
