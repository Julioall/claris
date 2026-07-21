export const DASHBOARD_SUMMARY_CONTRACT_VERSION = 1 as const
export const DASHBOARD_SUMMARY_TIME_ZONE = 'America/Sao_Paulo' as const

export const DASHBOARD_WEEK_FILTERS = ['current', 'last'] as const
export const DASHBOARD_RISK_LEVELS = [
  'normal',
  'atencao',
  'risco',
  'critico',
  'inativo',
] as const

export type DashboardWeekFilterDto = typeof DASHBOARD_WEEK_FILTERS[number]
export type DashboardRiskLevelDto = typeof DASHBOARD_RISK_LEVELS[number]

export interface DashboardIndicatorsDto {
  activeNormalStudents: number
  activitiesToReview: number
  newAtRiskThisWeek: number
  pendingCorrectionAssignments: number
  pendingSubmissionAssignments: number
  studentsAtRisk: number
  todayEvents: number
  todayTasks: number
}

export interface DashboardCriticalStudentDto {
  avatarUrl?: string
  id: string
  lastAccessAt?: string
  name: string
  riskLevel: DashboardRiskLevelDto
  riskReasons: string[]
  updatedAt?: string
}

export interface DashboardReviewActivityDto {
  course: {
    id: string
    name: string
    shortName?: string
  }
  courseId: string
  dueAt?: string
  id: string
  name: string
  student: {
    id: string
    name: string
    riskLevel: DashboardRiskLevelDto
  }
  studentId: string
  submittedAt?: string
}

export interface DashboardActivityFeedItemDto {
  courseId?: string
  description?: string
  eventType: string
  id: string
  metadata?: Record<string, unknown>
  occurredAt: string
  student?: {
    id: string
    name: string
  }
  studentId?: string
  title: string
}

export interface DashboardSummaryDto {
  activitiesToReview: DashboardReviewActivityDto[]
  activityFeed: DashboardActivityFeedItemDto[]
  criticalStudents: DashboardCriticalStudentDto[]
  indicators: DashboardIndicatorsDto
  metadata: {
    contractVersion: typeof DASHBOARD_SUMMARY_CONTRACT_VERSION
    appliedCourseCount: number
    courseId: string | null
    dataUpdatedAt: string | null
    generatedAt: string
    timeZone: typeof DASHBOARD_SUMMARY_TIME_ZONE
    week: DashboardWeekFilterDto
    weekEndsAt: string
    weekStartsAt: string
  }
}
