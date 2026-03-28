import type { AppSupabaseClient } from '../db/mod.ts'

export async function isApplicationAdmin(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_user_application_admin', {
    p_user_id: userId,
  } as never)

  if (error) throw error
  return data === true
}

export async function userHasPermission(
  supabase: AppSupabaseClient,
  userId: string,
  permissionKey: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('user_has_permission', {
    p_user_id: userId,
    p_permission_key: permissionKey,
  } as never)

  if (error) throw error
  return data === true
}

export async function userHasCourseAccess(
  supabase: AppSupabaseClient,
  userId: string,
  courseId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('user_has_course_access', {
    p_user_id: userId,
    p_course_id: courseId,
  } as never)

  if (error) throw error
  return data === true
}

export async function listAccessibleCourseIds(
  supabase: AppSupabaseClient,
  userId: string,
  roleFilter?: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc('list_accessible_course_ids', {
    p_user_id: userId,
    p_role_filter: roleFilter ?? null,
  } as never)

  if (error) throw error

  return ((data ?? []) as Array<{ course_id?: string | null }>)
    .map((row) => row.course_id)
    .filter((courseId): courseId is string => typeof courseId === 'string' && courseId.length > 0)
}
