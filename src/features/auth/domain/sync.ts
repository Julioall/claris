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
  students: { batchSize: 10, timeoutMs: 22000 },
  activities: { batchSize: 2, timeoutMs: 26000 },
  grades: { batchSize: 2, timeoutMs: 26000 },
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
