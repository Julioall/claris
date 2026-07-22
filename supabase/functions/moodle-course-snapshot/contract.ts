export const MOODLE_COURSE_SNAPSHOT_CONTRACT_VERSION = 2 as const

export type MoodleSnapshotEntity = 'students' | 'activities' | 'grades'
export type MoodleFreshnessState = 'fresh' | 'stale' | 'refreshing' | 'never_synced'

export interface CourseSnapshotData {
  course: {
    category: string | null
    endDate: string | null
    name: string
    observedAt: string | null
    shortName: string | null
    sourceUpdatedAt: string | null
    startDate: string | null
  }
  counts: {
    activities: number
    grades: number
    students: number
  }
}

export interface EntityFreshnessDto {
  entity: MoodleSnapshotEntity
  lastErrorCode: string | null
  lastSuccessfulSyncAt: string | null
  observedAt: string | null
  refreshJobId: string | null
  sourceUpdatedAt: string | null
  staleAt: string | null
  state: MoodleFreshnessState
}

