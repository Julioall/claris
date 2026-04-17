-- Performance and indicator quality improvements for the management panel.
--
-- 1. get_uc_workload_kpis: server-side workload KPI computation (replaces
--    client-side paginated data load). Supports optional exclusion of
--    suspended students from performance indicators.
--
-- 2. get_uc_dropout_kpis: server-side dropout/evasion KPI computation
--    (replaces client-side paginated data load). Supports optional exclusion
--    of suspended students from all counts.
--
-- 3. Fix roleBreakdown inside get_uc_enrollments_dashboard to count distinct
--    people per role instead of rows.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper macro: inline diacritic-insensitive normalisation
-- ─────────────────────────────────────────────────────────────────────────────
-- Used as: translate(lower(trim(COALESCE(col,''))),
--                    'áàãâäéèêëíìîïóòõôöúùûüç',
--                    'aaaaaeeeeiiiiooooouuuuc')

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Workload KPI RPC
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.get_uc_workload_kpis(
  p_start_date        DATE    DEFAULT NULL,
  p_end_date          DATE    DEFAULT NULL,
  p_tutor             TEXT    DEFAULT NULL,
  p_school            TEXT    DEFAULT NULL,
  p_category          TEXT    DEFAULT NULL,
  p_status_uc         TEXT    DEFAULT NULL,
  p_exclude_suspended BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH
-- ── All relevant rows with computed columns ───────────────────────────────
all_rows AS (
  SELECT
    e.id_uc,
    e.nome_uc,
    e.nome_pessoa,
    e.papel,
    COALESCE(NULLIF(BTRIM(e.categoria), ''), 'Sem categoria')    AS categoria,
    e.status_uc,
    translate(lower(trim(COALESCE(e.status_uc, ''))),
              'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')   AS norm_status,
    e.nota_final_num,
    e.nunca_acessou_uc,
    COALESCE(e.matriculado_em_at, e.inicio_uc_at)                AS reference_date,
    CASE
      WHEN array_length(path_parts, 1) >= 2
        THEN translate(lower(trim(COALESCE(path_parts[2], ''))),
                       'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
      ELSE NULL
    END                                                          AS school_norm
  FROM public.uc_enrollments e
  CROSS JOIN LATERAL (
    SELECT regexp_split_to_array(COALESCE(e.caminho_curso, ''), '\s*/\s*') AS path_parts
  ) AS pd
  WHERE e.papel IN ('Aluno', 'Monitor', 'Tutor')
),

-- ── Actor (tutor / monitor) → UC mapping ─────────────────────────────────
actor_uc AS (
  SELECT
    id_uc,
    nome_pessoa AS actor_name,
    papel       AS actor_role,
    translate(lower(trim(COALESCE(nome_pessoa, ''))),
              'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') AS actor_norm
  FROM all_rows
  WHERE papel IN ('Tutor', 'Monitor')
),

-- ── UC-level metadata (categoria + school) ───────────────────────────────
-- Uses DISTINCT ON to pick one representative row per UC.
uc_meta AS (
  SELECT DISTINCT ON (id_uc)
    id_uc,
    categoria,
    school_norm,
    translate(lower(trim(COALESCE(categoria, ''))),
              'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') AS categoria_norm
  FROM all_rows
  ORDER BY id_uc
),

-- ── UCs that pass all filter criteria ────────────────────────────────────
qualified_uc_ids AS (
  SELECT um.id_uc
  FROM uc_meta um
  WHERE (p_school IS NULL
      OR um.school_norm = translate(lower(trim(COALESCE(p_school, ''))),
                                    'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'))
    AND (p_category IS NULL
      OR um.categoria_norm = translate(lower(trim(COALESCE(p_category, ''))),
                                       'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'))
    -- Tutor filter: the UC must have the specified person as tutor or monitor
    AND (p_tutor IS NULL
      OR EXISTS (
        SELECT 1 FROM actor_uc a
        WHERE a.id_uc = um.id_uc
          AND a.actor_norm = translate(lower(trim(COALESCE(p_tutor, ''))),
                                       'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
      ))
),

-- ── Student rows in qualified UCs (with date / status filters) ───────────
student_rows AS (
  SELECT
    ar.id_uc,
    ar.nome_pessoa,
    ar.norm_status,
    ar.nota_final_num,
    ar.nunca_acessou_uc
  FROM all_rows ar
  INNER JOIN qualified_uc_ids qu ON qu.id_uc = ar.id_uc
  WHERE ar.papel = 'Aluno'
    AND (p_start_date IS NULL OR ar.reference_date >= p_start_date)
    AND (p_end_date   IS NULL OR ar.reference_date <= p_end_date)
    AND (p_status_uc  IS NULL
      OR ar.norm_status = translate(lower(trim(COALESCE(p_status_uc, ''))),
                                    'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'))
    AND NOT (p_exclude_suspended AND ar.norm_status = 'suspenso')
),

-- ── Join students to their actors for per-actor aggregation ──────────────
student_actor AS (
  SELECT
    sr.id_uc,
    sr.nome_pessoa      AS student_name,
    sr.norm_status,
    sr.nota_final_num,
    sr.nunca_acessou_uc,
    au.actor_name,
    au.actor_role,
    um.categoria
  FROM student_rows sr
  JOIN actor_uc au ON au.id_uc = sr.id_uc
  JOIN uc_meta  um ON um.id_uc = sr.id_uc
),

-- ── Per-actor aggregate metrics ───────────────────────────────────────────
actor_metrics AS (
  SELECT
    actor_name,
    actor_role,
    COUNT(DISTINCT id_uc)::int                                                  AS total_ucs,
    COUNT(*)::int                                                               AS total_students,
    ROUND(AVG(nota_final_num)::numeric, 2)                                      AS avg_grade,
    ROUND(
      100.0 * SUM(CASE WHEN NOT nunca_acessou_uc THEN 1 ELSE 0 END)
      / NULLIF(COUNT(*), 0), 1)                                                 AS access_rate,
    ROUND(
      100.0 * SUM(CASE WHEN nunca_acessou_uc THEN 1 ELSE 0 END)
      / NULLIF(COUNT(*), 0), 1)                                                 AS never_access_rate,
    ROUND(
      100.0 * SUM(CASE WHEN norm_status = 'ativo' THEN 1 ELSE 0 END)
      / NULLIF(COUNT(*), 0), 1)                                                 AS active_rate,
    ROUND(
      100.0 * SUM(CASE WHEN nota_final_num >= 60 THEN 1 ELSE 0 END)
      / NULLIF(SUM(CASE WHEN nota_final_num IS NOT NULL THEN 1 ELSE 0 END), 0),
      1)                                                                         AS completion_rate
  FROM student_actor
  GROUP BY actor_name, actor_role
),

-- ── Per-category metrics (tutors) ─────────────────────────────────────────
tutor_cat AS (
  SELECT
    categoria,
    COUNT(DISTINCT id_uc)::int                                                  AS uc_count,
    COUNT(DISTINCT actor_name)::int                                             AS actor_count,
    COUNT(*)::int                                                               AS student_count,
    ROUND(AVG(nota_final_num)::numeric, 2)                                      AS avg_grade,
    ROUND(
      100.0 * SUM(CASE WHEN NOT nunca_acessou_uc THEN 1 ELSE 0 END)
      / NULLIF(COUNT(*), 0), 1)                                                 AS access_rate,
    ROUND(
      100.0 * SUM(CASE WHEN nota_final_num >= 60 THEN 1 ELSE 0 END)
      / NULLIF(SUM(CASE WHEN nota_final_num IS NOT NULL THEN 1 ELSE 0 END), 0),
      1)                                                                         AS completion_rate
  FROM student_actor
  WHERE actor_role = 'Tutor'
  GROUP BY categoria
),

-- ── Per-category metrics (monitors) ──────────────────────────────────────
monitor_cat AS (
  SELECT
    categoria,
    COUNT(DISTINCT id_uc)::int                                                  AS uc_count,
    COUNT(DISTINCT actor_name)::int                                             AS actor_count,
    COUNT(*)::int                                                               AS student_count,
    ROUND(AVG(nota_final_num)::numeric, 2)                                      AS avg_grade,
    ROUND(
      100.0 * SUM(CASE WHEN NOT nunca_acessou_uc THEN 1 ELSE 0 END)
      / NULLIF(COUNT(*), 0), 1)                                                 AS access_rate,
    ROUND(
      100.0 * SUM(CASE WHEN nota_final_num >= 60 THEN 1 ELSE 0 END)
      / NULLIF(SUM(CASE WHEN nota_final_num IS NOT NULL THEN 1 ELSE 0 END), 0),
      1)                                                                         AS completion_rate
  FROM student_actor
  WHERE actor_role = 'Monitor'
  GROUP BY categoria
)

SELECT jsonb_build_object(
  -- Per-tutor rows
  'tutors', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'tutorName',       actor_name,
      'totalUcs',        total_ucs,
      'totalStudents',   total_students,
      'averageGrade',    avg_grade,
      'accessRate',      COALESCE(access_rate, 0),
      'neverAccessRate', COALESCE(never_access_rate, 0),
      'activeRate',      COALESCE(active_rate, 0),
      'completionRate',  COALESCE(completion_rate, 0)
    ) ORDER BY total_students DESC, actor_name)
    FROM actor_metrics WHERE actor_role = 'Tutor'
  ), '[]'::jsonb),

  -- Per-monitor rows
  'monitors', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'tutorName',       actor_name,
      'totalUcs',        total_ucs,
      'totalStudents',   total_students,
      'averageGrade',    avg_grade,
      'accessRate',      COALESCE(access_rate, 0),
      'neverAccessRate', COALESCE(never_access_rate, 0),
      'activeRate',      COALESCE(active_rate, 0),
      'completionRate',  COALESCE(completion_rate, 0)
    ) ORDER BY total_students DESC, actor_name)
    FROM actor_metrics WHERE actor_role = 'Monitor'
  ), '[]'::jsonb),

  -- Category breakdown for tutors
  'categoryBreakdown', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'category',       categoria,
      'ucCount',        uc_count,
      'tutorCount',     actor_count,
      'studentCount',   student_count,
      'completionRate', COALESCE(completion_rate, 0),
      'accessRate',     COALESCE(access_rate, 0),
      'averageGrade',   avg_grade
    ) ORDER BY student_count DESC, categoria)
    FROM tutor_cat
  ), '[]'::jsonb),

  -- Category breakdown for monitors
  'monitorCategoryBreakdown', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'category',       categoria,
      'ucCount',        uc_count,
      'tutorCount',     actor_count,
      'studentCount',   student_count,
      'completionRate', COALESCE(completion_rate, 0),
      'accessRate',     COALESCE(access_rate, 0),
      'averageGrade',   avg_grade
    ) ORDER BY student_count DESC, categoria)
    FROM monitor_cat
  ), '[]'::jsonb),

  -- Global totals
  'totalUcs',            (SELECT COUNT(DISTINCT id_uc)::int   FROM student_rows),
  'totalStudents',       (SELECT COUNT(DISTINCT nome_pessoa)::int FROM student_rows),
  'totalTutors',         (SELECT COUNT(DISTINCT actor_name)::int  FROM actor_metrics WHERE actor_role = 'Tutor'),
  'totalMonitors',       (SELECT COUNT(DISTINCT actor_name)::int  FROM actor_metrics WHERE actor_role = 'Monitor'),
  'totalTutorUcs',       (SELECT COUNT(DISTINCT id_uc)::int   FROM student_actor WHERE actor_role = 'Tutor'),
  'totalMonitorUcs',     (SELECT COUNT(DISTINCT id_uc)::int   FROM student_actor WHERE actor_role = 'Monitor'),
  'totalTutorStudents',  (SELECT COUNT(DISTINCT student_name)::int FROM student_actor WHERE actor_role = 'Tutor'),
  'totalMonitorStudents',(SELECT COUNT(DISTINCT student_name)::int FROM student_actor WHERE actor_role = 'Monitor')
);
$$;

GRANT EXECUTE ON FUNCTION public.get_uc_workload_kpis(DATE, DATE, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Dropout / Evasion KPI RPC
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.get_uc_dropout_kpis(
  p_start_date        DATE    DEFAULT NULL,
  p_end_date          DATE    DEFAULT NULL,
  p_tutor             TEXT    DEFAULT NULL,
  p_school            TEXT    DEFAULT NULL,
  p_category          TEXT    DEFAULT NULL,
  p_status_uc         TEXT    DEFAULT NULL,
  p_exclude_suspended BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH
-- ── All rows ──────────────────────────────────────────────────────────────
all_rows AS (
  SELECT
    e.id_uc,
    e.nome_uc,
    e.nome_pessoa,
    e.papel,
    COALESCE(NULLIF(BTRIM(e.categoria), ''), 'Sem categoria')    AS categoria,
    e.status_uc,
    translate(lower(trim(COALESCE(e.status_uc, ''))),
              'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')   AS norm_status,
    e.nunca_acessou_uc,
    COALESCE(e.matriculado_em_at, e.inicio_uc_at)                AS reference_date,
    e.matriculado_em_at,
    e.termino_uc_at,
    e.ultimo_acesso_uc_at,
    CASE
      WHEN array_length(path_parts, 1) >= 2
        THEN translate(lower(trim(COALESCE(path_parts[2], ''))),
                       'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
      ELSE NULL
    END                                                          AS school_norm,
    CASE
      WHEN array_length(path_parts, 1) >= 2
        THEN BTRIM(path_parts[2])
      ELSE 'Sem escola'
    END                                                          AS school_name
  FROM public.uc_enrollments e
  CROSS JOIN LATERAL (
    SELECT regexp_split_to_array(COALESCE(e.caminho_curso, ''), '\s*/\s*') AS path_parts
  ) AS pd
  WHERE e.papel IN ('Aluno', 'Monitor', 'Tutor')
),

-- ── Actor → UC mapping ────────────────────────────────────────────────────
actor_uc AS (
  SELECT
    id_uc,
    nome_pessoa AS actor_name,
    papel       AS actor_role,
    translate(lower(trim(COALESCE(nome_pessoa, ''))),
              'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') AS actor_norm
  FROM all_rows
  WHERE papel IN ('Tutor', 'Monitor')
),

-- ── UC metadata ───────────────────────────────────────────────────────────
uc_meta AS (
  SELECT DISTINCT ON (id_uc)
    id_uc,
    categoria,
    school_norm,
    school_name,
    translate(lower(trim(COALESCE(categoria, ''))),
              'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') AS categoria_norm
  FROM all_rows
  ORDER BY id_uc
),

-- ── Qualified UCs ─────────────────────────────────────────────────────────
qualified_uc_ids AS (
  SELECT um.id_uc
  FROM uc_meta um
  WHERE (p_school IS NULL
      OR um.school_norm = translate(lower(trim(COALESCE(p_school, ''))),
                                    'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'))
    AND (p_category IS NULL
      OR um.categoria_norm = translate(lower(trim(COALESCE(p_category, ''))),
                                       'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'))
    AND (p_tutor IS NULL
      OR EXISTS (
        SELECT 1 FROM actor_uc a
        WHERE a.id_uc = um.id_uc
          AND a.actor_norm = translate(lower(trim(COALESCE(p_tutor, ''))),
                                       'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
      ))
),

-- ── Student rows ──────────────────────────────────────────────────────────
student_rows AS (
  SELECT
    ar.id_uc,
    ar.nome_uc,
    ar.nome_pessoa,
    ar.norm_status,
    ar.nunca_acessou_uc,
    ar.matriculado_em_at,
    ar.termino_uc_at,
    ar.ultimo_acesso_uc_at
  FROM all_rows ar
  INNER JOIN qualified_uc_ids qu ON qu.id_uc = ar.id_uc
  WHERE ar.papel = 'Aluno'
    AND (p_start_date IS NULL OR ar.reference_date >= p_start_date)
    AND (p_end_date   IS NULL OR ar.reference_date <= p_end_date)
    AND (p_status_uc  IS NULL
      OR ar.norm_status = translate(lower(trim(COALESCE(p_status_uc, ''))),
                                    'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'))
    AND NOT (p_exclude_suspended AND ar.norm_status = 'suspenso')
),

-- ── Per-UC dropout ────────────────────────────────────────────────────────
uc_dropout AS (
  SELECT
    sr.id_uc,
    COALESCE(MAX(sr.nome_uc), sr.id_uc)                                                   AS uc_name,
    COUNT(*)::int                                                                          AS total_students,
    SUM(CASE WHEN sr.norm_status = 'ativo'       THEN 1 ELSE 0 END)::int                 AS active_count,
    SUM(CASE WHEN sr.norm_status IN (
      'nao atualmente', 'nao_atualmente', 'inativo', 'evadido', 'desistiu')
      OR (NOT p_exclude_suspended AND sr.norm_status = 'suspenso')
    THEN 1 ELSE 0 END)::int                                                               AS evaded_count,
    SUM(CASE WHEN sr.nunca_acessou_uc THEN 1 ELSE 0 END)::int                            AS never_accessed_count
  FROM student_rows sr
  GROUP BY sr.id_uc
),

-- ── Join students to actors ───────────────────────────────────────────────
student_actor AS (
  SELECT
    sr.id_uc,
    sr.nome_pessoa,
    sr.norm_status,
    sr.nunca_acessou_uc,
    sr.matriculado_em_at,
    sr.termino_uc_at,
    sr.ultimo_acesso_uc_at,
    au.actor_name,
    au.actor_role,
    um.categoria,
    um.school_name
  FROM student_rows sr
  JOIN actor_uc au ON au.id_uc = sr.id_uc
  JOIN uc_meta  um ON um.id_uc = sr.id_uc
),

-- ── Per-actor dropout ─────────────────────────────────────────────────────
actor_dropout AS (
  SELECT
    actor_name,
    actor_role,
    COUNT(*)::int                                                                          AS total_students,
    SUM(CASE WHEN norm_status = 'ativo' THEN 1 ELSE 0 END)::int                          AS active_count,
    SUM(CASE WHEN norm_status IN (
      'nao atualmente', 'nao_atualmente', 'inativo', 'evadido', 'desistiu')
      OR (NOT p_exclude_suspended AND norm_status = 'suspenso')
    THEN 1 ELSE 0 END)::int                                                               AS evaded_count,
    ROUND(
      AVG(
        CASE
          WHEN norm_status IN (
            'nao atualmente', 'nao_atualmente', 'inativo', 'evadido', 'desistiu')
            OR (NOT p_exclude_suspended AND norm_status = 'suspenso')
          THEN EXTRACT(epoch FROM (ultimo_acesso_uc_at - matriculado_em_at)) / 86400.0
          ELSE NULL
        END
      )
    )::int                                                                                 AS avg_days_to_dropout
  FROM student_actor
  GROUP BY actor_name, actor_role
),

-- ── Per-category dropout ──────────────────────────────────────────────────
category_dropout AS (
  SELECT
    categoria,
    COUNT(DISTINCT sr.id_uc)::int                                                         AS uc_count,
    COUNT(*)::int                                                                          AS total_students,
    SUM(CASE WHEN norm_status = 'ativo' THEN 1 ELSE 0 END)::int                          AS active_count,
    SUM(CASE WHEN norm_status IN (
      'nao atualmente', 'nao_atualmente', 'inativo', 'evadido', 'desistiu')
      OR (NOT p_exclude_suspended AND norm_status = 'suspenso')
    THEN 1 ELSE 0 END)::int                                                               AS evaded_count,
    SUM(CASE WHEN NOT nunca_acessou_uc THEN 1 ELSE 0 END)::int                           AS accessed_count,
    ROUND(
      AVG(EXTRACT(epoch FROM (termino_uc_at - matriculado_em_at)) / 86400.0)
    )::int                                                                                 AS avg_days_in_course
  FROM student_actor sa
  INNER JOIN student_rows sr ON sr.id_uc = sa.id_uc AND sr.nome_pessoa = sa.nome_pessoa
  GROUP BY categoria
),

-- ── Per-school retention ──────────────────────────────────────────────────
school_retention AS (
  SELECT
    school_name,
    COUNT(*)::int                                                                          AS total_students,
    SUM(CASE WHEN norm_status = 'ativo' THEN 1 ELSE 0 END)::int                          AS active_count,
    SUM(CASE WHEN norm_status IN (
      'nao atualmente', 'nao_atualmente', 'inativo', 'evadido', 'desistiu')
      OR (NOT p_exclude_suspended AND norm_status = 'suspenso')
    THEN 1 ELSE 0 END)::int                                                               AS evaded_count
  FROM student_actor
  GROUP BY school_name
),

-- ── Global stats ──────────────────────────────────────────────────────────
global_stats AS (
  SELECT
    COUNT(DISTINCT nome_pessoa)::int                                                       AS total_students,
    SUM(CASE WHEN norm_status = 'ativo' THEN 1 ELSE 0 END)::int                          AS active_count,
    SUM(CASE WHEN norm_status IN (
      'nao atualmente', 'nao_atualmente', 'inativo', 'evadido', 'desistiu')
      OR (NOT p_exclude_suspended AND norm_status = 'suspenso')
    THEN 1 ELSE 0 END)::int                                                               AS evaded_count,
    COUNT(*)::int                                                                          AS total_rows,
    ROUND(
      AVG(
        CASE
          WHEN norm_status IN (
            'nao atualmente', 'nao_atualmente', 'inativo', 'evadido', 'desistiu')
            OR (NOT p_exclude_suspended AND norm_status = 'suspenso')
          THEN EXTRACT(epoch FROM (ultimo_acesso_uc_at - matriculado_em_at)) / 86400.0
          ELSE NULL
        END
      )
    )::int                                                                                 AS avg_days_to_dropout,
    ROUND(
      AVG(EXTRACT(epoch FROM (termino_uc_at - matriculado_em_at)) / 86400.0)
    )::int                                                                                 AS avg_days_in_course
  FROM student_rows
)

SELECT jsonb_build_object(
  'global', (
    SELECT jsonb_build_object(
      'totalStudents',    total_students,
      'activeCount',      active_count,
      'evadedCount',      evaded_count,
      'activeRate',       ROUND(100.0 * active_count / NULLIF(total_rows, 0), 1),
      'dropoutRate',      ROUND(100.0 * evaded_count / NULLIF(total_rows, 0), 1),
      'avgDaysToDropout', avg_days_to_dropout,
      'avgDaysInCourse',  avg_days_in_course
    )
    FROM global_stats
  ),

  'topUcsByDropout', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'ucId',              id_uc,
      'ucName',            uc_name,
      'totalStudents',     total_students,
      'activeCount',       active_count,
      'evadedCount',       evaded_count,
      'dropoutRate',       ROUND(100.0 * evaded_count / NULLIF(total_students, 0), 1),
      'neverAccessedCount', never_accessed_count,
      'neverAccessRate',   ROUND(100.0 * never_accessed_count / NULLIF(total_students, 0), 1)
    ) ORDER BY (100.0 * evaded_count / NULLIF(total_students, 0)) DESC, uc_name)
    FROM (
      SELECT * FROM uc_dropout
      WHERE total_students > 0
      ORDER BY (100.0 * evaded_count / NULLIF(total_students, 0)) DESC
      LIMIT 25
    ) top_ucs
  ), '[]'::jsonb),

  'tutorDropout', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'tutorName',        actor_name,
      'totalStudents',    total_students,
      'activeCount',      active_count,
      'evadedCount',      evaded_count,
      'dropoutRate',      ROUND(100.0 * evaded_count / NULLIF(total_students, 0), 1),
      'activeRate',       ROUND(100.0 * active_count / NULLIF(total_students, 0), 1),
      'avgDaysToDropout', avg_days_to_dropout
    ) ORDER BY (100.0 * evaded_count / NULLIF(total_students, 0)) DESC, actor_name)
    FROM actor_dropout
    WHERE actor_role = 'Tutor' AND total_students > 0
  ), '[]'::jsonb),

  'monitorDropout', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'tutorName',        actor_name,
      'totalStudents',    total_students,
      'activeCount',      active_count,
      'evadedCount',      evaded_count,
      'dropoutRate',      ROUND(100.0 * evaded_count / NULLIF(total_students, 0), 1),
      'activeRate',       ROUND(100.0 * active_count / NULLIF(total_students, 0), 1),
      'avgDaysToDropout', avg_days_to_dropout
    ) ORDER BY (100.0 * evaded_count / NULLIF(total_students, 0)) DESC, actor_name)
    FROM actor_dropout
    WHERE actor_role = 'Monitor' AND total_students > 0
  ), '[]'::jsonb),

  'categoryDropout', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'category',        categoria,
      'ucCount',         uc_count,
      'totalStudents',   total_students,
      'activeCount',     active_count,
      'evadedCount',     evaded_count,
      'dropoutRate',     ROUND(100.0 * evaded_count / NULLIF(total_students, 0), 1),
      'activeRate',      ROUND(100.0 * active_count  / NULLIF(total_students, 0), 1),
      'accessRate',      ROUND(100.0 * accessed_count / NULLIF(total_students, 0), 1),
      'avgDaysInCourse', avg_days_in_course
    ) ORDER BY total_students DESC, categoria)
    FROM category_dropout
  ), '[]'::jsonb),

  'schoolRetention', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'school',          school_name,
      'totalStudents',   total_students,
      'activeCount',     active_count,
      'evadedCount',     evaded_count,
      'retentionRate',   ROUND(100.0 * active_count  / NULLIF(total_students, 0), 1),
      'dropoutRate',     ROUND(100.0 * evaded_count  / NULLIF(total_students, 0), 1)
    ) ORDER BY total_students DESC, school_name)
    FROM (
      SELECT * FROM school_retention
      WHERE total_students > 0
      ORDER BY total_students DESC
      LIMIT 30
    ) top_schools
  ), '[]'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_uc_dropout_kpis(DATE, DATE, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fix roleBreakdown in get_uc_enrollments_dashboard
--    Count distinct people per role instead of rows.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.get_uc_enrollments_dashboard(
  p_start_date DATE DEFAULT NULL,
  p_end_date   DATE DEFAULT NULL,
  p_tutor      TEXT DEFAULT NULL,
  p_school     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH tutor_map AS (
  SELECT
    e.id_uc,
    array_agg(DISTINCT e.nome_pessoa ORDER BY e.nome_pessoa) AS tutor_names
  FROM public.uc_enrollments e
  WHERE e.papel = 'Tutor'
  GROUP BY e.id_uc
),
monitor_map AS (
  SELECT
    e.id_uc,
    array_agg(DISTINCT e.nome_pessoa ORDER BY e.nome_pessoa) AS monitor_names
  FROM public.uc_enrollments e
  WHERE e.papel = 'Monitor'
  GROUP BY e.id_uc
),
enriched AS (
  SELECT
    e.id,
    e.nome_pessoa,
    e.papel,
    e.id_uc,
    e.nome_uc,
    e.caminho_curso,
    e.nota_final_num,
    e.nunca_acessou_uc,
    e.ultimo_acesso_uc_at,
    e.status_uc,
    COALESCE(e.matriculado_em_at, e.inicio_uc_at) AS reference_date,
    COALESCE(NULLIF(BTRIM(e.cpf), ''), LOWER(NULLIF(BTRIM(e.email), '')), 'row:' || e.id::text) AS person_key,
    CASE
      WHEN array_length(path_data.path_parts, 1) >= 2 THEN BTRIM(path_data.path_parts[2])
      ELSE NULL
    END AS school_name,
    CASE
      WHEN array_length(path_data.path_parts, 1) >= 3 THEN BTRIM(path_data.path_parts[3])
      ELSE NULL
    END AS course_name,
    CASE
      WHEN array_length(path_data.path_parts, 1) >= 4
        THEN BTRIM(path_data.path_parts[array_length(path_data.path_parts, 1)])
      ELSE NULL
    END AS offering_name,
    tutor_map.tutor_names,
    monitor_map.monitor_names,
    CASE
      WHEN translate(lower(trim(COALESCE(e.status_uc, ''))), 'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
        IN ('ativo', 'active') THEN 'Ativo'
      WHEN translate(lower(trim(COALESCE(e.status_uc, ''))), 'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
        IN ('suspenso', 'suspended') THEN 'Suspenso'
      WHEN translate(lower(trim(COALESCE(e.status_uc, ''))), 'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
        IN ('concluido', 'completed') THEN 'Concluido'
      WHEN translate(lower(trim(COALESCE(e.status_uc, ''))), 'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
        IN ('nao atualmente', 'nao_atualmente', 'not current', 'not_current', 'notcurrently', 'inativo', 'inactive')
        THEN 'Nao atualmente'
      ELSE COALESCE(NULLIF(BTRIM(e.status_uc), ''), 'Desconhecido')
    END AS normalized_status
  FROM public.uc_enrollments e
  LEFT JOIN tutor_map
    ON tutor_map.id_uc = e.id_uc
  LEFT JOIN monitor_map
    ON monitor_map.id_uc = e.id_uc
  CROSS JOIN LATERAL (
    SELECT regexp_split_to_array(COALESCE(e.caminho_curso, ''), '\s*/\s*') AS path_parts
  ) AS path_data
  WHERE e.papel IN ('Aluno', 'Monitor', 'Tutor')
),
filtered AS (
  SELECT *
  FROM enriched
  WHERE (p_start_date IS NULL OR reference_date >= p_start_date)
    AND (p_end_date IS NULL OR reference_date <= p_end_date)
    AND (p_school IS NULL OR school_name = p_school)
    AND (
      p_tutor IS NULL
      OR COALESCE(tutor_names, '{}'::text[]) @> ARRAY[p_tutor]
      OR COALESCE(monitor_names, '{}'::text[]) @> ARRAY[p_tutor]
      OR (papel = 'Tutor' AND nome_pessoa = p_tutor)
      OR (papel = 'Monitor' AND nome_pessoa = p_tutor)
    )
),
student_scope AS (
  SELECT *
  FROM filtered
  WHERE papel = 'Aluno'
)
SELECT jsonb_build_object(
  'overview',
  (
    SELECT jsonb_build_object(
      'rows', COUNT(*)::int,
      'students', COUNT(DISTINCT person_key)::int,
      'tutors', COALESCE((SELECT COUNT(DISTINCT nome_pessoa)::int FROM filtered WHERE papel = 'Tutor'), 0),
      'schools', COUNT(DISTINCT school_name)::int,
      'courses', COUNT(DISTINCT course_name)::int,
      'units', COUNT(DISTINCT id_uc)::int,
      'activeStudents', COUNT(DISTINCT CASE WHEN normalized_status = 'Ativo' THEN person_key END)::int,
      'suspendedStudents', COUNT(DISTINCT CASE WHEN normalized_status = 'Suspenso' THEN person_key END)::int,
      'completedStudents', COUNT(DISTINCT CASE WHEN normalized_status = 'Concluido' THEN person_key END)::int,
      'neverAccessedStudents', COUNT(DISTINCT CASE WHEN nunca_acessou_uc THEN person_key END)::int,
      'averageGrade', ROUND(AVG(nota_final_num)::numeric, 2),
      'activeRate',
        ROUND(
          100.0 * COUNT(DISTINCT CASE WHEN normalized_status = 'Ativo' THEN person_key END)
          / NULLIF(COUNT(DISTINCT person_key), 0),
          1
        ),
      'neverAccessRate',
        ROUND(
          100.0 * COUNT(DISTINCT CASE WHEN nunca_acessou_uc THEN person_key END)
          / NULLIF(COUNT(DISTINCT person_key), 0),
          1
        )
    )
    FROM student_scope
  ),
  -- Fixed: count distinct people per role instead of rows
  'roleBreakdown',
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('label', role_rows.label, 'value', role_rows.value) ORDER BY role_rows.value DESC, role_rows.label)
    FROM (
      SELECT papel AS label, COUNT(DISTINCT nome_pessoa)::int AS value
      FROM filtered
      GROUP BY papel
    ) AS role_rows
  ), '[]'::jsonb),
  'statusBreakdown',
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('label', status_rows.label, 'value', status_rows.value) ORDER BY status_rows.value DESC, status_rows.label)
    FROM (
      SELECT normalized_status AS label, COUNT(DISTINCT person_key)::int AS value
      FROM student_scope
      GROUP BY normalized_status
    ) AS status_rows
  ), '[]'::jsonb),
  'accessBreakdown',
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('label', access_rows.label, 'value', access_rows.value) ORDER BY access_rows.sort_order)
    FROM (
      SELECT
        CASE
          WHEN nunca_acessou_uc THEN 'Nunca acessou'
          WHEN ultimo_acesso_uc_at IS NULL THEN 'Sem registro'
          WHEN ultimo_acesso_uc_at >= NOW() - INTERVAL '7 days' THEN 'Ultimos 7 dias'
          WHEN ultimo_acesso_uc_at >= NOW() - INTERVAL '30 days' THEN '8 a 30 dias'
          ELSE 'Mais de 30 dias'
        END AS label,
        CASE
          WHEN nunca_acessou_uc THEN 1
          WHEN ultimo_acesso_uc_at IS NULL THEN 2
          WHEN ultimo_acesso_uc_at >= NOW() - INTERVAL '7 days' THEN 3
          WHEN ultimo_acesso_uc_at >= NOW() - INTERVAL '30 days' THEN 4
          ELSE 5
        END AS sort_order,
        COUNT(DISTINCT person_key)::int AS value
      FROM student_scope
      GROUP BY 1, 2
    ) AS access_rows
  ), '[]'::jsonb),
  'monthlyTrend',
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'label', trend_rows.label,
        'students', trend_rows.students,
        'units', trend_rows.units
      )
      ORDER BY trend_rows.sort_key
    )
    FROM (
      SELECT *
      FROM (
        SELECT
          to_char(date_trunc('month', reference_date), 'YYYY-MM') AS sort_key,
          to_char(date_trunc('month', reference_date), 'MM/YYYY') AS label,
          COUNT(DISTINCT person_key)::int AS students,
          COUNT(DISTINCT id_uc)::int AS units
        FROM student_scope
        WHERE reference_date IS NOT NULL
        GROUP BY 1, 2
        ORDER BY 1 DESC
        LIMIT 12
      ) AS limited_trend
      ORDER BY sort_key
    ) AS trend_rows
  ), '[]'::jsonb),
  'topSchools',
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'label', school_rows.label,
        'students', school_rows.students,
        'units', school_rows.units
      )
      ORDER BY school_rows.students DESC, school_rows.label
    )
    FROM (
      SELECT
        COALESCE(NULLIF(school_name, ''), 'Nao informada') AS label,
        COUNT(DISTINCT person_key)::int AS students,
        COUNT(DISTINCT id_uc)::int AS units
      FROM student_scope
      GROUP BY 1
      ORDER BY students DESC, label
      LIMIT 8
    ) AS school_rows
  ), '[]'::jsonb),
  'topTutors',
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'label', tutor_rows.label,
        'students', tutor_rows.students,
        'units', tutor_rows.units
      )
      ORDER BY tutor_rows.students DESC, tutor_rows.label
    )
    FROM (
      SELECT
        tutor_entries.tutor_name AS label,
        COUNT(DISTINCT s.person_key)::int AS students,
        COUNT(DISTINCT s.id_uc)::int AS units
      FROM student_scope s
      LEFT JOIN LATERAL unnest(
        CASE
          WHEN COALESCE(array_length(s.tutor_names, 1), 0) = 0
            THEN ARRAY['Sem tutor']::text[]
          ELSE s.tutor_names
        END
      ) AS tutor_entries(tutor_name) ON TRUE
      GROUP BY tutor_entries.tutor_name
      ORDER BY students DESC, tutor_entries.tutor_name
      LIMIT 8
    ) AS tutor_rows
  ), '[]'::jsonb),
  'topMonitors',
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'label', monitor_rows.label,
        'students', monitor_rows.students,
        'units', monitor_rows.units
      )
      ORDER BY monitor_rows.students DESC, monitor_rows.label
    )
    FROM (
      SELECT
        monitor_entries.monitor_name AS label,
        COUNT(DISTINCT s.person_key)::int AS students,
        COUNT(DISTINCT s.id_uc)::int AS units
      FROM student_scope s
      LEFT JOIN LATERAL unnest(
        CASE
          WHEN COALESCE(array_length(s.monitor_names, 1), 0) = 0
            THEN ARRAY['Sem monitor']::text[]
          ELSE s.monitor_names
        END
      ) AS monitor_entries(monitor_name) ON TRUE
      GROUP BY monitor_entries.monitor_name
      ORDER BY students DESC, monitor_entries.monitor_name
      LIMIT 8
    ) AS monitor_rows
  ), '[]'::jsonb),
  'topCourses',
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'label', course_rows.label,
        'students', course_rows.students,
        'units', course_rows.units
      )
      ORDER BY course_rows.students DESC, course_rows.label
    )
    FROM (
      SELECT
        COALESCE(NULLIF(course_name, ''), 'Nao informado') AS label,
        COUNT(DISTINCT person_key)::int AS students,
        COUNT(DISTINCT id_uc)::int AS units
      FROM student_scope
      GROUP BY 1
      ORDER BY students DESC, label
      LIMIT 8
    ) AS course_rows
  ), '[]'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_uc_enrollments_dashboard(DATE, DATE, TEXT, TEXT) TO authenticated;

COMMIT;
