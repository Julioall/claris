/**
 * Moodle API integration layer.
 */
export {
  getMoodleToken,
  callMoodleApi,
  callMoodleApiPost,
  getSiteInfo,
  getUserCourses,
  getAllCourses,
  getCategories,
  buildCategoryPath,
  resolveCourseCategoryName,
  getCourseEnrolledUsers,
  getCourseSuspendedUserIds,
  getUserProfilesByIds,
} from './client.ts'

export type {
  MoodleTokenResponse,
  MoodleCourse,
  MoodleCategory,
  MoodleUser,
  MoodleEnrolledUser,
  MoodleUserProfile,
  MoodleSiteInfo,
} from './types.ts'
