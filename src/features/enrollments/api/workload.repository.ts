/**
 * Workload repository — computes tutor/monitor workload KPIs from the
 * uc_enrollments table without requiring additional Supabase RPCs.
 *
 * Data model:
 *  - Each row represents one person (Aluno, Tutor, Monitor) enrolled in one UC.
 *  - Rows sharing the same `id_uc` belong to the same Unidade Curricular.
 *  - Tutors/Monitors are identified by searching `papel` for "tutor" or "monitor".
 *  - Students are identified by `papel` matching "aluno".
 */

import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────────────────────
// Raw DB shape (only columns needed for workload computation)
// ─────────────────────────────────────────────────────────────────────────────

interface WorkloadDbRow {
  id_uc: string;
  nome_uc: string | null;
  nome_pessoa: string;
  papel: string | null;
  categoria: string | null;
  caminho_curso: string | null;
  status_uc: string | null;
  nota_final_num: number | null;
  nunca_acessou_uc: boolean;
  matriculado_em_at: string | null;
}

export interface WorkloadKpiFilters {
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

export interface TutorWorkloadRow {
  tutorName: string;
  totalUcs: number;
  totalStudents: number;
  averageGrade: number | null;
  accessRate: number;
  neverAccessRate: number;
  activeRate: number;
  completionRate: number;
}

export interface WorkloadCategoryBreakdown {
  category: string;
  ucCount: number;
  tutorCount: number;
  studentCount: number;
  completionRate: number;
  accessRate: number;
  averageGrade: number | null;
}

export interface WorkloadKPIData {
  tutors: TutorWorkloadRow[];
  monitors: TutorWorkloadRow[];
  categoryBreakdown: WorkloadCategoryBreakdown[];
  monitorCategoryBreakdown: WorkloadCategoryBreakdown[];
  totalUcs: number;
  totalStudents: number;
  totalTutors: number;
  totalMonitors: number;
  totalTutorUcs: number;
  totalMonitorUcs: number;
  totalTutorStudents: number;
  totalMonitorStudents: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_WORKLOAD: WorkloadKPIData = {
  tutors: [],
  monitors: [],
  categoryBreakdown: [],
  monitorCategoryBreakdown: [],
  totalUcs: 0,
  totalStudents: 0,
  totalTutors: 0,
  totalMonitors: 0,
  totalTutorUcs: 0,
  totalMonitorUcs: 0,
  totalTutorStudents: 0,
  totalMonitorStudents: 0,
};

const PAGE_SIZE = 1000;

function normalizePapel(papel: string | null | undefined): string {
  return (papel ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function extractSchool(caminhoCurso: string | null | undefined): string {
  if (!caminhoCurso) return 'sem escola';
  const segment = caminhoCurso
    .split('/')
    .map((s) => s.trim())
    .find((s) => s.length > 0);

  return normalizeText(segment ?? 'Sem escola');
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

function isTutorOrMonitor(papel: string | null | undefined): boolean {
  const norm = normalizePapel(papel);
  return norm.includes('tutor') || norm.includes('monitor');
}

type ActorRole = 'tutor' | 'monitor';

function getActorRole(papel: string | null | undefined): ActorRole | null {
  const norm = normalizePapel(papel);
  if (norm.includes('monitor')) return 'monitor';
  if (norm.includes('tutor')) return 'tutor';
  return null;
}

function isStudent(papel: string | null | undefined): boolean {
  const norm = normalizePapel(papel);
  return norm === 'aluno' || norm.startsWith('aluno');
}

function avgOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

async function fetchAllWorkloadRows(): Promise<WorkloadDbRow[]> {
  const rows: WorkloadDbRow[] = [];
  let page = 0;

  while (true) {
    const { data, error } = await supabase
      .from('uc_enrollments')
      .select('id_uc, nome_uc, nome_pessoa, papel, categoria, caminho_curso, status_uc, nota_final_num, nunca_acessou_uc, matriculado_em_at')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    rows.push(...((data ?? []) as WorkloadDbRow[]));

    if (!data || data.length < PAGE_SIZE) break;
    page += 1;
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public repository function
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchTutorWorkloadKPIs(filters: WorkloadKpiFilters = {}): Promise<WorkloadKPIData> {
  let rows: WorkloadDbRow[];

  try {
    rows = await fetchAllWorkloadRows();
  } catch {
    return { ...EMPTY_WORKLOAD };
  }

  if (rows.length === 0) return { ...EMPTY_WORKLOAD };

  // ── Step 1: group rows by UC ────────────────────────────────────────────

  const ucMap = new Map<string, {
    ucName: string;
    category: string;
    school: string;
    tutors: Set<string>;
    monitors: Set<string>;
    students: WorkloadDbRow[];
  }>();

  for (const row of rows) {
    const ucId = row.id_uc;

    if (!ucMap.has(ucId)) {
      ucMap.set(ucId, {
        ucName: row.nome_uc ?? ucId,
        category: row.categoria?.trim() || 'Sem categoria',
        school: extractSchool(row.caminho_curso),
        tutors: new Set(),
        monitors: new Set(),
        students: [],
      });
    }

    const uc = ucMap.get(ucId)!;

    if (isTutorOrMonitor(row.papel)) {
      const name = row.nome_pessoa?.trim();
      const role = getActorRole(row.papel);
      if (name && role === 'tutor') uc.tutors.add(name);
      if (name && role === 'monitor') uc.monitors.add(name);
    } else if (isStudent(row.papel)) {
      const statusMatch = !filters.statusUc
        || normalizeText(row.status_uc) === normalizeText(filters.statusUc);
      const dateMatch = isWithinDateRange(row.matriculado_em_at, filters.startDate, filters.endDate);

      if (statusMatch && dateMatch) {
        uc.students.push(row);
      }
    }
  }

  const selectedTutor = normalizeText(filters.tutor);
  const selectedCategory = normalizeText(filters.category);
  const selectedSchool = normalizeText(filters.school);

  const filteredUcEntries = Array.from(ucMap.entries()).filter(([, uc]) => {
    if (selectedTutor) {
      const hasTutor = Array.from(uc.tutors).some((name) => normalizeText(name) === selectedTutor);
      const hasMonitor = Array.from(uc.monitors).some((name) => normalizeText(name) === selectedTutor);
      if (!hasTutor && !hasMonitor) return false;
    }

    if (selectedCategory && normalizeText(uc.category) !== selectedCategory) {
      return false;
    }

    if (selectedSchool && uc.school !== selectedSchool) {
      return false;
    }

    return true;
  });

  // ── Step 2: aggregate per-tutor metrics ────────────────────────────────

  const tutorMap = new Map<string, {
    ucIds: Set<string>;
    students: WorkloadDbRow[];
  }>();

  const monitorMap = new Map<string, {
    ucIds: Set<string>;
    students: WorkloadDbRow[];
  }>();

  for (const [ucId, uc] of filteredUcEntries) {
    for (const tutorName of uc.tutors) {
      if (!tutorMap.has(tutorName)) {
        tutorMap.set(tutorName, { ucIds: new Set(), students: [] });
      }
      const entry = tutorMap.get(tutorName)!;
      entry.ucIds.add(ucId);
      entry.students.push(...uc.students);
    }

    for (const monitorName of uc.monitors) {
      if (!monitorMap.has(monitorName)) {
        monitorMap.set(monitorName, { ucIds: new Set(), students: [] });
      }
      const entry = monitorMap.get(monitorName)!;
      entry.ucIds.add(ucId);
      entry.students.push(...uc.students);
    }
  }

  function buildActorRows(
    actorMap: Map<string, { ucIds: Set<string>; students: WorkloadDbRow[] }>,
  ): TutorWorkloadRow[] {
    return Array.from(actorMap.entries())
    .map(([tutorName, entry]) => {
      const students = entry.students;
      const total = students.length;

      if (total === 0) {
        return {
          tutorName,
          totalUcs: entry.ucIds.size,
          totalStudents: 0,
          averageGrade: null,
          accessRate: 0,
          neverAccessRate: 0,
          activeRate: 0,
          completionRate: 0,
        };
      }

      const accessed = students.filter((s) => !s.nunca_acessou_uc).length;
      const active = students.filter(
        (s) => (s.status_uc ?? '').trim().toLowerCase() === 'ativo',
      ).length;
      const grades = students
        .map((s) => s.nota_final_num)
        .filter((g): g is number => typeof g === 'number');
      const completed = grades.filter((g) => g >= 60).length;

      return {
        tutorName,
        totalUcs: entry.ucIds.size,
        totalStudents: total,
        averageGrade: avgOrNull(grades),
        accessRate: (accessed / total) * 100,
        neverAccessRate: ((total - accessed) / total) * 100,
        activeRate: (active / total) * 100,
        completionRate: grades.length > 0 ? (completed / grades.length) * 100 : 0,
      };
    })
    .sort((a, b) => b.totalStudents - a.totalStudents);
  }

  const tutorRows = buildActorRows(tutorMap);
  const monitorRows = buildActorRows(monitorMap);

  // ── Step 3: category breakdown ─────────────────────────────────────────

  const categoryMap = new Map<string, {
    ucIds: Set<string>;
    tutorNames: Set<string>;
    students: WorkloadDbRow[];
  }>();

  const monitorCategoryMap = new Map<string, {
    ucIds: Set<string>;
    tutorNames: Set<string>;
    students: WorkloadDbRow[];
  }>();

  for (const [ucId, uc] of filteredUcEntries) {
    const category = uc.category;

    if (!categoryMap.has(category)) {
      categoryMap.set(category, { ucIds: new Set(), tutorNames: new Set(), students: [] });
    }

    const cat = categoryMap.get(category)!;
    cat.ucIds.add(ucId);
    for (const t of uc.tutors) cat.tutorNames.add(t);
    cat.students.push(...uc.students);

    if (!monitorCategoryMap.has(category)) {
      monitorCategoryMap.set(category, { ucIds: new Set(), tutorNames: new Set(), students: [] });
    }

    const monitorCat = monitorCategoryMap.get(category)!;
    monitorCat.ucIds.add(ucId);
    for (const m of uc.monitors) monitorCat.tutorNames.add(m);
    monitorCat.students.push(...uc.students);
  }

  function buildCategoryBreakdown(
    sourceMap: Map<string, { ucIds: Set<string>; tutorNames: Set<string>; students: WorkloadDbRow[] }>,
  ): WorkloadCategoryBreakdown[] {
    return Array.from(sourceMap.entries())
    .map(([category, cat]) => {
      const students = cat.students;
      const total = students.length;
      const accessed = students.filter((s) => !s.nunca_acessou_uc).length;
      const grades = students
        .map((s) => s.nota_final_num)
        .filter((g): g is number => typeof g === 'number');
      const completed = grades.filter((g) => g >= 60).length;

      return {
        category,
        ucCount: cat.ucIds.size,
        tutorCount: cat.tutorNames.size,
        studentCount: total,
        completionRate: grades.length > 0 ? (completed / grades.length) * 100 : 0,
        accessRate: total > 0 ? (accessed / total) * 100 : 0,
        averageGrade: avgOrNull(grades),
      };
    })
    .sort((a, b) => b.studentCount - a.studentCount);
  }

  const categoryBreakdown = buildCategoryBreakdown(categoryMap);
  const monitorCategoryBreakdown = buildCategoryBreakdown(monitorCategoryMap);

  // ── Step 4: global totals ──────────────────────────────────────────────

  const uniqueStudentNames = new Set<string>();
  for (const [, uc] of filteredUcEntries) {
    for (const s of uc.students) {
      uniqueStudentNames.add(s.nome_pessoa?.trim() ?? '');
    }
  }

  const tutorStudentNames = new Set<string>();
  const monitorStudentNames = new Set<string>();

  for (const [, entry] of tutorMap) {
    for (const s of entry.students) {
      tutorStudentNames.add(s.nome_pessoa?.trim() ?? '');
    }
  }

  for (const [, entry] of monitorMap) {
    for (const s of entry.students) {
      monitorStudentNames.add(s.nome_pessoa?.trim() ?? '');
    }
  }

  const totalTutorUcs = filteredUcEntries.filter(([, uc]) => uc.tutors.size > 0).length;
  const totalMonitorUcs = filteredUcEntries.filter(([, uc]) => uc.monitors.size > 0).length;

  return {
    tutors: tutorRows,
    monitors: monitorRows,
    categoryBreakdown,
    monitorCategoryBreakdown,
    totalUcs: filteredUcEntries.length,
    totalStudents: uniqueStudentNames.size,
    totalTutors: tutorMap.size,
    totalMonitors: monitorMap.size,
    totalTutorUcs,
    totalMonitorUcs,
    totalTutorStudents: tutorStudentNames.size,
    totalMonitorStudents: monitorStudentNames.size,
  };
}
