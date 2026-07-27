import type { MoodleApiTelemetry } from '../../moodle/client.ts'

export interface MoodleSyncAttemptScope {
  connectionId: string
  itemId?: string
  jobId?: string
  siteSlug: string
}

/**
 * Emits only safe, structured provider-attempt facts. Durable metadata keeps
 * the matching bounded aggregates; this log also preserves attempts that end
 * in a failed item before it can be completed.
 */
export function createMoodleSyncAttemptTelemetry(
  scope: MoodleSyncAttemptScope,
): MoodleApiTelemetry {
  return {
    onAttempt(metric) {
      console.info('[moodle-sync] Provider attempt.', {
        attempt: metric.attempt,
        connectionId: scope.connectionId,
        durationMs: metric.durationMs,
        ...(scope.itemId ? { itemId: scope.itemId } : {}),
        ...(scope.jobId ? { jobId: scope.jobId } : {}),
        outcome: metric.outcome,
        responseBytes: metric.responseBytes,
        siteSlug: scope.siteSlug,
        status: metric.status,
        wsfunction: metric.wsfunction,
      })
    },
  }
}
