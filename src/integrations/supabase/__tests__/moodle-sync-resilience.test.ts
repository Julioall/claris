import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkpoint: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  createServiceClient: vi.fn(),
  fail: vi.fn(),
  findCourse: vi.fn(),
  getUpdatesSince: vi.fn(),
  heartbeat: vi.fn(),
  loadDeltaContext: vi.fn(),
  recalculateRisk: vi.fn(),
  recordCircuit: vi.fn(),
  refreshAggregates: vi.fn(),
  rolloutEnabled: vi.fn(),
  resolveAccess: vi.fn(),
  syncActivities: vi.fn(),
  syncGrades: vi.fn(),
  syncStudents: vi.fn(),
}))

vi.mock('../../../../supabase/functions/_shared/db/mod.ts', () => ({
  createServiceClient: mocks.createServiceClient,
}))

vi.mock('../../../../supabase/functions/_shared/domain/moodle-connections/mod.ts', () => ({
  MoodleConnectionError: class MoodleConnectionError extends Error {
    readonly code = 'connection_reauth_required'
  },
  resolveMoodleAccess: mocks.resolveAccess,
}))

vi.mock('../../../../supabase/functions/_shared/domain/moodle-sync/repository.ts', () => ({
  findCourseById: mocks.findCourse,
}))

vi.mock('../../../../supabase/functions/_shared/domain/moodle-sync/worker-repository.ts', () => ({
  checkpointMoodleSyncItem: mocks.checkpoint,
  claimMoodleSyncItem: mocks.claim,
  completeMoodleSyncItem: mocks.complete,
  failMoodleSyncItem: mocks.fail,
  heartbeatMoodleSyncItem: mocks.heartbeat,
  loadMoodleDeltaShadowContext: mocks.loadDeltaContext,
  recordMoodleSiteCircuitResult: mocks.recordCircuit,
}))

vi.mock('../../../../supabase/functions/_shared/domain/moodle-sync/rollout.ts', () => ({
  isMoodleSyncRolloutEnabled: mocks.rolloutEnabled,
}))

vi.mock('../../../../supabase/functions/_shared/domain/risk/recalculation.ts', () => ({
  recalculateRiskForCourses: mocks.recalculateRisk,
}))

vi.mock('../../../../supabase/functions/_shared/domain/dashboard-activity-aggregates.ts', () => ({
  refreshDashboardCourseActivityAggregates: mocks.refreshAggregates,
}))

vi.mock('../../../../supabase/functions/moodle-sync-students/service.ts', () => ({
  syncStudents: mocks.syncStudents,
}))

vi.mock('../../../../supabase/functions/moodle-sync-activities/service.ts', () => ({
  syncActivities: mocks.syncActivities,
}))

vi.mock('../../../../supabase/functions/moodle-sync-grades/service.ts', () => ({
  syncGrades: mocks.syncGrades,
}))

vi.mock('../../../../supabase/functions/_shared/moodle/mod.ts', () => ({
  combineMoodleApiTelemetry: (...telemetries: unknown[]) => telemetries.find(Boolean),
  getCourseUpdatesSince: mocks.getUpdatesSince,
}))

import { runMoodleSyncJob } from '../../../../supabase/functions/_shared/domain/moodle-sync/job-runner.ts'
import { callMoodleApi, MoodleApiError } from '../../../../supabase/functions/_shared/moodle/client.ts'

const COURSE_ID = '30000000-0000-0000-0000-000000000001'
const CONNECTION_ID = '20000000-0000-0000-0000-000000000001'
const ITEM_ID = '50000000-0000-0000-0000-000000000001'
const JOB_ID = '40000000-0000-0000-0000-000000000001'
const SITE_ID = '10000000-0000-0000-0000-000000000001'
const USER_ID = '60000000-0000-0000-0000-000000000001'

function durableStudentItem() {
  return {
    attemptCount: 1,
    cursor: null,
    itemId: ITEM_ID,
    itemKey: `students:${COURSE_ID}`,
    jobId: JOB_ID,
    jobMetadata: {
      course_ids: [COURSE_ID],
      entities: ['students'],
      schema_version: 2,
      sync_kind: 'initial',
    },
    label: 'Students',
    leasedUntil: '2026-07-26T12:01:30.000Z',
    maxAttempts: 3,
    metadata: { course_id: COURSE_ID },
    moodleConnectionId: CONNECTION_ID,
    moodleSiteId: SITE_ID,
    syncPolicy: {},
    userId: USER_ID,
  }
}

function durableActivityItem(cursor: Record<string, unknown> | null = null) {
  return {
    ...durableStudentItem(),
    cursor,
    itemKey: `activities:${COURSE_ID}`,
    jobMetadata: {
      course_ids: [COURSE_ID],
      entities: ['activities'],
      schema_version: 2,
      sync_kind: 'initial',
    },
    label: 'Activities',
  }
}

function failedResponse(status: number, error = `HTTP ${status}`): Response {
  return new Response(JSON.stringify({ error, success: false }), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

function successfulResponse(): Response {
  return new Response(JSON.stringify({ studentsCount: 0, success: true }), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

async function runOneClaim(): Promise<Awaited<ReturnType<typeof runMoodleSyncJob>>> {
  return await runMoodleSyncJob(JOB_ID, {} as never, {
    budgetMs: 3_000,
    now: () => 0,
    workerId: 'resilience-worker',
  })
}

describe('Moodle sync worker local resilience', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()

    mocks.claim
      .mockResolvedValueOnce(durableStudentItem())
      .mockResolvedValue(null)
    mocks.heartbeat.mockResolvedValue(true)
    mocks.complete.mockResolvedValue('completed')
    mocks.fail.mockResolvedValue('retry_scheduled')
    mocks.recordCircuit.mockResolvedValue(undefined)
    mocks.rolloutEnabled.mockResolvedValue(false)
    mocks.findCourse.mockResolvedValue({
      id: COURSE_ID,
      moodle_course_id: '32787',
      moodle_site_id: SITE_ID,
      start_date: null,
    })
    mocks.resolveAccess.mockResolvedValue({
      connectionId: CONNECTION_ID,
      moodleSiteId: SITE_ID,
      moodleUrl: 'https://moodle.example.test',
      siteSlug: 'test',
      token: 'not-a-real-token',
      userId: USER_ID,
    })
    mocks.syncStudents.mockResolvedValue(successfulResponse())
  })

  it.each([
    [408, 'moodle_timeout', 30],
    [429, 'moodle_rate_limited', 60],
    [503, 'moodle_server_error', 30],
  ])('schedules retry for transient Moodle response %i', async (status, code, retryAfterSeconds) => {
    mocks.syncStudents.mockResolvedValueOnce(failedResponse(status))

    await expect(runOneClaim()).resolves.toEqual({
      claimedItems: 1,
      checkpointedItems: 0,
      completedItems: 0,
      failedItems: 0,
      retryScheduledItems: 1,
    })
    expect(mocks.fail).toHaveBeenCalledWith(expect.anything(), {
      cursor: null,
      errorCode: code,
      errorMessage: `HTTP ${status}`,
      itemId: ITEM_ID,
      retryAfterSeconds,
      retryable: true,
      workerId: 'resilience-worker',
    })
    expect(mocks.complete).not.toHaveBeenCalled()
    expect(mocks.recordCircuit).toHaveBeenCalledWith(expect.anything(), {
      failureCode: code,
      moodleSiteId: SITE_ID,
      success: false,
    })
  })

  it('does not retry an expired Moodle authorization', async () => {
    mocks.syncStudents.mockResolvedValueOnce(failedResponse(401, 'Token expired'))
    mocks.fail.mockResolvedValueOnce('failed')

    await expect(runOneClaim()).resolves.toEqual({
      claimedItems: 1,
      checkpointedItems: 0,
      completedItems: 0,
      failedItems: 1,
      retryScheduledItems: 0,
    })
    expect(mocks.fail).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      errorCode: 'moodle_authorization_error',
      retryable: false,
    }))
    expect(mocks.recordCircuit).not.toHaveBeenCalled()
  })

  it('stops without a competing failure when the initial lease is lost', async () => {
    mocks.heartbeat.mockResolvedValueOnce(false)

    await expect(runOneClaim()).resolves.toEqual({
      claimedItems: 1,
      checkpointedItems: 0,
      completedItems: 0,
      failedItems: 0,
      retryScheduledItems: 0,
    })
    expect(mocks.syncStudents).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  it('does not overwrite a concurrent completion or cancellation after lease loss', async () => {
    mocks.complete.mockResolvedValueOnce(null)

    await expect(runOneClaim()).resolves.toEqual({
      claimedItems: 1,
      checkpointedItems: 0,
      completedItems: 0,
      failedItems: 0,
      retryScheduledItems: 0,
    })
    expect(mocks.complete).toHaveBeenCalledTimes(1)
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  it('keeps provider-call metrics across paged checkpoints and completion', async () => {
    mocks.claim.mockReset()
    mocks.claim
      .mockResolvedValueOnce(durableActivityItem())
      .mockImplementationOnce(async () => durableActivityItem(
        mocks.checkpoint.mock.calls[0]?.[1]?.cursor ?? null,
      ))
      .mockResolvedValueOnce(null)
    mocks.checkpoint.mockResolvedValue(true)
    mocks.syncActivities
      .mockResolvedValueOnce(new Response(JSON.stringify({
        activitiesCount: 12,
        activityStaticSnapshot: { activities: [] },
        hasMore: true,
        moodle_api_calls: 3,
        moodle_provider_operations: {
          core_course_get_contents: {
            attempts: 3,
            durationMs: 30,
            failedAttempts: 1,
            responseBytes: 120,
            statuses: { '200': 2, '503': 1 },
          },
        },
        moodle_response_bytes: 120,
        nextStudentBatchPage: 2,
        success: true,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        activitiesCount: 4,
        hasMore: false,
        moodle_api_calls: 2,
        moodle_provider_operations: {
          core_course_get_contents: {
            attempts: 2,
            durationMs: 20,
            failedAttempts: 0,
            responseBytes: 80,
            statuses: { '200': 2 },
          },
        },
        moodle_response_bytes: 80,
        success: true,
      })))

    await expect(runOneClaim()).resolves.toEqual({
      claimedItems: 2,
      checkpointedItems: 1,
      completedItems: 1,
      failedItems: 0,
      retryScheduledItems: 0,
    })

    expect(mocks.checkpoint).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      cursor: expect.objectContaining({
        provider_metrics: {
          moodle_api_calls: 3,
          moodle_provider_operations: {
            core_course_get_contents: expect.objectContaining({ attempts: 3 }),
          },
          moodle_response_bytes: 120,
        },
      }),
    }))
    expect(mocks.complete).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      resultMetadata: expect.objectContaining({
        moodle_api_calls: 5,
        moodle_provider_operations: {
          core_course_get_contents: expect.objectContaining({
            attempts: 5,
            failedAttempts: 1,
            responseBytes: 200,
            statuses: { '200': 4, '503': 1 },
          }),
        },
        moodle_response_bytes: 200,
      }),
    }))
  })

  it('includes the delta-shadow provider call in completed metadata', async () => {
    mocks.claim.mockReset()
    mocks.claim
      .mockResolvedValueOnce({
        ...durableStudentItem(),
        jobMetadata: {
          course_ids: [COURSE_ID],
          entities: ['students'],
          schema_version: 2,
          sync_kind: 'incremental',
        },
      })
      .mockResolvedValueOnce(null)
    mocks.rolloutEnabled.mockResolvedValue(true)
    mocks.loadDeltaContext.mockResolvedValue({
      capabilityAvailable: true,
      currentRelease: '5.0.1',
      watermarkRelease: '5.0.1',
      watermarkSince: '2026-07-25T00:00:00.000Z',
    })
    mocks.getUpdatesSince.mockResolvedValue({ instances: [], warnings: [] })
    mocks.syncStudents.mockResolvedValue(new Response(JSON.stringify({
      moodle_api_calls: 2,
      moodle_response_bytes: 60,
      students: [],
      success: true,
    })))

    await runOneClaim()

    expect(mocks.getUpdatesSince).toHaveBeenCalledTimes(1)
    expect(mocks.complete).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      resultMetadata: expect.objectContaining({
        moodle_api_calls: 3,
        moodle_response_bytes: expect.any(Number),
      }),
    }))
    const completion = mocks.complete.mock.calls[0]?.[1]
    expect(completion.resultMetadata.moodle_response_bytes).toBeGreaterThan(60)
  })
})

describe('Moodle HTTP client local retry policy', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it.each([
    ['rate limit', 429],
    ['server error', 503],
  ])('retries a %s response and accepts a later success', async (_label, status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'temporary' }), {
        headers: { 'content-type': 'application/json', 'retry-after': '0' },
        status,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(callMoodleApi('https://moodle.example.test', 'token', 'core_test')).resolves.toEqual({
      ok: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports safe facts for every transport attempt without request data', async () => {
    const attempts: unknown[] = []
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'temporary' }), {
        headers: { 'content-type': 'application/json', 'retry-after': '0' },
        status: 503,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(callMoodleApi(
      'https://moodle.example.test',
      'token-that-must-not-be-reported',
      'core_test',
      {},
      25_000,
      { onAttempt: (metric) => attempts.push(metric) },
    )).resolves.toEqual({ ok: true })

    expect(attempts).toEqual([
      expect.objectContaining({
        attempt: 1,
        outcome: 'error',
        responseBytes: expect.any(Number),
        status: 503,
        wsfunction: 'core_test',
      }),
      expect.objectContaining({
        attempt: 2,
        outcome: 'success',
        responseBytes: expect.any(Number),
        status: 200,
        wsfunction: 'core_test',
      }),
    ])
    expect(JSON.stringify(attempts)).not.toMatch(/token-that-must-not-be-reported|moodle\.example\.test/i)
  })

  it('retries an aborted request without making any remote Moodle call', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new DOMException('timed out', 'AbortError'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }))
    vi.stubGlobal('fetch', fetchMock)

    const request = callMoodleApi('https://moodle.example.test', 'token', 'core_test')
    await vi.runAllTimersAsync()

    await expect(request).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fails an expired authorization without retrying it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      errorcode: 'invalidtoken',
      exception: 'moodle_exception',
    }), {
      headers: { 'content-type': 'application/json' },
      status: 401,
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(callMoodleApi('https://moodle.example.test', 'token', 'core_test')).rejects.toMatchObject({
      category: 'authentication',
      code: 'invalidtoken',
    } satisfies Partial<MoodleApiError>)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a declared oversized Moodle response before reading its body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not-read', {
      headers: {
        'content-length': String((16 * 1024 * 1024) + 1),
        'content-type': 'application/json',
      },
      status: 200,
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(callMoodleApi('https://moodle.example.test', 'token', 'core_test')).rejects.toMatchObject({
      category: 'response_too_large',
      code: 'response_too_large',
    } satisfies Partial<MoodleApiError>)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
