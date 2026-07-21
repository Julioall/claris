import type { MoodleSession } from '@/features/auth/domain/session';
import { invokeMoodleFunctionWithTimeout } from '@/features/auth/infrastructure/moodle-api';
import {
  ApiClientError,
  invokeEdgeFunction,
} from '@/integrations/http/edge-function-client';

import type {
  ActivityGradeSuggestionJobSummary,
  ActivityGradeSuggestionResponse,
  StudentGradeApprovalResponse,
  StudentGradeSuggestionResponse,
} from '../types';
import {
  GRADE_SUGGESTION_JOBS_CONTRACT_VERSION,
  GRADE_SUGGESTION_JOB_STATUSES,
  type FindLatestRelevantGradeSuggestionJobDto,
  type GradeSuggestionJobSummaryDto,
} from './contracts/grade-suggestion-jobs.contract';

const GRADE_SUGGESTION_JOBS_TIMEOUT_MS = 15_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isJobSummary(value: unknown): value is GradeSuggestionJobSummaryDto {
  const job = asRecord(value);
  if (!job) return false;

  return (
    typeof job.jobId === 'string'
    && typeof job.activityName === 'string'
    && typeof job.courseId === 'string'
    && typeof job.moodleActivityId === 'string'
    && typeof job.createdAt === 'string'
    && (job.errorMessage === null || typeof job.errorMessage === 'string')
    && typeof job.status === 'string'
    && GRADE_SUGGESTION_JOB_STATUSES.includes(
      job.status as (typeof GRADE_SUGGESTION_JOB_STATUSES)[number],
    )
    && isNonNegativeInteger(job.totalItems)
    && isNonNegativeInteger(job.processedItems)
    && isNonNegativeInteger(job.successCount)
    && isNonNegativeInteger(job.errorCount)
    && job.processedItems <= job.totalItems
    && job.successCount + job.errorCount <= job.processedItems
  );
}

function parseFindLatestRelevantResponse(value: unknown): FindLatestRelevantGradeSuggestionJobDto {
  const response = asRecord(value);
  const metadata = asRecord(response?.metadata);
  if (!(
    response
    && (response.job === null || isJobSummary(response.job))
    && metadata
    && metadata.contractVersion === GRADE_SUGGESTION_JOBS_CONTRACT_VERSION
    && typeof metadata.generatedAt === 'string'
  )) {
    throw new ApiClientError({
      code: 'invalid_response',
      message: 'A API retornou um job de sugestao de nota invalido.',
    });
  }

  return response as unknown as FindLatestRelevantGradeSuggestionJobDto;
}

export async function generateStudentGradeSuggestion(params: {
  session: MoodleSession;
  courseId: string;
  studentId: string;
  moodleActivityId: string;
}) {
  return await invokeMoodleFunctionWithTimeout({
    functionName: 'moodle-grade-suggestions',
    timeoutMs: 65000,
    body: {
      action: 'generate_suggestion',
      courseId: params.courseId,
      studentId: params.studentId,
      moodleActivityId: params.moodleActivityId,
      moodleUrl: params.session.moodleUrl,
      token: params.session.moodleToken,
    },
  }) as {
    data: StudentGradeSuggestionResponse | null;
    error: { message: string } | null;
  };
}

export async function generateActivityGradeSuggestions(params: {
  session: MoodleSession;
  courseId: string;
  moodleActivityId: string;
}) {
  return await invokeMoodleFunctionWithTimeout({
    functionName: 'moodle-grade-suggestions',
    timeoutMs: 120000,
    body: {
      action: 'generate_activity_suggestions',
      courseId: params.courseId,
      moodleActivityId: params.moodleActivityId,
      moodleUrl: params.session.moodleUrl,
      token: params.session.moodleToken,
    },
  }) as {
    data: ActivityGradeSuggestionResponse | null;
    error: { message: string } | null;
  };
}

export async function findLatestRelevantActivityGradeSuggestionJob(params: {
  activityId: string;
  courseId: string;
  signal?: AbortSignal;
}): Promise<ActivityGradeSuggestionJobSummary | null> {
  const response = await invokeEdgeFunction<unknown>('grade-suggestion-jobs', {
    auth: 'required',
    body: {
      action: 'find_latest_relevant',
      activityId: params.activityId,
      courseId: params.courseId,
    },
    signal: params.signal,
    timeoutMs: GRADE_SUGGESTION_JOBS_TIMEOUT_MS,
  });

  return parseFindLatestRelevantResponse(response).job;
}

export async function getActivityGradeSuggestionJob(params: {
  session: MoodleSession;
  jobId: string;
}) {
  return await invokeMoodleFunctionWithTimeout({
    functionName: 'moodle-grade-suggestions',
    timeoutMs: 15000,
    body: {
      action: 'get_activity_suggestion_job',
      jobId: params.jobId,
    },
  }) as {
    data: ActivityGradeSuggestionResponse | null;
    error: { message: string } | null;
  };
}

export async function resumeActivityGradeSuggestionJob(params: {
  session: MoodleSession;
  jobId: string;
}) {
  return await invokeMoodleFunctionWithTimeout({
    functionName: 'moodle-grade-suggestions',
    timeoutMs: 15000,
    body: {
      action: 'resume_activity_suggestion_job',
      jobId: params.jobId,
      moodleUrl: params.session.moodleUrl,
      token: params.session.moodleToken,
    },
  }) as {
    data: ActivityGradeSuggestionResponse | null;
    error: { message: string } | null;
  };
}

export async function cancelActivityGradeSuggestionJob(params: {
  jobId: string;
}) {
  return await invokeMoodleFunctionWithTimeout({
    functionName: 'moodle-grade-suggestions',
    timeoutMs: 15000,
    body: {
      action: 'cancel_activity_suggestion_job',
      jobId: params.jobId,
    },
  }) as {
    data: ActivityGradeSuggestionResponse | null;
    error: { message: string } | null;
  };
}

export async function approveStudentGradeSuggestion(params: {
  session: MoodleSession;
  auditId: string;
  approvedGrade: number;
  approvedFeedback: string;
}) {
  return await invokeMoodleFunctionWithTimeout({
    functionName: 'moodle-grade-suggestions',
    timeoutMs: 45000,
    body: {
      action: 'approve_suggestion',
      auditId: params.auditId,
      moodleUrl: params.session.moodleUrl,
      token: params.session.moodleToken,
      approvedGrade: params.approvedGrade,
      approvedFeedback: params.approvedFeedback,
    },
  }) as {
    data: StudentGradeApprovalResponse | null;
    error: { message: string } | null;
  };
}
