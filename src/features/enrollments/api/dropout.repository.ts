/**
 * Dropout/Evasion KPI repository.
 *
 * Computes student dropout, retention, and engagement KPIs from the
 * uc_enrollments table using only locally-available columns. No RPCs required.
 *
 * Data model:
 *  - Rows sharing the same `id_uc` belong to the same Unidade Curricular.
 *  - Students: `papel` matches "aluno".
 *  - Tutors/Monitors: `papel` contains "tutor" or "monitor".
 *  - Evaded: status_uc = "Não atualmente" | "Suspenso" (and variants).
 *  - Active: status_uc = "Ativo".
 */

import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────────────────────
// Raw DB shape
// ─────────────────────────────────────────────────────────────────────────────

interface DropoutDbRow {
  id_uc: string;
  nome_uc: string | null;
  nome_pessoa: string;
  papel: string | null;
  status_uc: string | null;
  categoria: string | null;
  caminho_curso: string | null;
  nunca_acessou_uc: boolean;
  matriculado_em_at: string | null;
  termino_uc_at: string | null;
  ultimo_acesso_uc_at: string | null;
}

export interface DropoutKpiFilters {
  startDate?: string;
  endDate?: string;
  tutor?: string;
  school?: string;
  category?: string;
  statusUc?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public result types
// ─────────────────────────────────────────────────────────────────────────────

export interface DropoutGlobalStats {
  totalStudents: number;
  activeCount: number;
  evadedCount: number;
  activeRate: number;
  dropoutRate: number;
  /** Average days from enrollment to last UC access for evaded students. */
  avgDaysToDropout: number | null;
  /** Average days from enrollment date to UC end date (all students). */
  avgDaysInCourse: number | null;
}

export interface UcDropoutRow {
  ucId: string;
  ucName: string;
  totalStudents: number;
  activeCount: number;
  evadedCount: number;
  dropoutRate: number;
  neverAccessedCount: number;
  neverAccessRate: number;
}

export interface TutorDropoutRow {
  tutorName: string;
  totalStudents: number;
  activeCount: number;
  evadedCount: number;
  dropoutRate: number;
  activeRate: number;
  avgDaysToDropout: number | null;
}

export interface CategoryDropoutRow {
  category: string;
  ucCount: number;
  totalStudents: number;
  activeCount: number;
  evadedCount: number;
  dropoutRate: number;
  activeRate: number;
  accessRate: number;
  avgDaysInCourse: number | null;
}

export interface SchoolRetentionRow {
  school: string;
  totalStudents: number;
  activeCount: number;
  evadedCount: number;
  retentionRate: number;
  dropoutRate: number;
}

export interface DropoutKPIData {
  global: DropoutGlobalStats;
  topUcsByDropout: UcDropoutRow[];
  tutorDropout: TutorDropoutRow[];
  monitorDropout: TutorDropoutRow[];
  categoryDropout: CategoryDropoutRow[];
  schoolRetention: SchoolRetentionRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000;

const EMPTY_DROPOUT: DropoutKPIData = {
  global: {
    totalStudents: 0,
    activeCount: 0,
    evadedCount: 0,
    activeRate: 0,
    dropoutRate: 0,
    avgDaysToDropout: null,
    avgDaysInCourse: null,
  },
  topUcsByDropout: [],
  tutorDropout: [],
  monitorDropout: [],
  categoryDropout: [],
  schoolRetention: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function norm(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function isTutorOrMonitor(papel: string | null | undefined): boolean {
  const n = norm(papel);
  return n.includes('tutor') || n.includes('monitor');
}

type ActorRole = 'tutor' | 'monitor';

function getActorRole(papel: string | null | undefined): ActorRole | null {
  const n = norm(papel);
  if (n.includes('monitor')) return 'monitor';
  if (n.includes('tutor')) return 'tutor';
  return null;
}

function isStudent(papel: string | null | undefined): boolean {
  const n = norm(papel);
  return n === 'aluno' || n.startsWith('aluno');
}

/**
 * Returns true for statuses that indicate the student is no longer enrolled
 * ("Não atualmente", "Suspenso", and similar variants seen in Moodle exports).
 */
function isEvaded(status: string | null | undefined): boolean {
  const n = norm(status);
  return n.includes('nao') || n.includes('suspenso') || n.includes('evadido') || n.includes('desistiu');
}

function isActive(status: string | null | undefined): boolean {
  return norm(status) === 'ativo';
}

/**
 * Extracts institution/school from the Moodle course path (first "/" segment).
 */
function extractSchool(caminhoCurso: string | null | undefined): string {
  if (!caminhoCurso) return 'Sem escola';
  const segment = caminhoCurso.split('/').map((s) => s.trim()).find((s) => s.length > 0);
  return segment ?? 'Sem escola';
}

function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  const diff = tb - ta;
  return diff >= 0 ? Math.round(diff / 86_400_000) : null;
}

function isWithinDateRange(value: string | null | undefined, startDate?: string, endDate?: string) {
  if (!startDate && !endDate) return true;
  if (!value) return false;

  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return false;

  if (startDate) {
    const startTs = new Date(startDate).getTime();
    if (!Number.isNaN(startTs) && ts < startTs) return false;
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const endTs = end.getTime();
    if (!Number.isNaN(endTs) && ts > endTs) return false;
  }

  return true;
}

function safeAvgDays(days: (number | null)[]): number | null {
  const valid = days.filter((d): d is number => d !== null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((acc, d) => acc + d, 0) / valid.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAllRows(): Promise<DropoutDbRow[]> {
  const rows: DropoutDbRow[] = [];
  let page = 0;

  while (true) {
    const { data, error } = await supabase
      .from('uc_enrollments')
      .select(
        'id_uc, nome_uc, nome_pessoa, papel, status_uc, categoria, caminho_curso, nunca_acessou_uc, matriculado_em_at, termino_uc_at, ultimo_acesso_uc_at',
      )
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    rows.push(...((data ?? []) as DropoutDbRow[]));

    if (!data || data.length < PAGE_SIZE) break;
    page += 1;
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchDropoutKPIs(filters: DropoutKpiFilters = {}): Promise<DropoutKPIData> {
  let rows: DropoutDbRow[];

  try {
    rows = await fetchAllRows();
  } catch {
    return { ...EMPTY_DROPOUT };
  }

  if (rows.length === 0) return { ...EMPTY_DROPOUT };

  // ── Step 1: Group rows by UC (id_uc) — identifies tutors + students per UC ──

  const ucMap = new Map<string, {
    ucName: string;
    category: string;
    school: string;
    tutors: Set<string>;
    monitors: Set<string>;
    students: DropoutDbRow[];
  }>();

  for (const row of rows) {
    if (!ucMap.has(row.id_uc)) {
      ucMap.set(row.id_uc, {
        ucName: row.nome_uc ?? row.id_uc,
        category: row.categoria?.trim() || 'Sem categoria',
        school: extractSchool(row.caminho_curso),
        tutors: new Set(),
        monitors: new Set(),
        students: [],
      });
    }

    const uc = ucMap.get(row.id_uc)!;

    if (isTutorOrMonitor(row.papel)) {
      const name = row.nome_pessoa?.trim();
      const role = getActorRole(row.papel);
      if (name && role === 'tutor') uc.tutors.add(name);
      if (name && role === 'monitor') uc.monitors.add(name);
    } else if (isStudent(row.papel)) {
      const statusMatch = !filters.statusUc || norm(row.status_uc) === norm(filters.statusUc);
      const dateMatch = isWithinDateRange(row.matriculado_em_at, filters.startDate, filters.endDate);

      if (statusMatch && dateMatch) {
        uc.students.push(row);
      }
    }
  }

  const selectedTutor = norm(filters.tutor);
  const selectedCategory = norm(filters.category);
  const selectedSchool = norm(filters.school);

  const filteredUcEntries = Array.from(ucMap.entries()).filter(([, uc]) => {
    if (selectedTutor) {
      const hasTutor = Array.from(uc.tutors).some((name) => norm(name) === selectedTutor);
      const hasMonitor = Array.from(uc.monitors).some((name) => norm(name) === selectedTutor);
      if (!hasTutor && !hasMonitor) return false;
    }

    if (selectedCategory && norm(uc.category) !== selectedCategory) {
      return false;
    }

    if (selectedSchool && norm(uc.school) !== selectedSchool) {
      return false;
    }

    return true;
  });

  // ── Step 2: Per-UC dropout ──────────────────────────────────────────────────

  const ucDropoutRows: UcDropoutRow[] = filteredUcEntries
    .map(([ucId, uc]) => {
      const students = uc.students;
      const total = students.length;
      const evaded = students.filter((s) => isEvaded(s.status_uc)).length;
      const active = students.filter((s) => isActive(s.status_uc)).length;
      const neverAccessed = students.filter((s) => s.nunca_acessou_uc).length;

      return {
        ucId,
        ucName: uc.ucName,
        totalStudents: total,
        activeCount: active,
        evadedCount: evaded,
        dropoutRate: total > 0 ? (evaded / total) * 100 : 0,
        neverAccessedCount: neverAccessed,
        neverAccessRate: total > 0 ? (neverAccessed / total) * 100 : 0,
      };
    });

  const topUcsByDropout = ucDropoutRows
    .filter((uc) => uc.totalStudents > 0)
    .sort((a, b) => b.dropoutRate - a.dropoutRate)
    .slice(0, 25);

  // ── Step 3: Per-tutor dropout ───────────────────────────────────────────────

  const tutorMap = new Map<string, { students: DropoutDbRow[] }>();
  const monitorMap = new Map<string, { students: DropoutDbRow[] }>();

  for (const [, uc] of filteredUcEntries) {
    for (const tutorName of uc.tutors) {
      if (!tutorMap.has(tutorName)) {
        tutorMap.set(tutorName, { students: [] });
      }
      tutorMap.get(tutorName)!.students.push(...uc.students);
    }

    for (const monitorName of uc.monitors) {
      if (!monitorMap.has(monitorName)) {
        monitorMap.set(monitorName, { students: [] });
      }
      monitorMap.get(monitorName)!.students.push(...uc.students);
    }
  }

  function buildActorDropout(actorMap: Map<string, { students: DropoutDbRow[] }>): TutorDropoutRow[] {
    return Array.from(actorMap.entries())
    .map(([tutorName, entry]) => {
      const students = entry.students;
      const total = students.length;
      const evaded = students.filter((s) => isEvaded(s.status_uc)).length;
      const active = students.filter((s) => isActive(s.status_uc)).length;

      const dropoutDays = students
        .filter((s) => isEvaded(s.status_uc))
        .map((s) => daysBetween(s.matriculado_em_at, s.ultimo_acesso_uc_at));

      return {
        tutorName,
        totalStudents: total,
        activeCount: active,
        evadedCount: evaded,
        dropoutRate: total > 0 ? (evaded / total) * 100 : 0,
        activeRate: total > 0 ? (active / total) * 100 : 0,
        avgDaysToDropout: safeAvgDays(dropoutDays),
      };
    })
    .filter((t) => t.totalStudents > 0)
    .sort((a, b) => b.dropoutRate - a.dropoutRate);
  }

  const tutorDropout = buildActorDropout(tutorMap);
  const monitorDropout = buildActorDropout(monitorMap);

  // ── Step 4: Per-category ────────────────────────────────────────────────────

  const categoryMap = new Map<string, {
    ucIds: Set<string>;
    students: DropoutDbRow[];
  }>();

  for (const [ucId, uc] of filteredUcEntries) {
    const cat = uc.category;
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, { ucIds: new Set(), students: [] });
    }
    const entry = categoryMap.get(cat)!;
    entry.ucIds.add(ucId);
    entry.students.push(...uc.students);
  }

  const categoryDropout: CategoryDropoutRow[] = Array.from(categoryMap.entries())
    .map(([category, entry]) => {
      const students = entry.students;
      const total = students.length;
      const evaded = students.filter((s) => isEvaded(s.status_uc)).length;
      const active = students.filter((s) => isActive(s.status_uc)).length;
      const accessed = students.filter((s) => !s.nunca_acessou_uc).length;

      const courseDays = students.map((s) => daysBetween(s.matriculado_em_at, s.termino_uc_at));

      return {
        category,
        ucCount: entry.ucIds.size,
        totalStudents: total,
        activeCount: active,
        evadedCount: evaded,
        dropoutRate: total > 0 ? (evaded / total) * 100 : 0,
        activeRate: total > 0 ? (active / total) * 100 : 0,
        accessRate: total > 0 ? (accessed / total) * 100 : 0,
        avgDaysInCourse: safeAvgDays(courseDays),
      };
    })
    .sort((a, b) => b.totalStudents - a.totalStudents);

  // ── Step 5: Per-school retention ────────────────────────────────────────────

  const schoolMap = new Map<string, { students: DropoutDbRow[] }>();

  for (const [, uc] of filteredUcEntries) {
    const school = uc.school;
    if (!schoolMap.has(school)) {
      schoolMap.set(school, { students: [] });
    }
    schoolMap.get(school)!.students.push(...uc.students);
  }

  const schoolRetention: SchoolRetentionRow[] = Array.from(schoolMap.entries())
    .map(([school, entry]) => {
      const students = entry.students;
      const total = students.length;
      const evaded = students.filter((s) => isEvaded(s.status_uc)).length;
      const active = students.filter((s) => isActive(s.status_uc)).length;

      return {
        school,
        totalStudents: total,
        activeCount: active,
        evadedCount: evaded,
        retentionRate: total > 0 ? (active / total) * 100 : 0,
        dropoutRate: total > 0 ? (evaded / total) * 100 : 0,
      };
    })
    .filter((s) => s.totalStudents > 0)
    .sort((a, b) => b.totalStudents - a.totalStudents)
    .slice(0, 30);

  // ── Step 6: Global stats (all student rows, not deduplicated) ───────────────

  const allStudentRows = filteredUcEntries.flatMap(([, uc]) => uc.students);
  const totalRows = allStudentRows.length;
  const evadedRows = allStudentRows.filter((s) => isEvaded(s.status_uc)).length;
  const activeRows = allStudentRows.filter((s) => isActive(s.status_uc)).length;

  const uniqueStudentNames = new Set(allStudentRows.map((s) => s.nome_pessoa?.trim() ?? ''));

  const dropoutDays = allStudentRows
    .filter((s) => isEvaded(s.status_uc))
    .map((s) => daysBetween(s.matriculado_em_at, s.ultimo_acesso_uc_at));

  const courseDays = allStudentRows.map((s) =>
    daysBetween(s.matriculado_em_at, s.termino_uc_at),
  );

  return {
    global: {
      totalStudents: uniqueStudentNames.size,
      activeCount: activeRows,
      evadedCount: evadedRows,
      activeRate: totalRows > 0 ? (activeRows / totalRows) * 100 : 0,
      dropoutRate: totalRows > 0 ? (evadedRows / totalRows) * 100 : 0,
      avgDaysToDropout: safeAvgDays(dropoutDays),
      avgDaysInCourse: safeAvgDays(courseDays),
    },
    topUcsByDropout,
    tutorDropout,
    monitorDropout,
    categoryDropout,
    schoolRetention,
  };
}
