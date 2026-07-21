import { ApiError } from '../_shared/http/mod.ts'
import {
  GRADE_SUGGESTION_JOBS_CONTRACT_VERSION,
  type FindLatestRelevantGradeSuggestionJobDto,
} from './contract.ts'
import type { GradeSuggestionJobsPayload } from './payload.ts'
import type { GradeSuggestionJobsRepository } from './repository.ts'

export async function authorizeGradeSuggestionJobsAction(
  repository: GradeSuggestionJobsRepository,
  userId: string,
  payload: GradeSuggestionJobsPayload,
): Promise<boolean> {
  const [hasPermission, hasCourseAccess] = await Promise.all([
    repository.userCanManageGradeSuggestions(userId),
    repository.userCanAccessCourse(userId, payload.courseId),
  ])
  return hasPermission && hasCourseAccess
}

export async function findLatestRelevantGradeSuggestionJob(
  repository: GradeSuggestionJobsRepository,
  userId: string,
  payload: GradeSuggestionJobsPayload,
  now = new Date(),
): Promise<FindLatestRelevantGradeSuggestionJobDto> {
  const moodleActivityId = await repository.findMoodleActivityId({
    activityId: payload.activityId,
    courseId: payload.courseId,
  })
  if (!moodleActivityId) throw ApiError.notFound('Course activity not found')

  return {
    job: await repository.findLatestRelevant({
      courseId: payload.courseId,
      moodleActivityId,
      userId,
    }),
    metadata: {
      contractVersion: GRADE_SUGGESTION_JOBS_CONTRACT_VERSION,
      generatedAt: now.toISOString(),
    },
  }
}
