/**
 * Session data storage using plain JSON in sessionStorage.
 * 
 * SessionStorage is already origin-scoped and cleared on tab close,
 * providing adequate protection for session data. Client-side encryption
 * with keys embedded in the JS bundle provides no real security benefit.
 */

const SESSION_PREFIX = 'v2:';

export async function encryptSessionData(data: unknown): Promise<string> {
  return SESSION_PREFIX + JSON.stringify(data);
}

export async function decryptSessionData<T = unknown>(encoded: string): Promise<T | null> {
  try {
    // Handle v2 format (plain JSON)
    if (encoded.startsWith(SESSION_PREFIX)) {
      return JSON.parse(encoded.slice(SESSION_PREFIX.length)) as T;
    }
    // Handle legacy encrypted format - force re-login
    if (encoded.startsWith('enc:')) {
      console.warn('Legacy encrypted session detected, clearing storage');
      return null;
    }
    // Handle legacy base64 format
    return JSON.parse(decodeURIComponent(atob(encoded))) as T;
  } catch {
    console.warn('Failed to parse session data, clearing storage');
    return null;
  }
}
