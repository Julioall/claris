import { useCallback } from 'react';
import {
  telemetryClient,
  type TelemetryErrorCategory,
  type TelemetryErrorSeverity,
} from '@/integrations/telemetry/telemetry-client';

export type ErrorSeverity = TelemetryErrorSeverity;
export type ErrorCategory = TelemetryErrorCategory;

interface LogErrorOptions {
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  payload?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export function useErrorLog() {
  const logError = useCallback(
    async (message: string, options: LogErrorOptions = {}) => {
      const { severity = 'error', category = 'ui', payload = {}, context = {} } = options;
      await telemetryClient.logError({
        severity,
        category,
        message,
        payload,
        context: {
          ...context,
          url: window.location.pathname,
          userAgent: navigator.userAgent,
        },
      });
    },
    [],
  );

  return { logError };
}
