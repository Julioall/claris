const STORAGE_PREFIX = 'claris:selected-moodle-connection';
const MOODLE_CHAT_CACHE_STORAGE_PREFIX = 'claris_moodle_chat_cache:';
const COURSE_AUTO_SYNC_STORAGE_PREFIX = 'claris:course-auto-sync:';

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

/**
 * Removes browser-session state that belongs to one Claris account.
 *
 * Data is namespaced by account so a second account cannot load it, but an
 * explicit logout must also remove it from the shared browser session. This
 * keeps private Moodle chat/cache data out of a subsequent session on the
 * same device.
 */
export function clearClarisAccountSessionState(userId: string): void {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId || typeof sessionStorage === 'undefined') return;

  const chatPrefix = `${MOODLE_CHAT_CACHE_STORAGE_PREFIX}${encodeURIComponent(`${normalizedUserId}:`)}`;
  const prefixes = [
    key(normalizedUserId),
    chatPrefix,
    `${COURSE_AUTO_SYNC_STORAGE_PREFIX}${normalizedUserId}:`,
  ];

  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const storageKey = sessionStorage.key(index);
      if (storageKey && prefixes.some((prefix) => storageKey.startsWith(prefix))) {
        sessionStorage.removeItem(storageKey);
      }
    }
  } catch {
    // Browser storage can be unavailable in restricted contexts. Auth logout
    // still clears in-memory state and the Supabase browser session.
  }
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
