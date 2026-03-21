import type { User } from '@/types';

export interface MoodleSession {
  moodleToken: string;
  moodleUserId: number;
  moodleUrl: string;
}

export interface StoredSession {
  user: User;
  moodleSession: MoodleSession | null;
}

export interface SessionContext {
  user: User;
  session: MoodleSession;
}

export const AUTH_STORAGE_KEY = 'session';

export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error) return false;

  const message = String((error as { message?: string })?.message || error).toLowerCase();
  return message.includes('invalid refresh token') || message.includes('refresh token not found');
}
