import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BackgroundJobRecord } from '../../../../supabase/functions/_shared/domain/background-jobs/repository.ts';
import { parseBackgroundJobsPayload } from '../../../../supabase/functions/background-jobs/payload.ts';
import type { BackgroundJobsRepository } from '../../../../supabase/functions/background-jobs/repository.ts';
import {
  authorizeBackgroundJobs,
  executeBackgroundJobs,
  mapBackgroundJob,
} from '../../../../supabase/functions/background-jobs/service.ts';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';

function job(overrides: Partial<BackgroundJobRecord> = {}): BackgroundJobRecord {
  return {
    completed_at: null,
    course_id: null,
    created_at: '2026-07-21T12:00:00.000Z',
    description: 'Job em segundo plano',
    error_count: 0,
    error_message: null,
    id: JOB_ID,
    job_type: 'moodle_sync',
    metadata: {},
    processed_items: 1,
    source: 'sync',
    source_record_id: null,
    source_table: 'moodle_sync_request',
    started_at: '2026-07-21T12:01:00.000Z',
    status: 'processing',
    success_count: 1,
    title: 'Sincronizacao Moodle',
    total_items: 4,
    updated_at: '2026-07-21T12:02:00.000Z',
    user_id: ACTOR_ID,
    ...overrides,
  };
}

function repository(): BackgroundJobsRepository {
  return {
    adminCancel: vi.fn(async () => null),
    adminGetDetails: vi.fn(async () => null),
    adminList: vi.fn(async () => ({ items: [], totalCount: 0 })),
    adminRetry: vi.fn(async () => null),
    isAdmin: vi.fn(async () => true),
    listActive: vi.fn(async () => []),
  };
}

describe('background-jobs V1 contract', () => {
  let repo: BackgroundJobsRepository;

  beforeEach(() => {
    repo = repository();
  });

  it('rejects browser-controlled identity, snake_case and unknown filters', () => {
    expect(parseBackgroundJobsPayload({ action: 'list_active' })).toEqual({ action: 'list_active' });
    expect(parseBackgroundJobsPayload({
      action: 'admin_list',
      filters: { source: 'sync', status: 'processing' },
      page: 1,
      pageSize: 30,
    })).toEqual({
      action: 'admin_list',
      filters: { source: 'sync', status: 'processing' },
      page: 1,
      pageSize: 30,
    });

    for (const payload of [
      { action: 'list_active', userId: ACTOR_ID },
      { action: 'admin_get', job_id: JOB_ID },
      { action: 'admin_retry', jobId: JOB_ID, status: 'failed' },
      { action: 'admin_list', filters: { userId: ACTOR_ID }, page: 1, pageSize: 30 },
      { action: 'admin_list', filters: {}, page: 0, pageSize: 30 },
    ]) {
      expect(() => parseBackgroundJobsPayload(payload)).toThrowError(
        expect.objectContaining({ status: 422 }),
      );
    }
  });

  it('allows owner polling but requires an application admin for operational actions', async () => {
    await expect(authorizeBackgroundJobs(repo, ACTOR_ID, { action: 'list_active' })).resolves.toBe(true);
    expect(repo.isAdmin).not.toHaveBeenCalled();

    await expect(authorizeBackgroundJobs(repo, ACTOR_ID, {
      action: 'admin_get',
      jobId: JOB_ID,
    })).resolves.toBe(true);
    expect(repo.isAdmin).toHaveBeenCalledWith(ACTOR_ID);

    vi.mocked(repo.isAdmin).mockResolvedValue(false);
    await expect(authorizeBackgroundJobs(repo, ACTOR_ID, {
      action: 'admin_cancel',
      jobId: JOB_ID,
    })).resolves.toBe(false);
  });

  it('derives owner scope for active jobs and exposes backend capabilities', async () => {
    vi.mocked(repo.listActive).mockResolvedValue([job()]);

    const result = await executeBackgroundJobs(repo, ACTOR_ID, { action: 'list_active' });

    expect(repo.listActive).toHaveBeenCalledWith(ACTOR_ID);
    expect(result).toEqual({
      contractVersion: 1,
      items: [expect.objectContaining({
        canCancel: true,
        canRetry: false,
        id: JOB_ID,
        processedItems: 1,
        user: null,
        userId: ACTOR_ID,
      })],
    });
    expect(JSON.stringify(result)).not.toMatch(/user_id|processed_items|source_table/);
  });

  it('keeps retry and cancel capabilities in the backend state machine', () => {
    expect(mapBackgroundJob(job({ status: 'failed' }), null)).toMatchObject({
      canCancel: false,
      canRetry: true,
    });
    expect(mapBackgroundJob(job({
      job_type: 'scheduled_message',
      source: 'messages',
      source_table: 'scheduled_messages',
      status: 'pending',
    }), null)).toMatchObject({
      canCancel: true,
      canRetry: false,
    });
    expect(mapBackgroundJob(job({ job_type: 'unknown', source: 'other', status: 'failed' }), null))
      .toMatchObject({ canCancel: false, canRetry: false });
  });

  it('passes admin identity only to conditional backend transitions', async () => {
    vi.mocked(repo.adminRetry).mockResolvedValue(job({ status: 'pending' }));
    vi.mocked(repo.adminCancel).mockResolvedValue(job({ status: 'cancelled' }));

    await expect(executeBackgroundJobs(repo, ACTOR_ID, {
      action: 'admin_retry',
      jobId: JOB_ID,
    })).resolves.toMatchObject({ contractVersion: 1, job: { status: 'pending' } });
    await expect(executeBackgroundJobs(repo, ACTOR_ID, {
      action: 'admin_cancel',
      jobId: JOB_ID,
    })).resolves.toMatchObject({ contractVersion: 1, job: { status: 'cancelled' } });
    expect(repo.adminRetry).toHaveBeenCalledWith(ACTOR_ID, JOB_ID);
    expect(repo.adminCancel).toHaveBeenCalledWith(ACTOR_ID, JOB_ID);
  });

  it('returns a conflict when a transition loses its status race', async () => {
    await expect(executeBackgroundJobs(repo, ACTOR_ID, {
      action: 'admin_retry',
      jobId: JOB_ID,
    })).rejects.toMatchObject({ code: 'conflict', status: 409 });
  });
});
