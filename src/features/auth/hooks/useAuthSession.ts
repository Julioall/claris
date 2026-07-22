import { useCallback, useEffect, useState } from 'react';

import type { User } from '@/features/auth/types';
import { authGateway, type AuthSession } from '@/integrations/auth/auth-gateway';
import { toast } from '@/hooks/use-toast';
import { saveSelectedMoodleConnectionId } from '@/features/moodle-connections/state/selected-connection';
import { trackEvent } from '@/lib/tracking';

import { isInvalidRefreshTokenError } from '../domain/session';

export interface UseAuthSessionResult {
  user: User | null;
  isLoading: boolean;
  lastSync: string | null;
  setLastSync: (value: string | null) => void;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearInvalidSession: () => Promise<void>;
}

function mapClarisUser(session: AuthSession): User {
  const email = session.user.email?.trim().toLowerCase();
  return {
    id: session.user.id,
    full_name: session.user.fullName || email || 'Usuario Claris',
    email,
    avatar_url: session.user.avatarUrl,
    created_at: session.user.createdAt,
  };
}

export function useAuthSession(): UseAuthSessionResult {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSyncState, setLastSyncState] = useState<string | null>(null);

  const applySession = useCallback((session: AuthSession | null) => {
    setUser(session ? mapClarisUser(session) : null);
    if (!session) setLastSyncState(null);
  }, []);

  const resetAuthState = useCallback(() => applySession(null), [applySession]);

  useEffect(() => {
    const unsubscribe = authGateway.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) resetAuthState();
      else applySession(session);
      setIsLoading(false);
    });

    void authGateway.getSession()
      .then(applySession)
      .catch(async (error) => {
        if (isInvalidRefreshTokenError(error)) {
          resetAuthState();
          await authGateway.signOut('local').catch(() => undefined);
        }
      })
      .finally(() => setIsLoading(false));

    return unsubscribe;
  }, [applySession, resetAuthState]);

  const setLastSync = useCallback((value: string | null) => {
    setLastSyncState(value);
    setUser((current) => current ? { ...current, last_sync: value ?? undefined } : current);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const session = await authGateway.signInWithPassword(email.trim().toLowerCase(), password);
      applySession(session);
      toast({
        title: 'Login realizado com sucesso',
        description: `Bem-vindo, ${session.user.fullName || session.user.email || 'usuario'}!`,
      });
      void trackEvent('login');
      return true;
    } catch {
      resetAuthState();
      toast({
        title: 'Erro de autenticacao',
        description: 'E-mail ou senha invalidos.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [applySession, resetAuthState]);

  const logout = useCallback(async () => {
    const userId = user?.id;
    await trackEvent('logout');
    await authGateway.signOut();
    resetAuthState();

    if (userId) {
      saveSelectedMoodleConnectionId(userId, null);
      localStorage.removeItem(`claris_chat_history:${userId}`);
    }

    toast({ title: 'Logout realizado', description: 'Voce foi desconectado com sucesso.' });
  }, [resetAuthState, user]);

  const clearInvalidSession = useCallback(async () => {
    resetAuthState();
    await authGateway.signOut('local');
  }, [resetAuthState]);

  return {
    user,
    isLoading,
    lastSync: lastSyncState,
    setLastSync,
    login,
    logout,
    clearInvalidSession,
  };
}
