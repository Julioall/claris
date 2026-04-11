/**
 * Mapping utilities between Supabase DB rows and the UcEnrollment domain type.
 * Centralises all field renaming and derived-field logic in one place so the
 * UI layer is never coupled to raw DB column names.
 */

import type { Tables } from '@/integrations/supabase/types';
import type { UcEnrollment } from '../types';

type DbRow = Tables<'uc_enrollments'>;

/** Map a Supabase `uc_enrollments` row to the frontend domain type. */
export function mapDbRowToEnrollment(row: DbRow): UcEnrollment {
  return {
    id: row.id,

    nomePessoa: row.nome_pessoa,
    cpf: row.cpf,
    email: row.email,
    telefone1: row.telefone1,
    telefone2: row.telefone2,

    papel: row.papel,
    ucEnrollmentId: row.id_uc,
    coursePath: row.caminho_curso,
    ucName: row.nome_uc,

    finalGradeRaw: row.nota_final_raw,
    finalGradeNumeric: row.nota_final_num,

    ucStartAt: row.inicio_uc_at,
    ucEndAt: row.termino_uc_at,
    lastUcAccessAt: row.ultimo_acesso_uc_at,
    neverAccessedUc: row.nunca_acessou_uc,
    lastPlatformAccessAt: row.ultimo_acesso_plataforma_at,
    enrolledAt: row.matriculado_em_at,

    enrollmentStatus: row.status_uc,
    category: row.categoria,

    importBatchId: row.import_batch_id,
    importedAt: row.imported_at,
    updatedAt: row.updated_at,
  };
}
