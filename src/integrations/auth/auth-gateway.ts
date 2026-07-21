import { supabase } from '@/integrations/supabase/client';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: {
    email?: string;
    id: string;
  };
}

export type AuthStateListener = (event: string, session: AuthSession | null) => void;
export type SignOutScope = 'global' | 'local' | 'others';

export class AuthSessionMissingError extends Error {
  constructor() {
    super('Sessao expirada. Faca login novamente.');
    this.name = 'AuthSessionMissingError';
  }
}

function mapSession(session: {
  access_token: string;
  refresh_token: string;
  user: { id: string; email?: string };
} | null): AuthSession | null {
  if (!session) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    user: { id: session.user.id, email: session.user.email },
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
      listener(event, mapSession(session));
    });
    return () => subscription.unsubscribe();
  },

  refreshSession,

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
  },
};
