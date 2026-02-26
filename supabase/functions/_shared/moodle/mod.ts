/**
 * Moodle API integration layer.
 */
export {
  getMoodleToken,
  callMoodleApi,
  callMoodleApiPost,
  getSiteInfo,
  getUserCourses,
  getCategories,
  buildCategoryPath,
  getCourseEnrolledUsers,
  getCourseSuspendedUserIds,
} from './client.ts'

export type {
  MoodleTokenResponse,
  MoodleCourse,
  MoodleCategory,
  MoodleUser,
  MoodleEnrolledUser,
  MoodleSiteInfo,
} from './types.ts'
