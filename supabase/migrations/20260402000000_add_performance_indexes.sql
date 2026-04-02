-- Epic 2: Índices críticos ausentes
-- Ref: docs/PERFORMANCE_PLAN.md#epic-2

-- 1. Índice composto (user_id, course_id) em user_courses
--    Âncora de todas as políticas RLS course-scoped.
--    Sem este índice, EXISTS lookups fazem seq scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_courses_user_course
  ON public.user_courses (user_id, course_id);

-- 2. Índice composto em student_courses (course_id, student_id)
--    Policies de students e risk_history usam JOIN duplo via user_courses.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_courses_course_student
  ON public.student_courses (course_id, student_id);

-- 3. Índices em risk_history para JOIN duplo do RLS e ordenação temporal
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_history_student_recorded
  ON public.risk_history (student_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_history_user_recorded
  ON public.risk_history (user_id, created_at DESC);

-- 4. Índice composto parcial em student_activities (course_id, student_id, status)
--    Maior tabela transacional do sync Moodle; filtros compostos do dashboard sem índice.
--    Índice parcial exclui atividades ocultas, reduzindo tamanho e write overhead no sync.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_activities_course_student_status
  ON public.student_activities (course_id, student_id, status)
  WHERE hidden = false;

-- 5. Índice em bulk_message_recipients (job_id, status)
--    Retry filtra por (job_id, status) sem índice, causando seq scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bulk_message_recipients_job_status
  ON public.bulk_message_recipients (job_id, status);

-- 6. Índice temporal em student_sync_snapshots
--    useStudentHistory carrega últimos 60 snapshots sem índice temporal.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_sync_snapshots_student_synced
  ON public.student_sync_snapshots (student_id, synced_at DESC);
