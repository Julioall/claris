import type { User } from '@/features/auth/types';

export type MoodleSource = 'goias' | 'nacional';

export interface MoodleSession {
  moodleToken: string;
  moodleUserId: number;
  moodleUrl: string;
  moodleSource: MoodleSource;
}

export type MoodleSessionMap = Partial<Record<MoodleSource, MoodleSession>>;

export interface StoredSession {
  user: User;
  moodleSessions: MoodleSessionMap | null;
  /** @deprecated Use moodleSessions instead. Kept for forward-compat reads of old stored data. */
  moodleSession?: MoodleSession | null;
}

export interface SessionContext {
  user: User;
  sessions: MoodleSessionMap;
}

export const AUTH_STORAGE_KEY = 'session';

export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error) return false;

  const message = String((error as { message?: string })?.message || error).toLowerCase();
  return message.includes('invalid refresh token') || message.includes('refresh token not found');
}

export function getPrimaryMoodleSession(sessions: MoodleSessionMap | null | undefined): MoodleSession | null {
  if (!sessions) return null;
  return sessions.goias ?? sessions.nacional ?? null;
}
