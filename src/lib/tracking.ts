import {
  telemetryClient,
  type TelemetryErrorCategory,
} from '@/integrations/telemetry/telemetry-client';

/**
 * Tracks a usage event without relying on React hooks.
 * Use this from non-hook contexts such as AuthContext.
 * For React components and hooks, prefer `useTrackEvent` instead.
 */
export async function trackEvent(
  eventType: string,
  options: { route?: string; resource?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  await telemetryClient.trackUsage({
    eventType,
    route: options.route ?? (typeof window !== 'undefined' ? window.location.pathname : undefined),
    resource: options.resource,
    metadata: options.metadata,
  });
}

/**
 * Logs an error without relying on React hooks.
 * Use this from non-hook contexts such as AuthContext.
 * For React components and hooks, prefer `useErrorLog` instead.
 */
export async function logError(
  message: string,
  options: { category?: TelemetryErrorCategory; payload?: Record<string, unknown> } = {},
): Promise<void> {
  await telemetryClient.logError({
    severity: 'error',
    category: options.category ?? 'integration',
    message,
    payload: options.payload,
    context: {
      url: typeof window !== 'undefined' ? window.location.pathname : null,
    },
  });
}
