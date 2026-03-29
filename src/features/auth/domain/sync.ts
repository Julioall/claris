export interface SyncStep {
  id: string;
  label: string;
  icon: 'courses' | 'students' | 'activities' | 'grades';
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  count?: number;
  total?: number;
  errorMessage?: string;
}

export interface SyncProgress {
  isOpen: boolean;
  steps: SyncStep[];
  currentStep: string | null;
  isComplete: boolean;
}

export type SyncEntity = 'courses' | 'students' | 'activities' | 'grades';
export type CourseScopedSyncEntity = Exclude<SyncEntity, 'courses'>;

export interface ScopedSyncSummary {
  students: number;
  activities: number;
  grades: number;
}

export interface RiskUpdateResult {
  failedCount: number;
  updatedCount: number;
  missingRpc: boolean;
  usedFallback: boolean;
}

export const INITIAL_SYNC_STEPS: SyncStep[] = [
  { id: 'courses', label: 'Sincronizar cursos', icon: 'courses', status: 'pending' },
  { id: 'students', label: 'Sincronizar alunos', icon: 'students', status: 'pending' },
];

export const STEP_FUNCTION_MAP: Record<CourseScopedSyncEntity, string> = {
  students: 'moodle-sync-students',
  activities: 'moodle-sync-activities',
  grades: 'moodle-sync-grades',
};

export const STEP_BATCH_CONFIG: Record<CourseScopedSyncEntity, { batchSize: number; timeoutMs: number }> = {
  // students: 20 (was 5) — low risk, simple GET operations (~200-500ms per course)
  students: { batchSize: 20, timeoutMs: 22000 },
  // activities: 8 (was 2) — medium risk, per-course module fetching (~500-1000ms per course)
  activities: { batchSize: 8, timeoutMs: 26000 },
  // grades: 10 (was 2) — higher risk but mitigated by retry/backoff; per-student grades (~600-1000ms per student)
  grades: { batchSize: 10, timeoutMs: 26000 },
};

export const BATCH_DELAY_MS = 120;

export function createInitialSyncProgress(): SyncProgress {
  return {
    isOpen: false,
    steps: INITIAL_SYNC_STEPS,
    currentStep: null,
    isComplete: false,
  };
}
