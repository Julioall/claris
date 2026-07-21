import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_RISK_LEVELS as backendRiskLevels,
  DASHBOARD_SUMMARY_CONTRACT_VERSION as backendVersion,
  DASHBOARD_WEEK_FILTERS as backendWeekFilters,
  type DashboardSummaryDto as BackendDashboardSummaryDto,
} from '../../../../supabase/functions/dashboard-summary/contract.ts';
import {
  DASHBOARD_RISK_LEVELS as frontendRiskLevels,
  DASHBOARD_SUMMARY_CONTRACT_VERSION as frontendVersion,
  DASHBOARD_WEEK_FILTERS as frontendWeekFilters,
  type DashboardSummaryDto as FrontendDashboardSummaryDto,
} from '@/features/dashboard/api/dashboard-summary.contract';

const contractExample = {
  activitiesToReview: [{
    course: { id: 'course-1', name: 'Curso', shortName: 'CUR' },
    courseId: 'course-1',
    dueAt: '2026-07-21T14:00:00.000Z',
    id: 'activity-1',
    name: 'Avaliacao',
    student: { id: 'student-1', name: 'Ana', riskLevel: 'risco' as const },
    studentId: 'student-1',
    submittedAt: '2026-07-21T13:00:00.000Z',
  }],
  activityFeed: [{
    eventType: 'risk_change',
    id: 'feed-1',
    occurredAt: '2026-07-21T15:00:00.000Z',
    student: { id: 'student-1', name: 'Ana' },
    title: 'Risco atualizado',
  }],
  criticalStudents: [{
    id: 'student-1',
    name: 'Ana',
    riskLevel: 'risco' as const,
    riskReasons: ['Baixo desempenho'],
  }],
  indicators: {
    activeNormalStudents: 10,
    activitiesToReview: 2,
    newAtRiskThisWeek: 1,
    pendingCorrectionAssignments: 2,
    pendingSubmissionAssignments: 3,
    studentsAtRisk: 1,
    todayEvents: 4,
    todayTasks: 5,
  },
  metadata: {
    contractVersion: 1 as const,
    courseId: null,
    dataUpdatedAt: '2026-07-21T15:00:00.000Z',
    generatedAt: '2026-07-21T15:01:00.000Z',
    week: 'current' as const,
  },
} satisfies BackendDashboardSummaryDto & FrontendDashboardSummaryDto;

describe('DashboardSummaryDto contract', () => {
  it('keeps versioned enum values aligned across the HTTP boundary', () => {
    expect(frontendVersion).toBe(backendVersion);
    expect(frontendWeekFilters).toEqual(backendWeekFilters);
    expect(frontendRiskLevels).toEqual(backendRiskLevels);
  });

  it('uses domain names and camelCase without persistence records', () => {
    expect(contractExample).toMatchObject({
      indicators: { studentsAtRisk: 1, todayTasks: 5 },
      criticalStudents: [{ name: 'Ana', riskLevel: 'risco' }],
      metadata: { contractVersion: 1, courseId: null },
    });
    expect(JSON.stringify(contractExample)).not.toMatch(
      /student_activities|student_courses|dashboard_course_activity_aggregates|user_id/,
    );
  });
});
