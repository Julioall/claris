import type { MoodleSession } from '@/features/auth/domain/session';
import { invokeMoodleFunctionWithTimeout } from '@/features/auth/infrastructure/moodle-api';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

import type {
  ActivityGradeSuggestionJobSummary,
  ActivityGradeSuggestionResponse,
  StudentGradeApprovalResponse,
  StudentGradeSuggestionResponse,
} from '../types';

type ActivityGradeSuggestionJobRow = Database['public']['Tables']['ai_grade_suggestion_jobs']['Row'];

function mapActivityGradeSuggestionJobSummary(row: ActivityGradeSuggestionJobRow): ActivityGradeSuggestionJobSummary {
  return {
    jobId: row.id,
    activityName: row.activity_name,
    courseId: row.course_id,
    moodleActivityId: row.moodle_activity_id,
    status: row.status,
    totalItems: row.total_items,
    processedItems: row.processed_items,
    successCount: row.success_count,
    errorCount: row.error_count,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

function isRelevantActivityGradeSuggestionJob(job: ActivityGradeSuggestionJobSummary) {
  return (
    job.status === 'pending' ||
    job.status === 'processing' ||
    job.processedItems > 0
  );
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

export async function listActiveActivityGradeSuggestionJobsForUser(
  userId: string,
): Promise<ActivityGradeSuggestionJobSummary[]> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_jobs')
    .select(`
      id,
      activity_name,
      course_id,
      moodle_activity_id,
      status,
      total_items,
      processed_items,
      success_count,
      error_count,
      error_message,
      created_at
    `)
    .eq('user_id', userId)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data || []) as ActivityGradeSuggestionJobRow[]).map(mapActivityGradeSuggestionJobSummary);
}

export async function findLatestRelevantActivityGradeSuggestionJob(params: {
  userId: string;
  courseId: string;
  moodleActivityId: string;
}): Promise<ActivityGradeSuggestionJobSummary | null> {
  const { data, error } = await supabase
    .from('ai_grade_suggestion_jobs')
    .select(`
      id,
      activity_name,
      course_id,
      moodle_activity_id,
      status,
      total_items,
      processed_items,
      success_count,
      error_count,
      error_message,
      created_at
    `)
    .eq('user_id', params.userId)
    .eq('course_id', params.courseId)
    .eq('moodle_activity_id', params.moodleActivityId)
    .in('status', ['pending', 'processing', 'failed', 'completed'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw error;

  const jobs = ((data || []) as ActivityGradeSuggestionJobRow[]).map(mapActivityGradeSuggestionJobSummary);
  return jobs.find(isRelevantActivityGradeSuggestionJob) ?? null;
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
