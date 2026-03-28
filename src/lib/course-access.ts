import { supabase } from '@/integrations/supabase/client';

export async function listAccessibleCourseIds(userId: string, roleFilter?: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('list_accessible_course_ids' as never, {
    p_user_id: userId,
    p_role_filter: roleFilter ?? null,
  } as never);

  if (error) throw error;

  return ((data ?? []) as Array<{ course_id?: string | null }>)
    .map((row) => row.course_id)
    .filter((courseId): courseId is string => typeof courseId === 'string' && courseId.length > 0);
}
