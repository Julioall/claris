const STORAGE_PREFIX = 'claris:selected-moodle-connection';

function key(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function loadSelectedMoodleConnectionId(userId: string): string | null {
  return sessionStorage.getItem(key(userId));
}

export function saveSelectedMoodleConnectionId(
  userId: string,
  connectionId: string | null,
): void {
  if (connectionId) sessionStorage.setItem(key(userId), connectionId);
  else sessionStorage.removeItem(key(userId));
}

export function reconcileSelectedMoodleConnectionId(
  userId: string,
  availableConnectionIds: readonly string[],
): string | null {
  const selected = loadSelectedMoodleConnectionId(userId);
  if (selected && availableConnectionIds.includes(selected)) return selected;
  saveSelectedMoodleConnectionId(userId, null);
  return null;
}
