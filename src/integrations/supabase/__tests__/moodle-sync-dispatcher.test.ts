import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  dispatchDueMoodleSyncs,
  mapMoodleSyncDispatchResult,
} from '../../../../supabase/functions/moodle-sync-dispatcher/service.ts'

const migration = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260721390000_add_moodle_sync_dispatcher.sql',
), 'utf8')
const endpoint = readFileSync(resolve(
  process.cwd(),
  'supabase/functions/moodle-sync-dispatcher/index.ts',
), 'utf8')
const service = readFileSync(resolve(
  process.cwd(),
  'supabase/functions/moodle-sync-dispatcher/service.ts',
), 'utf8')
const compose = readFileSync(resolve(process.cwd(), 'docker-compose.dev.yml'), 'utf8')
const runnerScript = readFileSync(resolve(process.cwd(), 'scripts/start-supabase.sh'), 'utf8')
const deployScript = readFileSync(resolve(process.cwd(), 'scripts/deploy-supabase-functions.mjs'), 'utf8')

describe('Moodle sync dispatcher', () => {
  it('maps only the compact scheduler result and aggregates statuses', () => {
    expect(mapMoodleSyncDispatchResult([
      {
        connection_id: 'connection-a',
        course_id: 'course-a',
        dispatch_status: 'queued',
        job_id: 'job-a',
        next_incremental_at: '2026-07-26T12:00:00.000Z',
        trigger: 'scheduler',
      },
      {
        connection_id: 'connection-b',
        course_id: 'course-b',
        dispatch_status: 'deduplicated',
        job_id: 'job-b',
        next_incremental_at: null,
        trigger: 'reconciliation',
      },
      { provider_payload: 'must-not-leak' },
    ])).toEqual({
      counts: { deduplicated: 1, queued: 1 },
      items: [
        {
          connectionId: 'connection-a',
          courseId: 'course-a',
          dispatchStatus: 'queued',
          jobId: 'job-a',
          nextIncrementalAt: '2026-07-26T12:00:00.000Z',
          trigger: 'scheduler',
        },
        {
          connectionId: 'connection-b',
          courseId: 'course-b',
          dispatchStatus: 'deduplicated',
          jobId: 'job-b',
          nextIncrementalAt: null,
          trigger: 'reconciliation',
        },
      ],
    })
  })

  it('uses the service-only dispatch RPC with a bounded caller limit', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        connection_id: 'connection-a',
        course_id: 'course-a',
        dispatch_status: 'fresh',
        job_id: null,
        next_incremental_at: '2026-07-26T12:00:00.000Z',
        trigger: 'scheduler',
      }],
      error: null,
    }))

    await expect(dispatchDueMoodleSyncs({ rpc } as never, 25)).resolves.toMatchObject({
      counts: { fresh: 1 },
    })
    expect(rpc).toHaveBeenCalledWith('backend_dispatch_due_moodle_syncs', { p_limit: 25 })
  })

  it('uses SKIP LOCKED, active-job deduplication and full reconciliation without Moodle I/O', () => {
    expect(migration).toContain('FOR UPDATE OF state_row SKIP LOCKED')
    expect(migration).toContain("backend_moodle_sync_rollout_enabled(")
    expect(migration).toContain("'freshness'")
    expect(migration).toContain('backend_request_course_refresh_gated(')
    expect(migration).toContain("'reconciliation'")
    expect(migration).toContain('moodle_site_circuit_breakers')
    expect(migration).toContain('backend_update_moodle_sync_state_on_terminal_job')
    expect(migration).toContain('last_full_sync_at = CASE')
    expect(migration).not.toContain('http://')
    expect(migration).not.toContain('https://')
  })

  it('protects the endpoint with the worker cron secret and starts both scheduler phases locally', () => {
    expect(endpoint).toContain('MOODLE_SYNC_WORKER_CRON_SECRET')
    expect(endpoint).toContain('dispatchDueMoodleSyncs')
    expect(service).toContain('backend_dispatch_due_moodle_syncs')
    expect(compose).toContain('moodle-sync-runner:')
    expect(compose).toContain('/functions/v1/moodle-sync-dispatcher')
    expect(compose).toContain('/functions/v1/moodle-sync-worker')
    expect(compose).toContain('x-moodle-sync-worker-secret')
    expect(runnerScript).toContain('write_secret "MOODLE_SYNC_WORKER_CRON_SECRET"')
    expect(deployScript).toContain("'moodle-sync-dispatcher'")
  })
})
