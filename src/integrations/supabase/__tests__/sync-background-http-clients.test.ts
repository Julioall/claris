import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchActivityFeed } from '@/features/auth/api/activity-feed.repository';
import {
  listAvailableMoodleCourses,
  startInitialMoodleSync,
} from '@/features/auth/api/moodle-sync-jobs';
import {
  listActiveBackgroundJobDtos,
  listAdminBackgroundJobDtos,
} from '@/features/background-jobs/api/background-jobs.client';

const invokeEdgeFunctionMock = vi.fn();

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: (...args: unknown[]) => invokeEdgeFunctionMock(...args),
}));

const COURSE_ID = '11111111-1111-4111-8111-111111111111';

function syncJob() {
  return {
    completedAt: null,
    courseIds: [COURSE_ID],
    createdAt: '2026-07-21T12:00:00.000Z',
    entities: ['students', 'activities', 'grades'],
    errorCount: 0,
    errorMessage: null,
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'initial',
    processedItems: 0,
    startedAt: null,
    status: 'pending',
    steps: [{
      entity: 'courses',
      errorMessage: null,
      processedItems: 0,
      recordCount: 0,
      status: 'pending',
      totalItems: 1,
    }],
    successCount: 0,
    totalItems: 5,
    updatedAt: '2026-07-21T12:00:00.000Z',
  };
}

function backgroundJob() {
  return {
    canCancel: true,
    canRetry: false,
    completedAt: null,
    courseId: COURSE_ID,
    createdAt: '2026-07-21T12:00:00.000Z',
    description: 'Executando',
    errorCount: 0,
    errorMessage: null,
    id: '33333333-3333-4333-8333-333333333333',
    jobType: 'moodle_sync',
    metadata: {},
    processedItems: 1,
    source: 'sync',
    sourceRecordId: null,
    sourceTable: 'moodle_sync_request',
    startedAt: '2026-07-21T12:01:00.000Z',
    status: 'processing',
    successCount: 1,
    title: 'Sincronizacao Moodle',
    totalItems: 5,
    updatedAt: '2026-07-21T12:02:00.000Z',
    user: null,
    userId: '44444444-4444-4444-8444-444444444444',
  };
}

describe('sync and background HTTP clients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps the Moodle course DTO without exposing a token or actor id', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({
      contractVersion: 1,
      items: [{
        category: 'Instituicao > Escola > Evento',
        createdAt: '2026-07-21T12:00:00.000Z',
        endsAt: null,
        id: COURSE_ID,
        lastSynchronizedAt: null,
        moodleCourseId: '123',
        name: 'Matematica',
        shortName: 'MAT',
        startsAt: null,
        updatedAt: '2026-07-21T12:00:00.000Z',
      }],
    });

    await expect(listAvailableMoodleCourses()).resolves.toEqual([
      expect.objectContaining({ id: COURSE_ID, moodle_course_id: '123', short_name: 'MAT' }),
    ]);
    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('moodle-sync-jobs', {
      body: { action: 'list_available_courses' },
      timeoutMs: 60_000,
    });
  });

  it('starts an initial job with scope only and validates the versioned response', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({ contractVersion: 1, duplicate: false, job: syncJob() });

    await expect(startInitialMoodleSync([COURSE_ID])).resolves.toMatchObject({
      contractVersion: 1,
      duplicate: false,
      job: { id: '22222222-2222-4222-8222-222222222222' },
    });
    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('moodle-sync-jobs', {
      body: { action: 'start_initial_sync', courseIds: [COURSE_ID] },
      timeoutMs: 60_000,
    });

    invokeEdgeFunctionMock.mockResolvedValueOnce({ contractVersion: 1, job: syncJob() });
    await expect(startInitialMoodleSync([COURSE_ID])).rejects.toThrow(/resposta invalida/i);
  });

  it('uses one owner endpoint and one backend-scoped admin endpoint for jobs', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({ contractVersion: 1, items: [backgroundJob()] });
    await expect(listActiveBackgroundJobDtos()).resolves.toHaveLength(1);
    expect(invokeEdgeFunctionMock).toHaveBeenNthCalledWith(1, 'background-jobs', {
      body: { action: 'list_active' },
    });

    invokeEdgeFunctionMock.mockResolvedValueOnce({
      contractVersion: 1,
      items: [backgroundJob()],
      page: 2,
      pageSize: 20,
      totalCount: 21,
      totalPages: 2,
    });
    await listAdminBackgroundJobDtos({
      filters: { source: 'sync', status: 'processing' },
      page: 2,
      pageSize: 20,
    });
    expect(invokeEdgeFunctionMock).toHaveBeenNthCalledWith(2, 'background-jobs', {
      body: {
        action: 'admin_list',
        filters: { source: 'sync', status: 'processing' },
        page: 2,
        pageSize: 20,
      },
    });
  });

  it('maps activity-feed camelCase DTOs to the existing view model', async () => {
    invokeEdgeFunctionMock.mockResolvedValue({
      contractVersion: 1,
      items: [{
        createdAt: '2026-07-21T12:00:00.000Z',
        description: 'Concluido',
        eventType: 'sync_finish',
        id: 'feed-1',
        metadata: { severity: 'info' },
        title: 'Sincronizacao concluida',
      }],
    });

    await expect(fetchActivityFeed(10)).resolves.toEqual([{
      created_at: '2026-07-21T12:00:00.000Z',
      description: 'Concluido',
      event_type: 'sync_finish',
      id: 'feed-1',
      metadata: { severity: 'info' },
      title: 'Sincronizacao concluida',
    }]);
    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('activity-feed', {
      body: { action: 'list', limit: 10 },
    });
  });
});
