import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type UsageEventType =
  | 'page_view'
  | 'login'
  | 'logout'
  | 'sync_start'
  | 'sync_finish'
  | 'sync_error'
  | 'send_message'
  | 'claris_prompt'
  | 'claris_response'
  | string;

interface TrackEventOptions {
  resource?: string;
  metadata?: Record<string, unknown>;
  route?: string;
}

export function useTrackEvent() {
  const { user } = useAuth();
  const location = useLocation();

  const track = useCallback(
    async (eventType: UsageEventType, options: TrackEventOptions = {}) => {
      try {
        const { route, resource, metadata = {} } = options;
        await (supabase.from as Function)('app_usage_events').insert({
          user_id: user?.id ?? null,
          event_type: eventType,
          route: route ?? location.pathname,
          resource: resource ?? null,
          metadata,
        });
      } catch {
        // Tracking failures are silent to avoid disrupting the user experience
      }
    },
    [user, location.pathname],
  );

  return { track };
}
