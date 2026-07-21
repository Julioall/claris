import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { telemetryClient } from '@/integrations/telemetry/telemetry-client';

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
  const location = useLocation();

  const track = useCallback(
    async (eventType: UsageEventType, options: TrackEventOptions = {}) => {
      const { route, resource, metadata = {} } = options;
      await telemetryClient.trackUsage({
        eventType,
        route: route ?? location.pathname,
        resource,
        metadata,
      });
    },
    [location.pathname],
  );

  return { track };
}
