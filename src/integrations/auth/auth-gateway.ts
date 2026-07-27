import { supabase } from '@/integrations/supabase/client';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: {
    avatarUrl?: string;
    createdAt?: string;
    email?: string;
    fullName?: string;
    id: string;
  };
}

export type AuthStateListener = (event: string, session: AuthSession | null) => void;
export type SignOutScope = 'global' | 'local' | 'others';

let pendingPasswordRecoverySession: AuthSession | null = null;

export class AuthSessionMissingError extends Error {
  constructor() {
    super('Sessao expirada. Faca login novamente.');
    this.name = 'AuthSessionMissingError';
  }
}

function mapSession(session: {
  access_token: string;
  refresh_token: string;
  user: {
    created_at?: string;
    email?: string;
    id: string;
    user_metadata?: Record<string, unknown>;
  };
} | null): AuthSession | null {
  if (!session) return null;
  const fullName = session.user.user_metadata?.full_name;
  const avatarUrl = session.user.user_metadata?.avatar_url;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    user: {
      id: session.user.id,
      email: session.user.email,
      createdAt: session.user.created_at,
      ...(typeof fullName === 'string' && fullName.trim() ? { fullName: fullName.trim() } : {}),
      ...(typeof avatarUrl === 'string' && avatarUrl.trim() ? { avatarUrl: avatarUrl.trim() } : {}),
    },
  };
}

async function getSession(): Promise<AuthSession | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return mapSession(data.session);
}

async function refreshSession(): Promise<AuthSession | null> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  return mapSession(data.session);
}

export const authGateway = {
  async getAccessToken(forceRefresh = false, required = true): Promise<string | null> {
    const session = forceRefresh ? await refreshSession() : await getSession();

    if (session?.accessToken) return session.accessToken;
    if (!forceRefresh) {
      const refreshed = await refreshSession();
      if (refreshed?.accessToken) return refreshed.accessToken;
    }
    if (required) throw new AuthSessionMissingError();
    return null;
  },

  getSession,

  onAuthStateChange(listener: AuthStateListener): () => void {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const mappedSession = mapSession(session);
      if (event === 'PASSWORD_RECOVERY' && mappedSession) {
        pendingPasswordRecoverySession = mappedSession;
      } else if (event === 'SIGNED_OUT' || !mappedSession) {
        pendingPasswordRecoverySession = null;
      }
      listener(event, mappedSession);
    });
    return () => subscription.unsubscribe();
  },

  /**
   * Returns the one-time recovery proof observed from Supabase Auth. A normal
   * signed-in session is deliberately not accepted by the reset-password
   * route, even when that user could otherwise change their own password.
   */
  consumePasswordRecoverySession(): AuthSession | null {
    const recoverySession = pendingPasswordRecoverySession;
    pendingPasswordRecoverySession = null;
    return recoverySession;
  },

  refreshSession,

  async exchangeCodeForSession(code: string): Promise<AuthSession | null> {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return mapSession(data.session);
  },

  async resetPasswordForEmail(email: string, redirectTo: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  },

  async signInWithPassword(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw error ?? new AuthSessionMissingError();
    return mapSession(data.session)!;
  },

  async setSession(tokens: { accessToken: string; refreshToken: string }): Promise<void> {
    const { error } = await supabase.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    if (error) throw error;
  },

  async signOut(scope: SignOutScope = 'global'): Promise<void> {
    const { error } = await supabase.auth.signOut({ scope });
    if (error) throw error;
    pendingPasswordRecoverySession = null;
  },

  async updatePassword(password: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },
};
