export type StudentActivityWorkflowStatus =
  | 'corrected'
  | 'pending_correction'
  | 'completed'
  | 'pending_submission';

export interface StudentActivityStatusLike {
  activity_type?: string | null;
  completed_at?: string | null;
  grade?: number | null;
  grade_max?: number | null;
  graded_at?: string | null;
  percentage?: number | null;
  status?: string | null;
  submitted_at?: string | null;
}

const CORRECTED_STATUSES = new Set(['graded']);
const SUBMITTED_STATUSES = new Set(['submitted']);
const COMPLETED_STATUSES = new Set([
  'completed',
  'complete_pass',
  'complete_fail',
  'concluida',
  'finalizada',
]);
const ASSIGNMENT_ACTIVITY_TYPES = new Set(['assign', 'assignment']);

function normalizeText(value: string | null | undefined) {
  return (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isAssignmentLike(activityType: string | null | undefined) {
  return ASSIGNMENT_ACTIVITY_TYPES.has(normalizeText(activityType));
}

export function isStudentActivityWeightedInGradebook(activity: StudentActivityStatusLike) {
  return (
    (activity.grade_max ?? 0) > 0 ||
    (activity.grade !== null && activity.grade !== undefined) ||
    (activity.percentage !== null && activity.percentage !== undefined)
  );
}

export function getStudentActivityWorkflowStatus(
  activity: StudentActivityStatusLike,
): StudentActivityWorkflowStatus {
  const normalizedStatus = normalizeText(activity.status);

  const isCorrected = (
    activity.grade !== null && activity.grade !== undefined
  ) || Boolean(activity.graded_at) || CORRECTED_STATUSES.has(normalizedStatus);

  if (isCorrected) {
    return 'corrected';
  }

  const hasCompletionEvidence = Boolean(activity.completed_at) || COMPLETED_STATUSES.has(normalizedStatus);
  const hasSubmittedEvidence = (
    Boolean(activity.submitted_at) ||
    SUBMITTED_STATUSES.has(normalizedStatus) ||
    (isAssignmentLike(activity.activity_type) && hasCompletionEvidence)
  );

  if (hasSubmittedEvidence) {
    return 'pending_correction';
  }

  if (hasCompletionEvidence) {
    return 'completed';
  }

  return 'pending_submission';
}

export function isStudentActivityPendingSubmission(activity: StudentActivityStatusLike) {
  return getStudentActivityWorkflowStatus(activity) === 'pending_submission';
}

export function isStudentActivityPendingCorrection(activity: StudentActivityStatusLike) {
  return getStudentActivityWorkflowStatus(activity) === 'pending_correction';
}

export function isStudentActivityCorrected(activity: StudentActivityStatusLike) {
  return getStudentActivityWorkflowStatus(activity) === 'corrected';
}
