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
  students: { batchSize: 1, timeoutMs: 60000 },
  activities: { batchSize: 1, timeoutMs: 90000 },
  grades: { batchSize: 1, timeoutMs: 90000 },
};

export const BATCH_DELAY_MS = 1000;

export const STUDENT_BATCH_CONFIG: Partial<Record<CourseScopedSyncEntity, { batchSize: number; delayMs: number }>> = {
  activities: { batchSize: 12, delayMs: 700 },
  grades: { batchSize: 10, delayMs: 700 },
};

export function createInitialSyncProgress(): SyncProgress {
  return {
    isOpen: false,
    steps: INITIAL_SYNC_STEPS,
    currentStep: null,
    isComplete: false,
  };
}
