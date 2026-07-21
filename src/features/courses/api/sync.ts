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

export async function fetchStudentCountsByCourseIds(courseIds: string[]): Promise<Map<string, number>> {
  if (courseIds.length === 0) return new Map();
  return await fetchMoodleCourseStudentCounts([...new Set(courseIds)]);
}

export async function fetchUserSyncPreferences(): Promise<SyncPreferences | null> {
  const preferences = await fetchMoodleSyncPreferences();
  return {
    selectedKeys: preferences.selectedKeys,
    includeEmptyCourses: preferences.includeEmptyCourses,
    includeFinished: preferences.includeFinished,
  };
}

export async function saveUserSyncPreferences(prefs: SyncPreferences): Promise<void> {
  await saveMoodleSyncPreferences(prefs);
}
