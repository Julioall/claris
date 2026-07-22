import {
  fetchMoodleCourseStudentCounts,
  fetchMoodleSyncPreferences,
  saveMoodleSyncPreferences,
} from '@/features/auth/api/moodle-sync-jobs';

export interface SyncPreferences {
  selectedKeys: string[];
  includeEmptyCourses: boolean;
  includeFinished: boolean;
}

export async function fetchStudentCountsByCourseIds(
  connectionId: string,
  courseIds: string[],
): Promise<Map<string, number>> {
  if (courseIds.length === 0) return new Map();
  return await fetchMoodleCourseStudentCounts(connectionId, [...new Set(courseIds)]);
}

export async function fetchUserSyncPreferences(connectionId: string): Promise<SyncPreferences | null> {
  const preferences = await fetchMoodleSyncPreferences(connectionId);
  return {
    selectedKeys: preferences.selectedKeys,
    includeEmptyCourses: preferences.includeEmptyCourses,
    includeFinished: preferences.includeFinished,
  };
}

export async function saveUserSyncPreferences(
  connectionId: string,
  prefs: SyncPreferences,
): Promise<void> {
  await saveMoodleSyncPreferences({ connectionId, ...prefs });
}
