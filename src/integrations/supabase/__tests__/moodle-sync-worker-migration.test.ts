import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  cancelMoodleSyncJob,
  claimMoodleSyncItem,
  createMoodleSyncJobV2,
  retryMoodleSyncJob,
} from '../../../../supabase/functions/_shared/domain/moodle-sync/worker-repository.ts'

const migration = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260721320000_add_durable_moodle_sync_worker.sql',
), 'utf8')

const runner = readFileSync(resolve(
  process.cwd(),
  'supabase/functions/_shared/domain/moodle-sync/job-runner.ts',
), 'utf8')

const workerRepository = readFileSync(resolve(
  process.cwd(),
  'supabase/functions/_shared/domain/moodle-sync/worker-repository.ts',
), 'utf8')

const workerEndpoint = readFileSync(resolve(
  process.cwd(),
  'supabase/functions/moodle-sync-worker/index.ts',
), 'utf8')

const supabaseConfig = readFileSync(resolve(process.cwd(), 'supabase/config.toml'), 'utf8')

const RPC_NAMES = [
  'backend_create_moodle_sync_job_v2',
  'backend_claim_moodle_sync_item',
  'backend_heartbeat_moodle_sync_item',
  'backend_checkpoint_moodle_sync_item',
  'backend_complete_moodle_sync_item',
  'backend_fail_moodle_sync_item',
  'backend_cancel_moodle_sync_job',
  'backend_retry_moodle_sync_job',
  'backend_finalize_moodle_sync_job',
] as const

describe('durable Moodle sync worker migration', () => {
  it('defines every atomic worker transition as service-only', () => {
    for (const rpc of RPC_NAMES) {
      expect(migration).toContain(`FUNCTION public.${rpc}`)
      expect(migration).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${rpc}\\([^;]+ FROM PUBLIC, anon, authenticated;`,
      ))
      expect(migration).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${rpc}\\([^;]+ TO service_role;`,
      ))
    }

    expect(migration).not.toMatch(/GRANT EXECUTE[^;]+TO (?:anon|authenticated)/)
  })

  it('claims schema-v2 work atomically with leases, scope and backpressure', () => {
    expect(migration).toContain('FOR UPDATE OF item_row, connection_row, site_row SKIP LOCKED')
    expect(migration).toContain('context_row.schema_version = 2')
    expect(migration).toContain('course_row.moodle_site_id = connection_row.moodle_site_id')
    expect(migration).toContain('p_max_connection_leases')
    expect(migration).toContain('p_max_site_leases')
    expect(migration).toContain("last_error_code = 'lease_attempts_exhausted'")
  })

  it('creates job, immutable context and exact work plan in one transaction', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.backend_create_moodle_sync_job_v2')
    expect(migration).toContain('INSERT INTO public.background_jobs')
    expect(migration).toContain('INSERT INTO public.moodle_sync_job_context')
    expect(migration).toContain('INSERT INTO public.background_job_items')
    expect(migration).toContain('v_received_keys IS DISTINCT FROM v_expected_keys')
  })

  it('keeps checkpoints resumable and completion/watermarks transactional', () => {
    expect(migration).toContain('attempt_count = greatest(item_row.attempt_count - 1, 0)')
    expect(migration).toContain('INSERT INTO public.moodle_sync_watermarks')
    expect(migration).toContain('RETURN public.backend_finalize_moodle_sync_job(v_job_id)')
    expect(migration).toContain('idx_background_job_events_moodle_terminal')
  })
})

describe('durable Moodle sync runner', () => {
  it('uses a bounded budget and durable RPC checkpoints', () => {
    expect(runner).toContain('DEFAULT_MOODLE_SYNC_BUDGET_MS = 25_000')
    expect(runner).toContain('claimMoodleSyncItem')
    expect(runner).toContain('heartbeatMoodleSyncItem')
    expect(runner).toContain('checkpointMoodleSyncItem')
    expect(runner).toContain('completeMoodleSyncItem')
    expect(runner).toContain('failMoodleSyncItem')
    expect(workerRepository).toContain("'backend_claim_moodle_sync_item'")
  })

  it('resolves backend access from the immutable v2 connection context', () => {
    expect(runner).toContain(
      'resolveMoodleAccess(supabase, item.userId, item.moodleConnectionId)',
    )
    expect(runner).toContain('course.moodle_site_id !== item.moodleSiteId')
    expect(runner).toContain('metadata.schema_version !== 2')
    expect(runner).not.toContain("../moodle-reauth/access.ts")
    expect(runner).not.toContain('findUserById')
  })

  it('exposes a cron-only dispatcher entrypoint instead of relying on a browser lifetime', () => {
    expect(workerEndpoint).toContain('MOODLE_SYNC_WORKER_CRON_SECRET')
    expect(workerEndpoint).toContain('runMoodleSyncJob(body.jobId')
    expect(workerEndpoint).not.toContain('requireAuth: true')
    expect(supabaseConfig).toContain('[functions.moodle-sync-worker]')
  })
})

describe('durable Moodle sync worker repository', () => {
  it('maps a single claimed row and sends bounded worker controls to the RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        attempt_count: 1,
        item_cursor: { page: 2 },
        item_id: '50000000-0000-0000-0000-000000000001',
        item_key: 'grades:30000000-0000-0000-0000-000000000001',
        item_metadata: { course_id: '30000000-0000-0000-0000-000000000001' },
        job_id: '40000000-0000-0000-0000-000000000001',
        job_metadata: { schema_version: 2 },
        label: 'Grades',
        leased_until: '2026-07-21T12:01:00.000Z',
        max_attempts: 3,
        moodle_connection_id: '20000000-0000-0000-0000-000000000001',
        moodle_site_id: '10000000-0000-0000-0000-000000000001',
        sync_policy: {},
        user_id: '60000000-0000-0000-0000-000000000001',
      }],
      error: null,
    }))

    const claimed = await claimMoodleSyncItem({ rpc } as never, 'worker-a', {
      jobId: '40000000-0000-0000-0000-000000000001',
      leaseSeconds: 90,
      maxConnectionLeases: 2,
      maxSiteLeases: 4,
    })

    expect(claimed?.itemKey).toBe('grades:30000000-0000-0000-0000-000000000001')
    expect(claimed?.cursor).toEqual({ page: 2 })
    expect(rpc).toHaveBeenCalledWith('backend_claim_moodle_sync_item', {
      p_job_id: '40000000-0000-0000-0000-000000000001',
      p_lease_seconds: 90,
      p_max_connection_leases: 2,
      p_max_site_leases: 4,
      p_worker_id: 'worker-a',
    })
  })

  it('returns null when no item is eligible', async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }))
    await expect(claimMoodleSyncItem({ rpc } as never, 'worker-a')).resolves.toBeNull()
  })

  it('creates jobs through the bulk-rollout-gated RPC', async () => {
    const rpc = vi.fn(async () => ({ data: '40000000-0000-0000-0000-000000000001', error: null }))
    await expect(createMoodleSyncJobV2({ rpc } as never, {
      connectionId: '20000000-0000-0000-0000-000000000001',
      courseIds: ['30000000-0000-0000-0000-000000000001'],
      entities: ['grades'],
      items: [{ itemKey: 'grades:30000000-0000-0000-0000-000000000001', label: 'Grades', metadata: {} }],
      sourceRecordId: '40000000-0000-0000-0000-000000000001',
      syncKind: 'incremental',
      trigger: 'manual',
      userId: '60000000-0000-0000-0000-000000000001',
    })).resolves.toBe('40000000-0000-0000-0000-000000000001')
    expect(rpc).toHaveBeenCalledWith('backend_create_moodle_sync_job_v2_gated', expect.objectContaining({
      p_moodle_connection_id: '20000000-0000-0000-0000-000000000001',
      p_user_id: '60000000-0000-0000-0000-000000000001',
    }))
  })

  it('routes retry and cancellation through service-only transition RPCs', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }))
    const client = { rpc } as never

    await expect(cancelMoodleSyncJob(client, 'job-id', 'user-id')).resolves.toBe(true)
    await expect(retryMoodleSyncJob(client, 'job-id', 'user-id')).resolves.toBe(true)
    expect(rpc).toHaveBeenNthCalledWith(1, 'backend_cancel_moodle_sync_job', {
      p_job_id: 'job-id',
      p_user_id: 'user-id',
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'backend_retry_moodle_sync_job', {
      p_job_id: 'job-id',
      p_user_id: 'user-id',
    })
  })
})
