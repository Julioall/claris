import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';
export type ErrorCategory = 'ui' | 'import' | 'integration' | 'edge_function' | 'ai' | 'auth' | 'other';

interface LogErrorOptions {
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  payload?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export function useErrorLog() {
  const { user } = useAuth();

  const logError = useCallback(
    async (message: string, options: LogErrorOptions = {}) => {
      try {
        const { severity = 'error', category = 'ui', payload = {}, context = {} } = options;
        await supabase.from('app_error_logs' as never).insert({
          user_id: user?.id ?? null,
          severity,
          category,
          message,
          payload,
          context: {
            ...context,
            url: window.location.pathname,
            userAgent: navigator.userAgent,
          },
        } as never);
      } catch {
        // Error logging failures are silent
      }
    },
    [user],
  );

  return { logError };
}
