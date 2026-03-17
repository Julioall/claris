import { supabase } from '@/integrations/supabase/client';

/**
 * Tracks a usage event directly in Supabase without relying on React hooks.
 * Use this from non-hook contexts such as AuthContext.
 * For React components and hooks, prefer `useTrackEvent` instead.
 */
export async function trackEvent(
  userId: string | null | undefined,
  eventType: string,
  options: { route?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await supabase.from('app_usage_events').insert({
      user_id: userId ?? null,
      event_type: eventType,
      route: options.route ?? (typeof window !== 'undefined' ? window.location.pathname : null),
      metadata: options.metadata ?? {},
    });
  } catch {
    // Tracking failures are silent
  }
}

/**
 * Logs an error directly in Supabase without relying on React hooks.
 * Use this from non-hook contexts such as AuthContext.
 * For React components and hooks, prefer `useErrorLog` instead.
 */
export async function logError(
  userId: string | null | undefined,
  message: string,
  options: { category?: string; payload?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await supabase.from('app_error_logs').insert({
      user_id: userId ?? null,
      severity: 'error',
      category: options.category ?? 'integration',
      message,
      payload: options.payload ?? {},
      context: { url: typeof window !== 'undefined' ? window.location.pathname : null },
      resolved: false,
    });
  } catch {
    // Logging failures are silent
  }
}
