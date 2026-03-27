import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';
import type { User } from '@/features/auth/types';
import { toast } from '@/hooks/use-toast';
import { resolveFunctionsInvokeErrorMessage } from '@/lib/moodle-errors';
import { trackEvent } from '@/lib/tracking';

import { isInvalidRefreshTokenError, type MoodleSession, type SessionContext } from '../domain/session';
import { authenticateMoodleUser } from '../infrastructure/moodle-api';
import { clearStoredSession, loadStoredSession, saveStoredSession } from '../infrastructure/session-storage';

export interface UseAuthSessionResult {
  user: User | null;
  moodleSession: MoodleSession | null;
  isLoading: boolean;
  lastSync: string | null;
  setLastSync: (value: string | null) => void;
  login: (
    username: string,
    password: string,
    moodleUrl: string,
    service?: string,
    options?: {
      backgroundReauthEnabled?: boolean;
    },
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  clearInvalidSession: () => Promise<void>;
  resolveSessionContext: () => Promise<SessionContext | null>;
}

export function useAuthSession(): UseAuthSessionResult {
  const [user, setUser] = useState<User | null>(null);
  const [moodleSession, setMoodleSession] = useState<MoodleSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSyncState, setLastSyncState] = useState<string | null>(null);

  const applyLocalSnapshot = useCallback((nextUser: User | null, nextSession: MoodleSession | null) => {
    setUser(nextUser);
    setMoodleSession(nextSession);
    setLastSyncState(nextUser?.last_sync || null);
  }, []);

  const persistSnapshot = useCallback(async (nextUser: User | null, nextSession: MoodleSession | null) => {
    await saveStoredSession(nextUser ? { user: nextUser, moodleSession: nextSession } : null);
  }, []);

  const resetAuthState = useCallback(() => {
    applyLocalSnapshot(null, null);
    clearStoredSession();
  }, [applyLocalSnapshot]);

  const hydrateFromStorage = useCallback(async () => {
    const stored = await loadStoredSession();
    if (!stored) return;
    applyLocalSnapshot(stored.user, stored.moodleSession);
  }, [applyLocalSnapshot]);

  useEffect(() => {
    const handleInvalidRefreshToken = async () => {
      resetAuthState();
      await supabase.auth.signOut({ scope: 'local' });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        resetAuthState();
        setIsLoading(false);
        return;
      }

      if (session?.user) {
        void hydrateFromStorage().finally(() => setIsLoading(false));
        return;
      }

      setIsLoading(false);
    });

    const initializeSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error && isInvalidRefreshTokenError(error)) {
          await handleInvalidRefreshToken();
          setIsLoading(false);
          return;
        }

        if (session?.user) {
          await hydrateFromStorage();
        }
      } catch (error) {
        if (isInvalidRefreshTokenError(error)) {
          await handleInvalidRefreshToken();
        }
      } finally {
        setIsLoading(false);
      }
    };

    void initializeSession();

    return () => subscription.unsubscribe();
  }, [hydrateFromStorage, resetAuthState]);

  const setLastSync = useCallback((value: string | null) => {
    setLastSyncState(value);
    setUser((currentUser) => {
      if (!currentUser) return currentUser;

      const nextUser = {
        ...currentUser,
        last_sync: value || undefined,
      };

      void persistSnapshot(nextUser, moodleSession);
      return nextUser;
    });
  }, [moodleSession, persistSnapshot]);

  const login = useCallback(async (
    username: string,
    password: string,
    moodleUrl: string,
    service = 'moodle_mobile_app',
    options?: {
      backgroundReauthEnabled?: boolean;
    },
  ): Promise<boolean> => {
    setIsLoading(true);

    try {
      const authParams = {
        username,
        password,
        moodleUrl,
        service,
        ...(typeof options?.backgroundReauthEnabled === 'boolean'
          ? { backgroundReauthEnabled: options.backgroundReauthEnabled }
          : {}),
      };
      const result = await authenticateMoodleUser(authParams);
      if (!result.success) {
        toast({
          title: 'Erro de autenticacao',
          description: result.error,
          variant: 'destructive',
        });
        return false;
      }

      if (result.supabaseSession) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.supabaseSession.access_token,
          refresh_token: result.supabaseSession.refresh_token,
        });

        if (sessionError) {
          console.error('Error setting auth session:', sessionError);
        }
      }

      applyLocalSnapshot(result.user, result.moodleSession);
      await persistSnapshot(result.user, result.moodleSession);

      const offlineNote = result.offlineMode ? ' (modo offline)' : '';
      toast({
        title: 'Login realizado com sucesso',
        description: result.backgroundReauthError
          ? `Bem-vindo, ${result.user.full_name}!${offlineNote} A reautorizacao para jobs nao foi salva.`
          : `Bem-vindo, ${result.user.full_name}!${offlineNote}`,
      });

      void trackEvent(result.user.id, 'login');
      return true;
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: 'Erro de autenticacao',
        description: resolveFunctionsInvokeErrorMessage(error),
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [applyLocalSnapshot, persistSnapshot]);

  const logout = useCallback(async () => {
    const userId = user?.id;

    await trackEvent(userId, 'logout');
    await supabase.auth.signOut();
    resetAuthState();

    if (userId) {
      localStorage.removeItem(`claris_chat_history:${userId}`);
    }

    toast({
      title: 'Logout realizado',
      description: 'Voce foi desconectado com sucesso.',
    });
  }, [resetAuthState, user]);

  const clearInvalidSession = useCallback(async () => {
    resetAuthState();
    await supabase.auth.signOut({ scope: 'local' });
  }, [resetAuthState]);

  const resolveSessionContext = useCallback(async (): Promise<SessionContext | null> => {
    let userToUse = user;
    let sessionToUse = moodleSession;

    if (!userToUse || !sessionToUse) {
      const stored = await loadStoredSession();
      if (stored) {
        userToUse = stored.user;
        sessionToUse = stored.moodleSession;
      }
    }

    if (!userToUse || !sessionToUse) {
      return null;
    }

    return {
      user: userToUse,
      session: sessionToUse,
    };
  }, [moodleSession, user]);

  return {
    user,
    moodleSession,
    isLoading,
    lastSync: lastSyncState,
    setLastSync,
    login,
    logout,
    clearInvalidSession,
    resolveSessionContext,
  };
}
