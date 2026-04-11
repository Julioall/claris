/**
 * Domain types for the Enrollments Management Panel (Painel de Gerência).
 *
 * These types represent data imported from an external JSON report and stored
 * exclusively in Supabase — with no Moodle real-time dependency.
 *
 * JSON field → domain field mapping:
 *   aluno             → nomePessoa
 *   cpf               → cpf
 *   e-mail            → email
 *   telefone1         → telefone1
 *   telefone2         → telefone2
 *   papel             → papel
 *   iduc              → ucEnrollmentId
 *   cursocaminho      → coursePath
 *   unidadecurricular → ucName
 *   notafinal         → finalGradeRaw  (raw text)  / finalGradeNumeric (parsed)
 *   datadeinciouc     → ucStartAt
 *   datatrminouc      → ucEndAt
 *   ltimoacessouc     → lastUcAccessAt (null when "Nunca") + neverAccessedUc flag
 *   ltimoacessomoodle → lastPlatformAccessAt
 *   statusuc          → enrollmentStatus
 *   datamatricula     → enrolledAt
 *   categoria         → category
 */

// ─────────────────────────────────────────────────────────────────────────────
// Roles
// ─────────────────────────────────────────────────────────────────────────────
export const KNOWN_ENROLLMENT_ROLES = [
  'Aluno',
  'Monitor',
  'Tutor',
  'Professor Presencial',
] as const;

export type KnownEnrollmentRole = (typeof KNOWN_ENROLLMENT_ROLES)[number];
export type EnrollmentRole = KnownEnrollmentRole | string;

// ─────────────────────────────────────────────────────────────────────────────
// Enrollment status
// ─────────────────────────────────────────────────────────────────────────────
export const KNOWN_ENROLLMENT_STATUSES = [
  'Ativo',
  'Não atualmente',
  'Suspenso',
] as const;

export type KnownEnrollmentStatus = (typeof KNOWN_ENROLLMENT_STATUSES)[number];
export type EnrollmentStatus = KnownEnrollmentStatus | string;

// ─────────────────────────────────────────────────────────────────────────────
// Core domain model
// ─────────────────────────────────────────────────────────────────────────────

/** A single enrollment record as returned by the repository. */
export interface UcEnrollment {
  id: string;

  // Person
  nomePessoa: string;
  cpf: string | null;
  email: string | null;
  telefone1: string | null;
  telefone2: string | null;

  // Role & UC
  papel: EnrollmentRole;
  ucEnrollmentId: string;
  coursePath: string | null;
  ucName: string;

  // Grade
  finalGradeRaw: string | null;
  finalGradeNumeric: number | null;

  // Dates
  ucStartAt: string | null;
  ucEndAt: string | null;
  lastUcAccessAt: string | null;
  neverAccessedUc: boolean;
  lastPlatformAccessAt: string | null;
  enrolledAt: string | null;

  // Status & classification
  enrollmentStatus: EnrollmentStatus | null;
  category: string | null;

  // Provenance
  importBatchId: string | null;
  importedAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// List / filter
// ─────────────────────────────────────────────────────────────────────────────

export interface EnrollmentFilters {
  search: string;
  papel: string;
  statusUc: string;
  categoria: string;
  nomeUc: string;
}

export const DEFAULT_ENROLLMENT_FILTERS: EnrollmentFilters = {
  search: '',
  papel: '',
  statusUc: '',
  categoria: '',
  nomeUc: '',
};

export interface EnrollmentListPage {
  items: UcEnrollment[];
  totalCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary indicators
// ─────────────────────────────────────────────────────────────────────────────

export interface EnrollmentSummary {
  total: number;
  byRole: Record<string, number>;
  byStatus: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Import batch
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportBatch {
  id: string;
  filename: string | null;
  totalRecords: number;
  upsertedRecords: number;
  status: 'processing' | 'completed' | 'partial' | 'failed';
  errorMessage: string | null;
  importedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw JSON source shape (as received from the external report)
// ─────────────────────────────────────────────────────────────────────────────

/** The exact field names as they appear in the source JSON. */
export interface JsonEnrollmentRecord {
  aluno: string;
  cpf: string;
  'e-mail': string;
  telefone1: string;
  telefone2: string;
  papel: string;
  iduc: string;
  cursocaminho: string;
  unidadecurricular: string;
  notafinal: string;
  datadeinciouc: string;
  datatrminouc: string;
  ltimoacessouc: string;
  ltimoacessomoodle: string;
  statusuc: string;
  datamatricula: string;
  categoria: string;
}
