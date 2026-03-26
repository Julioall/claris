import { decryptSessionData, encryptSessionData } from '@/lib/session-crypto';

import { AUTH_STORAGE_KEY, type StoredSession } from '../domain/session';

export async function loadStoredSession(): Promise<StoredSession | null> {
  try {
    const stored = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;

    const decoded = await decryptSessionData<StoredSession>(stored);
    if (!decoded?.user) {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    return {
      user: decoded.user,
      moodleSession: decoded.moodleSession ?? null,
    };
  } catch {
    console.error('Error loading session');
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export async function saveStoredSession(session: StoredSession | null): Promise<void> {
  if (!session?.user) {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }

  const encoded = await encryptSessionData(session);
  sessionStorage.setItem(AUTH_STORAGE_KEY, encoded);
}

export function clearStoredSession() {
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}
