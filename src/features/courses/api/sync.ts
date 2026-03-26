import { supabase } from '@/integrations/supabase/client';

export interface SyncPreferences {
  selectedKeys: string[];
  includeEmptyCourses: boolean;
  includeFinished: boolean;
}

export async function fetchStudentCountsByCourseIds(courseIds: string[]) {
  const counts = new Map<string, number>();
  const batchSize = 200;

  for (let index = 0; index < courseIds.length; index += batchSize) {
    const batch = courseIds.slice(index, index + batchSize);
    const { data, error } = await supabase
      .from('student_courses')
      .select('course_id')
      .in('course_id', batch);

    if (error) {
      throw error;
    }

    data?.forEach((row) => {
      counts.set(row.course_id, (counts.get(row.course_id) ?? 0) + 1);
    });
  }

  return counts;
}

export async function fetchUserSyncPreferences(userId: string): Promise<SyncPreferences | null> {
  const { data, error } = await supabase
    .from('user_sync_preferences')
    .select('selected_keys, include_empty_courses, include_finished')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    selectedKeys: data.selected_keys ?? [],
    includeEmptyCourses: data.include_empty_courses,
    includeFinished: data.include_finished,
  };
}

export async function saveUserSyncPreferences(userId: string, prefs: SyncPreferences) {
  return supabase
    .from('user_sync_preferences')
    .upsert(
      {
        user_id: userId,
        selected_keys: prefs.selectedKeys,
        include_empty_courses: prefs.includeEmptyCourses,
        include_finished: prefs.includeFinished,
      },
      { onConflict: 'user_id' },
    );
}
