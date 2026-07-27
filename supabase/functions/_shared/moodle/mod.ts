/**
 * Moodle API integration layer.
 */
export {
  getMoodleToken,
  callMoodleApi,
  callMoodleApiPost,
  getSiteInfo,
  getUserCourses,
  getCourseUpdatesSince,
  getCategories,
  buildCategoryPath,
  resolveCourseCategoryName,
  getCourseEnrolledUsers,
  getCourseSuspendedUserIds,
  getUserProfilesByIds,
  MoodleApiError,
} from './client.ts'

export {
  combineMoodleApiTelemetry,
  type MoodleApiAttemptMetric,
  type MoodleApiErrorCategory,
  type MoodleApiTelemetry,
} from './client.ts'
export { normalizeApprovedMoodleBaseUrl } from './site-url.ts'

export type {
  MoodleTokenResponse,
  MoodleCourse,
  MoodleCategory,
  MoodleUser,
  MoodleEnrolledUser,
  MoodleUserProfile,
  MoodleSiteInfo,
  MoodleCourseUpdatesSince,
} from './types.ts'
