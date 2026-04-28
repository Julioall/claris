-- Dashboard analytics for the management panel based on imported UC enrollments.
-- Provides strategic KPIs filtered by period, tutor and school.

CREATE OR REPLACE FUNCTION public.get_uc_enrollments_dashboard(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_tutor TEXT DEFAULT NULL,
  p_school TEXT DEFAULT NULL
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
      OR (papel = 'Tutor' AND nome_pessoa = p_tutor)
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
  'roleBreakdown',
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('label', role_rows.label, 'value', role_rows.value) ORDER BY role_rows.value DESC, role_rows.label)
    FROM (
      SELECT papel AS label, COUNT(*)::int AS value
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

CREATE OR REPLACE FUNCTION public.get_uc_enrollments_dashboard_options()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH enriched AS (
  SELECT
    COALESCE(e.matriculado_em_at, e.inicio_uc_at) AS reference_date,
    CASE
      WHEN array_length(path_data.path_parts, 1) >= 2 THEN BTRIM(path_data.path_parts[2])
      ELSE NULL
    END AS school_name
  FROM public.uc_enrollments e
  CROSS JOIN LATERAL (
    SELECT regexp_split_to_array(COALESCE(e.caminho_curso, ''), '\s*/\s*') AS path_parts
  ) AS path_data
)
SELECT jsonb_build_object(
  'schools',
  COALESCE((
    SELECT jsonb_agg(option_rows.school_name ORDER BY option_rows.school_name)
    FROM (
      SELECT DISTINCT school_name
      FROM enriched
      WHERE school_name IS NOT NULL
        AND school_name <> ''
    ) AS option_rows
  ), '[]'::jsonb),
  'tutors',
  COALESCE((
    SELECT jsonb_agg(option_rows.nome_pessoa ORDER BY option_rows.nome_pessoa)
    FROM (
      SELECT DISTINCT nome_pessoa
      FROM public.uc_enrollments
      WHERE papel = 'Tutor'
        AND nome_pessoa IS NOT NULL
        AND BTRIM(nome_pessoa) <> ''
    ) AS option_rows
  ), '[]'::jsonb),
  'dateRange',
  jsonb_build_object(
    'min', MIN(reference_date),
    'max', MAX(reference_date)
  )
)
FROM enriched;
$$;

GRANT EXECUTE ON FUNCTION public.get_uc_enrollments_dashboard_options() TO authenticated
