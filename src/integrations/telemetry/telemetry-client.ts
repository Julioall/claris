import { invokeEdgeFunction } from '@/integrations/http/edge-function-client';

const TELEMETRY_FUNCTION_NAME = 'app-telemetry';
const TELEMETRY_TIMEOUT_MS = 2_000;

export type TelemetryErrorSeverity = 'info' | 'warning' | 'error' | 'critical';
export type TelemetryErrorCategory =
  | 'ui'
  | 'import'
  | 'integration'
  | 'edge_function'
  | 'ai'
  | 'auth'
  | 'other';

export interface TrackUsageInput {
  eventType: string;
  metadata?: Record<string, unknown>;
  resource?: string;
  route?: string;
}

export interface LogTelemetryErrorInput {
  category?: TelemetryErrorCategory;
  context?: Record<string, unknown>;
  message: string;
  payload?: Record<string, unknown>;
  severity?: TelemetryErrorSeverity;
}

async function sendBestEffort(body: Record<string, unknown>): Promise<void> {
  try {
    await invokeEdgeFunction<unknown>(TELEMETRY_FUNCTION_NAME, {
      auth: 'required',
      body,
      timeoutMs: TELEMETRY_TIMEOUT_MS,
    });
  } catch {
    // Telemetry must never interrupt or alter the user flow.
  }
}

export const telemetryClient = {
  async trackUsage(input: TrackUsageInput): Promise<void> {
    await sendBestEffort({
      action: 'track_usage',
      eventType: input.eventType,
      route: input.route ?? null,
      resource: input.resource ?? null,
      metadata: input.metadata ?? {},
    });
  },

  async logError(input: LogTelemetryErrorInput): Promise<void> {
    await sendBestEffort({
      action: 'log_error',
      severity: input.severity ?? 'error',
      category: input.category ?? 'ui',
      message: input.message,
      payload: input.payload ?? {},
      context: input.context ?? {},
    });
  },
};
