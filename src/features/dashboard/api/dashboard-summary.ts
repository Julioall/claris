import {
  ApiClientError,
  invokeEdgeFunction,
} from '@/integrations/http/edge-function-client';

import {
  DASHBOARD_RISK_LEVELS,
  DASHBOARD_SUMMARY_CONTRACT_VERSION,
  DASHBOARD_SUMMARY_TIME_ZONE,
  DASHBOARD_WEEK_FILTERS,
  type DashboardRiskLevelDto,
  type DashboardSummaryDto,
  type DashboardWeekFilterDto,
} from './contracts/dashboard-summary.contract';

const DASHBOARD_SUMMARY_TIMEOUT_MS = 20_000;

export interface GetDashboardSummaryInput {
  courseId?: string;
  week: DashboardWeekFilterDto;
}

const INDICATOR_FIELDS = [
  'activeNormalStudents',
  'activitiesToReview',
  'newAtRiskThisWeek',
  'pendingCorrectionAssignments',
  'pendingSubmissionAssignments',
  'studentsAtRisk',
  'todayEvents',
  'todayTasks',
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isRiskLevel(value: unknown): value is DashboardRiskLevelDto {
  return typeof value === 'string'
    && DASHBOARD_RISK_LEVELS.includes(value as DashboardRiskLevelDto);
}

function isCriticalStudent(value: unknown): boolean {
  const student = asRecord(value);
  return Boolean(
    student
    && typeof student.id === 'string'
    && typeof student.name === 'string'
    && isRiskLevel(student.riskLevel)
    && Array.isArray(student.riskReasons)
    && student.riskReasons.every((reason) => typeof reason === 'string')
    && isOptionalString(student.avatarUrl)
    && isOptionalString(student.lastAccessAt)
    && isOptionalString(student.updatedAt),
  );
}

function isReviewActivity(value: unknown): boolean {
  const activity = asRecord(value);
  const student = asRecord(activity?.student);
  const course = asRecord(activity?.course);
  return Boolean(
    activity
    && typeof activity.id === 'string'
    && typeof activity.name === 'string'
    && typeof activity.studentId === 'string'
    && typeof activity.courseId === 'string'
    && isOptionalString(activity.dueAt)
    && isOptionalString(activity.submittedAt)
    && student
    && typeof student.id === 'string'
    && typeof student.name === 'string'
    && isRiskLevel(student.riskLevel)
    && course
    && typeof course.id === 'string'
    && typeof course.name === 'string'
    && isOptionalString(course.shortName),
  );
}

function isActivityFeedItem(value: unknown): boolean {
  const item = asRecord(value);
  const student = item?.student === undefined ? null : asRecord(item.student);
  return Boolean(
    item
    && typeof item.id === 'string'
    && typeof item.eventType === 'string'
    && typeof item.title === 'string'
    && typeof item.occurredAt === 'string'
    && isOptionalString(item.description)
    && isOptionalString(item.courseId)
    && isOptionalString(item.studentId)
    && (item.student === undefined || (
      student
      && typeof student.id === 'string'
      && typeof student.name === 'string'
    )),
  );
}

function parseDashboardSummary(value: unknown): DashboardSummaryDto {
  const summary = asRecord(value);
  const indicators = asRecord(summary?.indicators);
  const metadata = asRecord(summary?.metadata);
  const valid = Boolean(
    summary
    && indicators
    && INDICATOR_FIELDS.every((field) => (
      typeof indicators[field] === 'number'
      && Number.isInteger(indicators[field])
      && (indicators[field] as number) >= 0
    ))
    && Array.isArray(summary.criticalStudents)
    && summary.criticalStudents.every(isCriticalStudent)
    && Array.isArray(summary.activitiesToReview)
    && summary.activitiesToReview.every(isReviewActivity)
    && Array.isArray(summary.activityFeed)
    && summary.activityFeed.every(isActivityFeedItem)
    && metadata
    && metadata.contractVersion === DASHBOARD_SUMMARY_CONTRACT_VERSION
    && metadata.timeZone === DASHBOARD_SUMMARY_TIME_ZONE
    && typeof metadata.appliedCourseCount === 'number'
    && Number.isInteger(metadata.appliedCourseCount)
    && metadata.appliedCourseCount >= 0
    && (metadata.courseId === null || typeof metadata.courseId === 'string')
    && (metadata.dataUpdatedAt === null || typeof metadata.dataUpdatedAt === 'string')
    && typeof metadata.generatedAt === 'string'
    && typeof metadata.week === 'string'
    && DASHBOARD_WEEK_FILTERS.includes(metadata.week as DashboardWeekFilterDto)
    && typeof metadata.weekStartsAt === 'string'
    && typeof metadata.weekEndsAt === 'string',
  );

  if (!valid) {
    throw new ApiClientError({
      code: 'invalid_response',
      message: 'A API retornou um dashboard invalido.',
    });
  }

  return summary as unknown as DashboardSummaryDto;
}

export async function getDashboardSummary(
  input: GetDashboardSummaryInput,
  signal?: AbortSignal,
): Promise<DashboardSummaryDto> {
  const response = await invokeEdgeFunction<unknown>('dashboard-summary', {
    auth: 'required',
    body: {
      action: 'get_summary',
      week: input.week,
      ...(input.courseId ? { courseId: input.courseId } : {}),
    },
    signal,
    timeoutMs: DASHBOARD_SUMMARY_TIMEOUT_MS,
  });

  return parseDashboardSummary(response);
}
