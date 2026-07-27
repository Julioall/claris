import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  BackgroundJobItemRecord,
  BackgroundJobRecord,
} from '../../../../supabase/functions/_shared/domain/background-jobs/repository.ts';
import { parseMoodleSyncJobsPayload } from '../../../../supabase/functions/moodle-sync-jobs/payload.ts';
import type { MoodleSyncJobsRepository } from '../../../../supabase/functions/moodle-sync-jobs/repository.ts';
import {
  authorizeMoodleSyncJobs,
  executeMoodleSyncJobs,
  mapMoodleSyncJob,
} from '../../../../supabase/functions/moodle-sync-jobs/service.ts';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const COURSE_ID = '22222222-2222-4222-8222-222222222222';
const JOB_ID = '33333333-3333-4333-8333-333333333333';
const CONNECTION_ID = '66666666-6666-4666-8666-666666666666';

function backgroundJob(overrides: Partial<BackgroundJobRecord> = {}): BackgroundJobRecord {
  return {
    completed_at: null,
    course_id: COURSE_ID,
    created_at: '2026-07-21T12:00:00.000Z',
    description: 'Sincronizacao pelo servidor',
    error_count: 0,
    error_message: null,
    id: JOB_ID,
    job_type: 'moodle_sync',
    metadata: {
      connection_id: CONNECTION_ID,
      course_ids: [COURSE_ID],
      entities: ['students'],
      schema_version: 2,
      sync_kind: 'incremental',
      trigger: 'manual',
    },
    processed_items: 0,
    source: 'sync',
    source_record_id: '44444444-4444-4444-8444-444444444444',
    source_table: 'moodle_sync_request',
    started_at: null,
    status: 'pending',
    success_count: 0,
    title: 'Sincronizacao Moodle',
    total_items: 2,
    updated_at: '2026-07-21T12:00:00.000Z',
    user_id: ACTOR_ID,
    ...overrides,
  };
}

function backgroundItem(overrides: Partial<BackgroundJobItemRecord> = {}): BackgroundJobItemRecord {
  return {
    completed_at: null,
    created_at: '2026-07-21T12:00:00.000Z',
    error_message: null,
    id: '55555555-5555-4555-8555-555555555555',
    item_key: `students:${COURSE_ID}`,
    job_id: JOB_ID,
    label: 'Sincronizar alunos',
    metadata: { entity: 'students', total_count: 7 },
    progress_current: 1,
    progress_total: 1,
    source_record_id: null,
    source_table: null,
    started_at: '2026-07-21T12:01:00.000Z',
    status: 'completed',
    updated_at: '2026-07-21T12:02:00.000Z',
    user_id: ACTOR_ID,
    ...overrides,
  };
}

function createRepository(): MoodleSyncJobsRepository {
  return {
    cancelOwnedJob: vi.fn(async () => null),
    createJob: vi.fn(async () => backgroundJob()),
    findActiveJob: vi.fn(async () => null),
    getCourseStudentCounts: vi.fn(async () => new Map([[COURSE_ID, 7]])),
    getJob: vi.fn(async () => backgroundJob()),
    getJobItems: vi.fn(async () => []),
    getPreferences: vi.fn(async () => null),
    hasCourseScope: vi.fn(async () => true),
    hasPermission: vi.fn(async () => true),
    isRolloutEnabled: vi.fn(async () => true),
    listActiveJobs: vi.fn(async () => []),
    linkEligibleCourses: vi.fn(async () => 1),
    resetOwnedJob: vi.fn(async () => null),
    savePreferences: vi.fn(async (_actorId, _connectionId, preferences) => preferences),
  };
}

function runtime() {
  return {
    listAvailableCourses: vi.fn(async () => []),
    recalculateRisk: vi.fn(async () => ({
      failedCount: 0,
      missingRpc: false,
      updatedCount: 0,
      usedFallback: false,
    })),
    schedule: vi.fn(),
  };
}

describe('moodle-sync-jobs V2 contract', () => {
  let repository: MoodleSyncJobsRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it('accepts only use-case fields and rejects identity, credentials and persistence names', () => {
    expect(parseMoodleSyncJobsPayload({
      action: 'start_course_sync',
      connectionId: CONNECTION_ID,
      courseIds: [COURSE_ID],
      entities: ['students', 'grades'],
    })).toEqual({
      action: 'start_course_sync',
      connectionId: CONNECTION_ID,
      courseIds: [COURSE_ID],
      entities: ['students', 'grades'],
    });

    for (const payload of [
      { action: 'list_available_courses', connectionId: CONNECTION_ID, userId: ACTOR_ID },
      { action: 'start_initial_sync', connectionId: CONNECTION_ID, courseIds: [COURSE_ID], moodleUrl: 'https://moodle.test' },
      { action: 'start_initial_sync', connectionId: CONNECTION_ID, courseIds: [COURSE_ID], token: 'browser-token' },
      { action: 'start_initial_sync', connectionId: CONNECTION_ID, courseIds: [COURSE_ID], password: 'secret' },
      { action: 'start_initial_sync', connectionId: CONNECTION_ID, course_ids: [COURSE_ID] },
      { action: 'start_course_sync', connectionId: CONNECTION_ID, courseIds: [COURSE_ID], entities: ['risk'] },
      { action: 'start_course_sync', courseIds: [COURSE_ID], entities: ['students'] },
    ]) {
      expect(() => parseMoodleSyncJobsPayload(payload)).toThrowError(
        expect.objectContaining({ status: 422 }),
      );
    }
  });

  it('authorizes catalog and incremental operations with backend permissions', async () => {
    const initial = parseMoodleSyncJobsPayload({
      action: 'start_initial_sync',
      connectionId: CONNECTION_ID,
      courseIds: [COURSE_ID],
    });
    const incremental = parseMoodleSyncJobsPayload({
      action: 'start_course_sync',
      connectionId: CONNECTION_ID,
      courseIds: [COURSE_ID],
      entities: ['students'],
    });

    await expect(authorizeMoodleSyncJobs(repository, ACTOR_ID, initial)).resolves.toBe(true);
    await expect(authorizeMoodleSyncJobs(repository, ACTOR_ID, incremental)).resolves.toBe(true);
    expect(repository.hasPermission).toHaveBeenNthCalledWith(1, ACTOR_ID, 'courses.catalog.view');
    expect(repository.hasPermission).toHaveBeenNthCalledWith(2, ACTOR_ID, 'courses.panel.view');
  });

  it('checks actor course scope before creating or scheduling a job', async () => {
    vi.mocked(repository.hasCourseScope).mockResolvedValue(false);
    const worker = runtime();

    await expect(executeMoodleSyncJobs(repository, ACTOR_ID, {
      action: 'start_course_sync',
      connectionId: CONNECTION_ID,
      courseIds: [COURSE_ID],
      entities: ['students'],
    }, worker)).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    expect(repository.createJob).not.toHaveBeenCalled();
    expect(worker.schedule).not.toHaveBeenCalled();
  });

  it('does not make Moodle bulk calls or create work while the rollout is disabled', async () => {
    vi.mocked(repository.isRolloutEnabled).mockResolvedValue(false);
    const worker = runtime();

    await expect(executeMoodleSyncJobs(repository, ACTOR_ID, {
      action: 'start_course_sync',
      connectionId: CONNECTION_ID,
      courseIds: [COURSE_ID],
      entities: ['grades'],
    }, worker)).rejects.toMatchObject({ code: 'conflict', status: 409 });
    expect(repository.createJob).not.toHaveBeenCalled();
    expect(worker.schedule).not.toHaveBeenCalled();

    await expect(executeMoodleSyncJobs(repository, ACTOR_ID, {
      action: 'list_available_courses',
      connectionId: CONNECTION_ID,
    }, worker)).rejects.toMatchObject({ code: 'conflict', status: 409 });
    expect(worker.listAvailableCourses).not.toHaveBeenCalled();
  });

  it('returns an active canonical request without scheduling a duplicate worker', async () => {
    vi.mocked(repository.findActiveJob).mockResolvedValue(backgroundJob({ status: 'processing' }));
    vi.mocked(repository.getJobItems).mockResolvedValue([backgroundItem()]);
    const worker = runtime();

    const result = await executeMoodleSyncJobs(repository, ACTOR_ID, {
      action: 'start_course_sync',
      connectionId: CONNECTION_ID,
      courseIds: [COURSE_ID],
      entities: ['students'],
    }, worker);

    expect(result).toMatchObject({
      contractVersion: 2,
      duplicate: true,
      job: {
        id: JOB_ID,
        steps: expect.arrayContaining([
          expect.objectContaining({ entity: 'students', recordCount: 7, status: 'completed' }),
        ]),
      },
    });
    expect(repository.createJob).not.toHaveBeenCalled();
    expect(worker.schedule).not.toHaveBeenCalled();
  });

  it('creates the complete initial-sync state machine and schedules it once', async () => {
    const worker = runtime();
    vi.mocked(repository.createJob).mockImplementation(async (input) => backgroundJob({
      metadata: {
        connection_id: input.connectionId,
        course_ids: input.courseIds,
        entities: input.entities,
        schema_version: 2,
        sync_kind: input.kind,
        trigger: input.trigger,
      },
      total_items: input.itemDefinitions.length,
    }));

    const result = await executeMoodleSyncJobs(repository, ACTOR_ID, {
      action: 'start_initial_sync',
      connectionId: CONNECTION_ID,
      courseIds: [COURSE_ID],
    }, worker);

    expect(repository.createJob).toHaveBeenCalledWith(expect.objectContaining({
      actorId: ACTOR_ID,
      connectionId: CONNECTION_ID,
      courseIds: [COURSE_ID],
      entities: ['students', 'activities', 'grades'],
      itemDefinitions: expect.arrayContaining([
        expect.objectContaining({ itemKey: `students:${COURSE_ID}` }),
        expect.objectContaining({ itemKey: `activities:${COURSE_ID}` }),
        expect.objectContaining({ itemKey: `grades:${COURSE_ID}` }),
        expect.objectContaining({ itemKey: 'risk' }),
      ]),
    }));
    expect(worker.schedule).toHaveBeenCalledOnce();
    expect(repository.linkEligibleCourses).toHaveBeenCalledWith(ACTOR_ID, CONNECTION_ID, [COURSE_ID]);
    expect(result).toMatchObject({ contractVersion: 2, duplicate: false, job: { totalItems: 4 } });
  });

  it('aggregates item records into a camelCase polling DTO', () => {
    const dto = mapMoodleSyncJob(backgroundJob({
      processed_items: 1,
      status: 'processing',
    }), [backgroundItem()]);

    expect(dto).toMatchObject({
      courseIds: [COURSE_ID],
      connectionId: CONNECTION_ID,
      kind: 'incremental',
      processedItems: 1,
      steps: expect.arrayContaining([
        expect.objectContaining({
          entity: 'students',
          processedItems: 1,
          recordCount: 7,
          status: 'completed',
        }),
      ]),
    });
    expect(JSON.stringify(dto)).not.toMatch(/course_ids|processed_items|total_count/);
  });

  it('adds a finalization step even when a refresh contains only grades', async () => {
    const worker = runtime();
    vi.mocked(repository.createJob).mockImplementation(async (input) => backgroundJob({
      metadata: {
        connection_id: input.connectionId,
        course_ids: input.courseIds,
        entities: input.entities,
        schema_version: 2,
        sync_kind: input.kind,
        trigger: input.trigger,
      },
      total_items: input.itemDefinitions.length,
    }));

    const result = await executeMoodleSyncJobs(repository, ACTOR_ID, {
      action: 'start_course_sync',
      connectionId: CONNECTION_ID,
      courseIds: [COURSE_ID],
      entities: ['grades'],
    }, worker);

    expect(repository.createJob).toHaveBeenCalledWith(expect.objectContaining({
      itemDefinitions: expect.arrayContaining([
        expect.objectContaining({ itemKey: `grades:${COURSE_ID}` }),
        expect.objectContaining({ itemKey: 'risk' }),
      ]),
    }));
    expect(result).toMatchObject({
      job: {
        steps: expect.arrayContaining([
          expect.objectContaining({ entity: 'grades' }),
          expect.objectContaining({ entity: 'risk' }),
        ]),
        totalItems: 2,
      },
    });
  });

  it('rejects legacy job metadata instead of running it implicitly', () => {
    expect(() => mapMoodleSyncJob(backgroundJob({
      metadata: {
        course_ids: [COURSE_ID],
        entities: ['students'],
        schema_version: 1,
        sync_kind: 'incremental',
      },
    }), [])).toThrowError(expect.objectContaining({ status: 409 }));
  });
});
