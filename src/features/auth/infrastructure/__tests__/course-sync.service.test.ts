import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Course } from '@/features/courses/types';
import type { MoodleSession } from '../../domain/session';
import { runBatchedEntitySync } from '../course-sync.service';

const invokeMoodleFunctionWithTimeoutMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('../moodle-api', () => ({
  invokeMoodleFunctionWithTimeout: (...args: unknown[]) => invokeMoodleFunctionWithTimeoutMock(...args),
}));

const session: MoodleSession = {
  moodleToken: 'moodle-token',
  moodleUrl: 'https://moodle.example.com',
  moodleUserId: 10,
};

const course = {
  id: 'course-1',
  moodle_course_id: '101',
  name: 'Matematica',
} as Course;

describe('course-sync.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('continues activity sync while the edge function reports more student batches', async () => {
    invokeMoodleFunctionWithTimeoutMock
      .mockResolvedValueOnce({
        data: { activitiesCount: 12, hasMore: true, nextStudentBatchPage: 2 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { activitiesCount: 5, hasMore: false },
        error: null,
      });

    const result = await runBatchedEntitySync({
      accessToken: 'edge-token',
      entity: 'activities',
      selectedCourses: [course],
      session,
    });

    expect(result).toEqual({ totalCount: 17, succeeded: true, errorCount: 0 });
    expect(invokeMoodleFunctionWithTimeoutMock).toHaveBeenCalledTimes(2);
    expect(invokeMoodleFunctionWithTimeoutMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        functionName: 'moodle-sync-activities',
        body: expect.objectContaining({
          courseId: 101,
          studentBatchPage: 1,
          studentBatchSize: 12,
        }),
      }),
    );
    expect(invokeMoodleFunctionWithTimeoutMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: expect.objectContaining({
          studentBatchPage: 2,
          studentBatchSize: 12,
        }),
      }),
    );
  });
});
