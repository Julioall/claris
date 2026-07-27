import { describe, expect, it, vi } from 'vitest'

import {
  createMoodleProviderMetrics,
  mergeMoodleProviderMetrics,
  readMoodleProviderMetrics,
  toMoodleProviderMetricsMetadata,
} from '../../../../supabase/functions/_shared/domain/moodle-sync/provider-metrics.ts'
import { createMoodleSyncAttemptTelemetry } from '../../../../supabase/functions/_shared/domain/moodle-sync/attempt-telemetry.ts'

describe('Moodle provider-call metrics', () => {
  it('records only aggregate logical calls and UTF-8 response bytes', async () => {
    const metrics = createMoodleProviderMetrics()
    await metrics.call(async () => ({ course: 'turma', total: 2 }))
    await expect(metrics.call(async () => {
      throw new Error('temporary failure')
    })).rejects.toThrow('temporary failure')

    expect(toMoodleProviderMetricsMetadata(metrics.snapshot())).toEqual({
      moodle_api_calls: 2,
      moodle_response_bytes: new TextEncoder().encode(
        JSON.stringify({ course: 'turma', total: 2 }),
      ).byteLength,
    })
  })

  it('reads and merges only safe numeric metadata', () => {
    const total = mergeMoodleProviderMetrics(
      readMoodleProviderMetrics({ moodle_api_calls: 2, moodle_response_bytes: 40 }),
      readMoodleProviderMetrics({ moodle_api_calls: '3', moodle_response_bytes: '60' }),
      readMoodleProviderMetrics({ moodle_api_calls: -1, moodle_response_bytes: 'bad' }),
    )

    expect(toMoodleProviderMetricsMetadata(total)).toEqual({
      moodle_api_calls: 5,
      moodle_response_bytes: 100,
    })
  })

  it('keeps bounded per-function attempt facts without request data', () => {
    const metrics = createMoodleProviderMetrics()
    metrics.recordAttempt({
      attempt: 1,
      durationMs: 42,
      outcome: 'error',
      responseBytes: 15,
      status: 503,
      wsfunction: 'core_course_get_contents',
    })
    metrics.recordAttempt({
      attempt: 2,
      durationMs: 18,
      outcome: 'success',
      responseBytes: 64,
      status: 200,
      wsfunction: 'core_course_get_contents',
    })
    metrics.recordAttempt({
      attempt: 1,
      durationMs: 1,
      outcome: 'success',
      responseBytes: 1,
      status: 200,
      wsfunction: 'https://must-not-be-a-metric',
    })

    expect(toMoodleProviderMetricsMetadata(metrics.snapshot())).toEqual({
      moodle_api_calls: 0,
      moodle_response_bytes: 79,
      moodle_provider_operations: {
        core_course_get_contents: {
          attempts: 2,
          durationMs: 60,
          failedAttempts: 1,
          responseBytes: 79,
          statuses: { '200': 1, '503': 1 },
        },
      },
    })
  })

  it('logs only safe attempt facts with the durable item scope', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const telemetry = createMoodleSyncAttemptTelemetry({
      connectionId: 'connection-123',
      itemId: 'item-456',
      jobId: 'job-789',
      siteSlug: 'senai',
    })

    telemetry.onAttempt?.({
      attempt: 2,
      durationMs: 125,
      outcome: 'error',
      responseBytes: 42,
      status: 503,
      wsfunction: 'core_course_get_contents',
    })

    expect(info).toHaveBeenCalledWith('[moodle-sync] Provider attempt.', {
      attempt: 2,
      connectionId: 'connection-123',
      durationMs: 125,
      itemId: 'item-456',
      jobId: 'job-789',
      outcome: 'error',
      responseBytes: 42,
      siteSlug: 'senai',
      status: 503,
      wsfunction: 'core_course_get_contents',
    })
    expect(JSON.stringify(info.mock.calls[0])).not.toMatch(/token|https?:|password|email|payload/i)
    info.mockRestore()
  })
})
