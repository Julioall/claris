import {
  ApiClientError,
  invokeEdgeFunction,
} from '@/integrations/http/edge-function-client';

import {
  COURSE_PANEL_CONTRACT_VERSION,
  COURSE_PANEL_LIFECYCLES,
  COURSE_PANEL_RISK_LEVELS,
  COURSE_PANEL_WORKFLOW_STATUSES,
  type CoursePanelDto,
  type CoursePanelLifecycleDto,
  type CoursePanelRiskLevelDto,
  type CoursePanelWorkflowStatusDto,
  type SetCourseActivityVisibilityDto,
} from './contracts/course-panel.contract';

const COURSE_PANEL_TIMEOUT_MS = 20_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isLifecycle(value: unknown): value is CoursePanelLifecycleDto {
  return typeof value === 'string'
    && COURSE_PANEL_LIFECYCLES.includes(value as CoursePanelLifecycleDto);
}

function isRiskLevel(value: unknown): value is CoursePanelRiskLevelDto {
  return typeof value === 'string'
    && COURSE_PANEL_RISK_LEVELS.includes(value as CoursePanelRiskLevelDto);
}

function isWorkflowStatus(value: unknown): value is CoursePanelWorkflowStatusDto {
  return typeof value === 'string'
    && COURSE_PANEL_WORKFLOW_STATUSES.includes(value as CoursePanelWorkflowStatusDto);
}

function hasVersionedMetadata(value: unknown, withDataTimestamp = false): boolean {
  const metadata = asRecord(value);
  return Boolean(
    metadata
    && metadata.contractVersion === COURSE_PANEL_CONTRACT_VERSION
    && typeof metadata.generatedAt === 'string'
    && (!withDataTimestamp || isNullableString(metadata.dataUpdatedAt)),
  );
}

function isCourse(value: unknown): boolean {
  const course = asRecord(value);
  return Boolean(
    course
    && typeof course.id === 'string'
    && typeof course.moodleCourseId === 'string'
    && typeof course.name === 'string'
    && isNullableString(course.shortName)
    && isNullableString(course.category)
    && isNullableString(course.startsAt)
    && isNullableString(course.endsAt)
    && isNullableString(course.effectiveEndsAt)
    && isNullableString(course.lastSyncedAt)
    && isLifecycle(course.lifecycle),
  );
}

function isStudent(value: unknown): boolean {
  const student = asRecord(value);
  return Boolean(
    student
    && typeof student.id === 'string'
    && typeof student.name === 'string'
    && isNullableString(student.email)
    && isNullableString(student.avatarUrl)
    && isNullableString(student.enrollmentStatus)
    && isNullableString(student.lastAccessAt)
    && isRiskLevel(student.riskLevel),
  );
}

function isSubmission(value: unknown): boolean {
  const submission = asRecord(value);
  return Boolean(
    submission
    && typeof submission.id === 'string'
    && typeof submission.studentId === 'string'
    && isNullableNumber(submission.grade)
    && isNullableNumber(submission.gradeMax)
    && isNullableNumber(submission.percentage)
    && isNullableString(submission.completedAt)
    && isNullableString(submission.submittedAt)
    && isNullableString(submission.gradedAt)
    && isWorkflowStatus(submission.workflowStatus),
  );
}

function isSubmissionCounts(value: unknown): boolean {
  const counts = asRecord(value);
  return Boolean(
    counts
    && isNonNegativeInteger(counts.total)
    && isNonNegativeInteger(counts.pendingSubmission)
    && isNonNegativeInteger(counts.pendingCorrection)
    && isNonNegativeInteger(counts.completed)
    && isNonNegativeInteger(counts.corrected)
    && counts.total === (
      (counts.pendingSubmission as number)
      + (counts.pendingCorrection as number)
      + (counts.completed as number)
      + (counts.corrected as number)
    ),
  );
}

function isActivity(value: unknown): boolean {
  const activity = asRecord(value);
  return Boolean(
    activity
    && typeof activity.id === 'string'
    && typeof activity.courseId === 'string'
    && typeof activity.moodleActivityId === 'string'
    && typeof activity.name === 'string'
    && isNullableString(activity.type)
    && isNullableString(activity.dueAt)
    && typeof activity.hidden === 'boolean'
    && typeof activity.isAssignment === 'boolean'
    && isSubmissionCounts(activity.submissionCounts)
    && Array.isArray(activity.submissions)
    && activity.submissions.every(isSubmission),
  );
}

function isStats(value: unknown): boolean {
  const stats = asRecord(value);
  const distribution = asRecord(stats?.riskDistribution);
  return Boolean(
    stats
    && isNonNegativeInteger(stats.totalStudents)
    && isNonNegativeInteger(stats.atRiskStudents)
    && isNonNegativeInteger(stats.totalActivities)
    && typeof stats.completionRate === 'number'
    && Number.isFinite(stats.completionRate)
    && stats.completionRate >= 0
    && stats.completionRate <= 100
    && distribution
    && isNonNegativeInteger(distribution.normal)
    && isNonNegativeInteger(distribution.atencao)
    && isNonNegativeInteger(distribution.risco)
    && isNonNegativeInteger(distribution.critico),
  );
}

function invalidResponse(): never {
  throw new ApiClientError({
    code: 'invalid_response',
    message: 'A API retornou um painel de curso invalido.',
  });
}

function parsePanel(value: unknown): CoursePanelDto {
  const panel = asRecord(value);
  if (!(
    panel
    && isCourse(panel.course)
    && Array.isArray(panel.students)
    && panel.students.every(isStudent)
    && Array.isArray(panel.activities)
    && panel.activities.every(isActivity)
    && isStats(panel.stats)
    && typeof panel.attendanceEnabled === 'boolean'
    && hasVersionedMetadata(panel.metadata, true)
  )) invalidResponse();

  return panel as unknown as CoursePanelDto;
}

function parseVisibilityResult(value: unknown): SetCourseActivityVisibilityDto {
  const result = asRecord(value);
  if (!(
    result
    && typeof result.courseId === 'string'
    && typeof result.moodleActivityId === 'string'
    && typeof result.hidden === 'boolean'
    && isNonNegativeInteger(result.updatedCount)
    && hasVersionedMetadata(result.metadata)
  )) invalidResponse();

  return result as unknown as SetCourseActivityVisibilityDto;
}

export async function getCoursePanel(
  courseId: string,
  signal?: AbortSignal,
): Promise<CoursePanelDto> {
  const response = await invokeEdgeFunction<unknown>('course-panel', {
    auth: 'required',
    body: { action: 'get_panel', courseId },
    signal,
    timeoutMs: COURSE_PANEL_TIMEOUT_MS,
  });
  return parsePanel(response);
}

export async function setCourseActivityVisibility(
  courseId: string,
  moodleActivityId: string,
  hidden: boolean,
  signal?: AbortSignal,
): Promise<SetCourseActivityVisibilityDto> {
  const response = await invokeEdgeFunction<unknown>('course-panel', {
    auth: 'required',
    body: {
      action: 'set_activity_visibility',
      courseId,
      hidden,
      moodleActivityId,
    },
    signal,
    timeoutMs: COURSE_PANEL_TIMEOUT_MS,
  });
  return parseVisibilityResult(response);
}
