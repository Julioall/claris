import { describe, expect, it, vi } from 'vitest'
import { parseMoodleCourseSnapshotPayload } from '../../../../supabase/functions/moodle-course-snapshot/payload'
import { executeMoodleCourseSnapshot } from '../../../../supabase/functions/moodle-course-snapshot/service'
import type {
  RefreshRequestResult,
  SnapshotRepository,
} from '../../../../supabase/functions/moodle-course-snapshot/repository'

const CONNECTION_ID = '11111111-1111-4111-8111-111111111111'
const COURSE_ID = '22222222-2222-4222-8222-222222222222'
const JOB_ID = '33333333-3333-4333-8333-333333333333'
const SITE_ID = '44444444-4444-4444-8444-444444444444'

function refresh(status: RefreshRequestResult['refresh_status']): RefreshRequestResult {
  return {
    accepted_entities: ['grades'],
    job_id: status === 'cooldown' ? null : JOB_ID,
    moodle_site_id: SITE_ID,
    refresh_status: status,
    requested_at: '2026-07-21T12:00:00.000Z',
    retry_after_seconds: status === 'cooldown' ? 37 : null,
  }
}

function repository(overrides: Partial<SnapshotRepository> = {}): SnapshotRepository {
  return {
    isFreshnessRolloutEnabled: vi.fn().mockResolvedValue(true),
    getSnapshot: vi.fn().mockResolvedValue({
      activeJobs: [],
      connection: { moodle_site_id: SITE_ID },
      counts: { activities: 8, grades: 12, students: 10 },
      course: {
        category: 'Tecnologia',
        end_date: null,
        moodle_site_id: SITE_ID,
        name: 'Curso de teste',
        observed_at: '2026-07-21T11:00:00.000Z',
        short_name: 'TESTE',
        source_updated_at: null,
        start_date: null,
      },
      errorCodes: {},
      policies: [{ entity: 'grades', stale_after_seconds: 600 }],
      watermarks: [{ entity: 'grades', last_successful_sync_at: '2026-07-21T10:00:00.000Z' }],
    }),
    reclassify: vi.fn().mockResolvedValue(undefined),
    requestRefresh: vi.fn().mockResolvedValue(refresh('queued')),
    ...overrides,
  }
}

describe('Moodle course snapshot V2 contract', () => {
  it('accepts internal IDs only and rejects browser Moodle routing fields', () => {
    expect(parseMoodleCourseSnapshotPayload({
      action: 'get_course_snapshot',
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      entities: ['grades'],
      refreshPolicy: 'if_stale',
    })).toEqual(expect.objectContaining({ connectionId: CONNECTION_ID, courseId: COURSE_ID }))

    expect(() => parseMoodleCourseSnapshotPayload({
      action: 'get_course_snapshot',
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      entities: ['grades'],
      refreshPolicy: 'never',
      moodleUrl: 'https://ead.fieg.com.br',
      token: 'secret',
    })).toThrow('Invalid request fields')
  })

  it('returns the stale Claris snapshot before atomically queueing refresh', async () => {
    const repo = repository()
    const result = await executeMoodleCourseSnapshot(repo, 'actor', {
      action: 'get_course_snapshot',
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      entities: ['grades'],
      refreshPolicy: 'if_stale',
    }, new Date('2026-07-21T12:00:00.000Z'))

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      connectionId: CONNECTION_ID,
      contractVersion: 2,
      courseId: COURSE_ID,
      data: { counts: { grades: 12 } },
      refresh: { jobId: JOB_ID, status: 'queued' },
    })
    expect(result.body.freshness).toEqual([
      expect.objectContaining({ entity: 'grades', state: 'stale' }),
    ])
    expect(repo.requestRefresh).toHaveBeenCalledWith(
      'actor', CONNECTION_ID, COURSE_ID, ['grades'], 'stale_read',
    )
  })

  it('maps a manual cooldown to 429 with Retry-After metadata', async () => {
    const repo = repository({ requestRefresh: vi.fn().mockResolvedValue(refresh('cooldown')) })
    const result = await executeMoodleCourseSnapshot(repo, 'actor', {
      action: 'request_course_refresh',
      connectionId: CONNECTION_ID,
      courseId: COURSE_ID,
      entities: ['grades'],
      reason: 'manual',
    })

    expect(result).toMatchObject({
      body: { code: 'moodle_refresh_cooldown', retryAfterSeconds: 37 },
      retryAfterSeconds: 37,
      status: 429,
    })
  })

  it('serves the Claris snapshot without reclassification or refresh when freshness rollout is disabled', async () => {
    const repo = repository({ isFreshnessRolloutEnabled: vi.fn().mockResolvedValue(false) })
    const result = await executeMoodleCourseSnapshot(repo, 'actor', {
      action: 'get_course_snapshot', connectionId: CONNECTION_ID, courseId: COURSE_ID,
      entities: ['grades'], refreshPolicy: 'if_stale',
    }, new Date('2026-07-21T12:00:00.000Z'))

    expect(result).toMatchObject({
      status: 200,
      body: {
        data: { counts: { grades: 12 } },
        refresh: { jobId: null, status: 'disabled' },
      },
    })
    expect(repo.reclassify).not.toHaveBeenCalled()
    expect(repo.requestRefresh).not.toHaveBeenCalled()
  })

  it('rejects an explicit freshness request while the rollout is disabled', async () => {
    const repo = repository({ isFreshnessRolloutEnabled: vi.fn().mockResolvedValue(false) })

    await expect(executeMoodleCourseSnapshot(repo, 'actor', {
      action: 'request_course_refresh', connectionId: CONNECTION_ID, courseId: COURSE_ID,
      entities: ['grades'], reason: 'manual',
    })).rejects.toMatchObject({
      code: 'moodle_sync_freshness_rollout_disabled',
      status: 409,
    })
    expect(repo.requestRefresh).not.toHaveBeenCalled()
  })

  it('preserves an active refresh instead of enqueuing another job', async () => {
    const repo = repository({
      getSnapshot: vi.fn().mockResolvedValue({
        activeJobs: [{ id: JOB_ID, entities: ['grades'] }],
        connection: { moodle_site_id: SITE_ID },
        counts: { activities: 0, grades: 1, students: 1 },
        course: {
          category: null, end_date: null, moodle_site_id: SITE_ID, name: 'Curso',
          observed_at: null, short_name: null, source_updated_at: null, start_date: null,
        },
        errorCodes: {}, policies: [], watermarks: [],
      }),
    })
    const result = await executeMoodleCourseSnapshot(repo, 'actor', {
      action: 'get_course_snapshot', connectionId: CONNECTION_ID, courseId: COURSE_ID,
      entities: ['grades'], refreshPolicy: 'if_stale',
    })

    expect(result.body.freshness).toEqual([
      expect.objectContaining({ refreshJobId: JOB_ID, state: 'refreshing' }),
    ])
    expect(repo.requestRefresh).not.toHaveBeenCalled()
  })
})
