/**
 * Authentication utilities.
 */
export { getAuthenticatedUser } from './user.ts'
export {
  isApplicationAdmin,
  listAccessibleCourseIds,
  userHasCourseAccess,
  userHasPermission,
} from './permissions.ts'
export type { AuthUser } from './user.ts'
