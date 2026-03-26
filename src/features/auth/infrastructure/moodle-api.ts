import { supabase } from '@/integrations/supabase/client';
import {
  normalizeMoodleUrl,
  resolveFunctionsInvokeErrorMessage,
  resolveMoodleErrorMessage,
} from '@/lib/moodle-errors';
import type { User } from '@/features/auth/types';
import type { Course } from '@/features/courses/types';

import type { MoodleSession } from '../domain/session';

const DEFAULT_MOODLE_SERVICE = 'moodle_mobile_app';
const SUPABASE_FUNCTIONS_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1`;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export interface ParsedFunctionError {
  status?: number;
  message?: string;
}

export interface AuthenticateMoodleSuccess {
  success: true;
  user: User;
  moodleSession: MoodleSession | null;
  supabaseSession?: {
    access_token: string;
    refresh_token: string;
  };
  offlineMode: boolean;
}

export interface AuthenticateMoodleFailure {
  success: false;
  error: string;
}

export type AuthenticateMoodleResult = AuthenticateMoodleSuccess | AuthenticateMoodleFailure;

export interface FetchMoodleCoursesResult {
  courses: Course[];
  handledError: boolean;
  errorMessage?: string;
  isMissingUser?: boolean;
}

export async function parseFunctionsError(err: unknown): Promise<ParsedFunctionError> {
  const context = (err as { context?: Response })?.context;
  if (!context) return {};

  const status = context.status;
  try {
    const payload = await context.clone().json();
    const message = typeof payload?.error === 'string' ? payload.error : undefined;
    return { status, message };
  } catch {
    return { status };
  }
}

export async function resolveEdgeAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || SUPABASE_PUBLISHABLE_KEY;
}

export async function authenticateMoodleUser(params: {
  username: string;
  password: string;
  moodleUrl: string;
  service?: string;
}): Promise<AuthenticateMoodleResult> {
  const cleanUrl = normalizeMoodleUrl(params.moodleUrl);

  const { data, error } = await supabase.functions.invoke('moodle-auth', {
    body: {
      moodleUrl: cleanUrl,
      username: params.username,
      password: params.password,
      service: params.service ?? DEFAULT_MOODLE_SERVICE,
    },
  });

  if (error) {
    const parsed = await parseFunctionsError(error);
    return {
      success: false,
      error: resolveFunctionsInvokeErrorMessage(parsed.message || error),
    };
  }

  const payload = (data ?? {}) as {
    error?: string;
    errorcode?: string;
    user: User;
    moodleToken?: string;
    moodleUserId?: number;
    offlineMode?: boolean;
    session?: {
      access_token: string;
      refresh_token: string;
    };
  };

  if (payload.error) {
    return {
      success: false,
      error: resolveMoodleErrorMessage(payload.error, payload.errorcode),
    };
  }

  return {
    success: true,
    user: payload.user,
    moodleSession: payload.moodleToken
      ? {
          moodleToken: payload.moodleToken,
          moodleUserId: payload.moodleUserId ?? 0,
          moodleUrl: cleanUrl,
        }
      : null,
    supabaseSession: payload.session,
    offlineMode: Boolean(payload.offlineMode),
  };
}

export async function fetchMoodleCoursesFromSession(
  session: MoodleSession,
  moodleUserId: number,
): Promise<FetchMoodleCoursesResult> {
  try {
    const { data, error } = await supabase.functions.invoke('moodle-sync-courses', {
      body: {
        moodleUrl: session.moodleUrl,
        token: session.moodleToken,
        userId: moodleUserId,
      },
    });

    const payload = (data ?? null) as { error?: string; courses?: Course[] } | null;
    if (error || payload?.error) {
      return {
        courses: [],
        handledError: true,
        errorMessage: error?.message || payload?.error || 'Nao foi possivel obter cursos do Moodle.',
      };
    }

    return {
      courses: payload?.courses || [],
      handledError: false,
    };
  } catch (error) {
    const parsed = await parseFunctionsError(error);
    return {
      courses: [],
      handledError: true,
      errorMessage: 'Nao foi possivel conectar ao Moodle.',
      isMissingUser: parsed.status === 404 && parsed.message === 'User not found in database',
    };
  }
}

export async function invokeMoodleFunctionWithTimeout(params: {
  functionName: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
  accessTokenOverride?: string;
}): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs ?? 25000);

  try {
    const accessToken = params.accessTokenOverride || await resolveEdgeAccessToken();

    const response = await fetch(`${SUPABASE_FUNCTIONS_BASE_URL}/${params.functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(params.body),
      signal: controller.signal,
    });

    let payload: Record<string, unknown> | null = null;
    try {
      payload = await response.json() as Record<string, unknown>;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      return {
        data: null,
        error: {
          message:
            (typeof payload?.error === 'string' && payload.error) ||
            (typeof payload?.msg === 'string' && payload.msg) ||
            `Request failed with status ${response.status}`,
        },
      };
    }

    return { data: payload, error: null };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { data: null, error: { message: 'Request timeout' } };
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
