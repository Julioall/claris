-- Migration: Add UC Enrollments tables for JSON-based management panel
-- These tables store enrollment data imported from external JSON reports,
-- fully decoupled from Moodle real-time sync.

-- ────────────────────────────────────────────────────────────────────────────
-- Table: uc_import_batches
-- Tracks each JSON import operation for auditability.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE uc_import_batches (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  imported_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  filename        text,
  total_records   integer     NOT NULL DEFAULT 0,
  upserted_records integer    NOT NULL DEFAULT 0,
  status          text        NOT NULL DEFAULT 'completed',
  error_message   text,
  imported_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE uc_import_batches IS
  'Tracks each batch import of UC enrollment data from external JSON reports.';

-- ────────────────────────────────────────────────────────────────────────────
-- Table: uc_enrollments
-- Stores the normalized enrollment data imported from the external JSON.
--
-- Field mapping from JSON source:
--   aluno             → nome_pessoa
--   cpf               → cpf
--   e-mail            → email
--   telefone1         → telefone1
--   telefone2         → telefone2
--   papel             → papel   (Aluno | Monitor | Tutor | Professor Presencial)
--   iduc              → id_uc   (UC/offering identifier — groups multiple people)
--   cursocaminho      → caminho_curso
--   unidadecurricular → nome_uc
--   notafinal         → nota_final_raw (raw text) + nota_final_num (parsed)
--   datadeinciouc     → inicio_uc_at
--   datatrminouc      → termino_uc_at
--   ltimoacessouc     → ultimo_acesso_uc_at (null when "Nunca"; nunca_acessou_uc = true)
--   ltimoacessomoodle → ultimo_acesso_plataforma_at
--   statusuc          → status_uc
--   datamatricula     → matriculado_em_at
--   categoria         → categoria
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE uc_enrollments (
  id                          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Person fields
  nome_pessoa                 text        NOT NULL,
  cpf                         text,
  email                       text,
  telefone1                   text,
  telefone2                   text,

  -- Enrollment / UC fields
  papel                       text        NOT NULL,
  id_uc                       text        NOT NULL,
  caminho_curso               text,
  nome_uc                     text        NOT NULL,

  -- Grade (raw preserved + parsed numeric)
  nota_final_raw              text,
  nota_final_num              numeric(6, 2),

  -- Dates (parsed from PT-BR text during import)
  inicio_uc_at                date,
  termino_uc_at               date,
  ultimo_acesso_uc_at         timestamptz,
  nunca_acessou_uc            boolean     NOT NULL DEFAULT false,
  ultimo_acesso_plataforma_at timestamptz,
  matriculado_em_at           date,

  -- Status / categorisation
  status_uc                   text,
  categoria                   text,

  -- Import provenance
  import_batch_id             uuid        REFERENCES uc_import_batches(id) ON DELETE SET NULL,
  imported_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  -- Natural key: one record per person-role-UC combination
  CONSTRAINT uc_enrollments_unique_link UNIQUE (id_uc, cpf, papel)
);

COMMENT ON TABLE uc_enrollments IS
  'Enrollment data imported from external JSON reports. '
  'Source of truth for the management panel (painel de gerência). '
  'No Moodle real-time dependency.';

COMMENT ON COLUMN uc_enrollments.nunca_acessou_uc IS
  'True when the source JSON field ltimoacessouc contained "Nunca" (never accessed).';

COMMENT ON COLUMN uc_enrollments.nota_final_raw IS
  'Raw grade string as received in the JSON (e.g. "8,50" or empty string).';

COMMENT ON COLUMN uc_enrollments.nota_final_num IS
  'Parsed numeric grade derived from nota_final_raw. Null when not parseable.';

-- ────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_uc_enrollments_id_uc       ON uc_enrollments (id_uc);

CREATE INDEX idx_uc_enrollments_cpf         ON uc_enrollments (cpf);

CREATE INDEX idx_uc_enrollments_papel       ON uc_enrollments (papel);

CREATE INDEX idx_uc_enrollments_status_uc   ON uc_enrollments (status_uc);

CREATE INDEX idx_uc_enrollments_categoria   ON uc_enrollments (categoria);

CREATE INDEX idx_uc_enrollments_nome_uc     ON uc_enrollments (nome_uc);

CREATE INDEX idx_uc_enrollments_imported_at ON uc_enrollments (imported_at);

-- Full-text search index over name + email + cpf
CREATE INDEX idx_uc_enrollments_fts ON uc_enrollments
  USING gin(
    to_tsvector(
      'portuguese',
      nome_pessoa
        || ' ' || coalesce(email, '')
        || ' ' || coalesce(cpf, '')
        || ' ' || coalesce(nome_uc, '')
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE uc_import_batches ENABLE ROW LEVEL SECURITY;

ALTER TABLE uc_enrollments    ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read both tables
CREATE POLICY "uc_import_batches: authenticated read"
  ON uc_import_batches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "uc_enrollments: authenticated read"
  ON uc_enrollments FOR SELECT
  TO authenticated
  USING (true);

-- Service role has full access (used by edge functions)
CREATE POLICY "uc_import_batches: service role all"
  ON uc_import_batches FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "uc_enrollments: service role all"
  ON uc_enrollments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: list_uc_enrollments_paginated
-- Returns a page of enrollments with optional server-side filtering and
-- the total count for pagination.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION list_uc_enrollments_paginated(
  p_search      text    DEFAULT NULL,
  p_papel       text    DEFAULT NULL,
  p_status_uc   text    DEFAULT NULL,
  p_categoria   text    DEFAULT NULL,
  p_nome_uc     text    DEFAULT NULL,
  p_page        integer DEFAULT 1,
  p_page_size   integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset  integer;
  v_total   bigint;
  v_rows    jsonb;
BEGIN
  v_offset := (p_page - 1) * p_page_size;

  -- Count matching rows
  SELECT count(*) INTO v_total
  FROM uc_enrollments e
  WHERE
    (p_search IS NULL OR p_search = '' OR (
      to_tsvector('portuguese',
        e.nome_pessoa
          || ' ' || coalesce(e.email, '')
          || ' ' || coalesce(e.cpf, '')
          || ' ' || coalesce(e.nome_uc, '')
      ) @@ plainto_tsquery('portuguese', p_search)
    ))
    AND (p_papel     IS NULL OR e.papel     = p_papel)
    AND (p_status_uc IS NULL OR e.status_uc = p_status_uc)
    AND (p_categoria IS NULL OR e.categoria = p_categoria)
    AND (p_nome_uc   IS NULL OR e.nome_uc   = p_nome_uc);

  -- Fetch page
  SELECT jsonb_agg(row_to_json(e.*)) INTO v_rows
  FROM (
    SELECT *
    FROM uc_enrollments e
    WHERE
      (p_search IS NULL OR p_search = '' OR (
        to_tsvector('portuguese',
          e.nome_pessoa
            || ' ' || coalesce(e.email, '')
            || ' ' || coalesce(e.cpf, '')
            || ' ' || coalesce(e.nome_uc, '')
        ) @@ plainto_tsquery('portuguese', p_search)
      ))
      AND (p_papel     IS NULL OR e.papel     = p_papel)
      AND (p_status_uc IS NULL OR e.status_uc = p_status_uc)
      AND (p_categoria IS NULL OR e.categoria = p_categoria)
      AND (p_nome_uc   IS NULL OR e.nome_uc   = p_nome_uc)
    ORDER BY e.nome_pessoa ASC, e.nome_uc ASC
    LIMIT  p_page_size
    OFFSET v_offset
  ) e;

  RETURN jsonb_build_object(
    'total', v_total,
    'items', coalesce(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION list_uc_enrollments_paginated TO authenticated
