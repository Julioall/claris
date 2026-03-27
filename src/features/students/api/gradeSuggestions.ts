import type { MoodleSession } from '@/features/auth/domain/session';
import { invokeMoodleFunctionWithTimeout } from '@/features/auth/infrastructure/moodle-api';

import type {
  StudentGradeApprovalResponse,
  StudentGradeSuggestionResponse,
} from '../types';

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
