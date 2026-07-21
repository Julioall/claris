import {
  ApiClientError,
  invokeLegacyEdgeFunction,
} from '@/integrations/http/edge-function-client';
import {
  normalizeMoodleUrl,
  resolveFunctionsInvokeErrorMessage,
  resolveMoodleErrorMessage,
} from '@/lib/moodle-errors';
import type { User } from '@/features/auth/types';

import type { MoodleSession } from '../domain/session';

const DEFAULT_MOODLE_SERVICE = 'moodle_mobile_app';

export interface AuthenticateMoodleSuccess {
  success: true;
  authSession?: {
    accessToken: string;
    refreshToken: string;
  };
  backgroundReauthError?: string;
  backgroundReauthStored?: boolean;
  user: User;
  moodleSession: MoodleSession | null;
  offlineMode: boolean;
}

export interface AuthenticateMoodleFailure {
  success: false;
  error: string;
}

export type AuthenticateMoodleResult = AuthenticateMoodleSuccess | AuthenticateMoodleFailure;

interface MoodleAuthResponse {
  backgroundReauthError?: string;
  backgroundReauthStored?: boolean;
  error?: string;
  errorcode?: string;
  moodleToken?: string | null;
  moodleUserId?: number;
  offlineMode?: boolean;
  session?: {
    access_token: string;
    refresh_token: string;
  };
  user?: User;
}

export async function authenticateMoodleUser(params: {
  backgroundReauthEnabled?: boolean;
  username: string;
  password: string;
  moodleUrl: string;
  service?: string;
}): Promise<AuthenticateMoodleResult> {
  const cleanUrl = normalizeMoodleUrl(params.moodleUrl);
  const body = {
    moodleUrl: cleanUrl,
    username: params.username,
    password: params.password,
    service: params.service ?? DEFAULT_MOODLE_SERVICE,
    ...(typeof params.backgroundReauthEnabled === 'boolean'
      ? { backgroundReauthEnabled: params.backgroundReauthEnabled }
      : {}),
  };

  let rawPayload: unknown;
  try {
    rawPayload = await invokeLegacyEdgeFunction<unknown>('moodle-auth', {
      auth: 'none',
      body,
    });
  } catch (error) {
    return {
      success: false,
      error: resolveFunctionsInvokeErrorMessage(error),
    };
  }

  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return {
      success: false,
      error: 'O servidor retornou uma resposta de autenticacao invalida.',
    };
  }
  const payload = rawPayload as MoodleAuthResponse;

  if (payload.error) {
    return {
      success: false,
      error: resolveMoodleErrorMessage(payload.error, payload.errorcode),
    };
  }

  if (!payload.user || typeof payload.user !== 'object') {
    return {
      success: false,
      error: 'O servidor retornou uma resposta de autenticacao invalida.',
    };
  }

  return {
    success: true,
    authSession: payload.session
      && typeof payload.session.access_token === 'string'
      && typeof payload.session.refresh_token === 'string'
      ? {
          accessToken: payload.session.access_token,
          refreshToken: payload.session.refresh_token,
        }
      : undefined,
    backgroundReauthError: payload.backgroundReauthError,
    backgroundReauthStored: payload.backgroundReauthStored,
    user: payload.user,
    moodleSession: typeof payload.moodleToken === 'string' && payload.moodleToken.length > 0
      ? {
          moodleToken: payload.moodleToken,
          moodleUserId: payload.moodleUserId ?? 0,
          moodleUrl: cleanUrl,
        }
      : null,
    offlineMode: Boolean(payload.offlineMode),
  };
}

export async function invokeMoodleFunctionWithTimeout(params: {
  functionName: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  try {
    const data = await invokeLegacyEdgeFunction<Record<string, unknown> | null>(
      params.functionName,
      {
        body: params.body,
        timeoutMs: params.timeoutMs,
      },
    );

    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof ApiClientError
          ? error.message
          : resolveFunctionsInvokeErrorMessage(error),
      },
    };
  }
}
