import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseGradeSuggestionJobsPayload } from '../../../../supabase/functions/grade-suggestion-jobs/payload.ts';
import type { GradeSuggestionJobsRepository } from '../../../../supabase/functions/grade-suggestion-jobs/repository.ts';
import {
  authorizeGradeSuggestionJobsAction,
  findLatestRelevantGradeSuggestionJob,
} from '../../../../supabase/functions/grade-suggestion-jobs/service.ts';

const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const COURSE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

function createRepository(): GradeSuggestionJobsRepository {
  return {
    findLatestRelevant: vi.fn(async () => null),
    findMoodleActivityId: vi.fn(async () => '321'),
    userCanAccessCourse: vi.fn(async () => true),
    userCanManageGradeSuggestions: vi.fn(async () => true),
  };
}

describe('grade-suggestion-jobs V1 contract', () => {
  let repository: GradeSuggestionJobsRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it('accepts only the UUID activity scope required by the use case', () => {
    expect(parseGradeSuggestionJobsPayload({
      action: 'find_latest_relevant',
      activityId: ACTIVITY_ID,
      courseId: COURSE_ID,
    })).toEqual({
      action: 'find_latest_relevant',
      activityId: ACTIVITY_ID,
      courseId: COURSE_ID,
    });
  });

  it.each([
    {},
    { action: 'find_latest_relevant', activityId: 'invalid', courseId: COURSE_ID },
    { action: 'find_latest_relevant', activityId: ACTIVITY_ID, courseId: 'invalid' },
    { action: 'find_latest_relevant', activityId: ACTIVITY_ID, courseId: COURSE_ID, userId: USER_ID },
    { action: 'find_latest_relevant', activityId: ACTIVITY_ID, courseId: COURSE_ID, user_id: USER_ID },
    { action: 'find_latest_relevant', activityId: ACTIVITY_ID, courseId: COURSE_ID, moodleActivityId: '321' },
    { action: 'unknown', activityId: ACTIVITY_ID, courseId: COURSE_ID },
  ])('rejects malformed, extra or client-provided identity fields: %o', (payload) => {
    expect(() => parseGradeSuggestionJobsPayload(payload)).toThrowError(
      expect.objectContaining({ status: 422 }),
    );
  });

  it('requires grades.suggestions.manage and course access', async () => {
    const payload = parseGradeSuggestionJobsPayload({
      action: 'find_latest_relevant',
      activityId: ACTIVITY_ID,
      courseId: COURSE_ID,
    });

    await expect(authorizeGradeSuggestionJobsAction(repository, USER_ID, payload)).resolves.toBe(true);
    expect(repository.userCanManageGradeSuggestions).toHaveBeenCalledWith(USER_ID);
    expect(repository.userCanAccessCourse).toHaveBeenCalledWith(USER_ID, COURSE_ID);

    vi.mocked(repository.userCanManageGradeSuggestions).mockResolvedValue(false);
    await expect(authorizeGradeSuggestionJobsAction(repository, USER_ID, payload)).resolves.toBe(false);

    vi.mocked(repository.userCanManageGradeSuggestions).mockResolvedValue(true);
    vi.mocked(repository.userCanAccessCourse).mockResolvedValue(false);
    await expect(authorizeGradeSuggestionJobsAction(repository, USER_ID, payload)).resolves.toBe(false);
  });

  it('derives the actor from auth and returns a camelCase DTO', async () => {
    vi.mocked(repository.findLatestRelevant).mockResolvedValue({
      activityName: 'Trabalho final',
      courseId: COURSE_ID,
      createdAt: '2026-07-21T11:30:00.000Z',
      errorCount: 1,
      errorMessage: null,
      jobId: '44444444-4444-4444-8444-444444444444',
      moodleActivityId: '321',
      processedItems: 3,
      status: 'processing',
      successCount: 2,
      totalItems: 5,
    });

    const result = await findLatestRelevantGradeSuggestionJob(repository, USER_ID, {
      action: 'find_latest_relevant',
      activityId: ACTIVITY_ID,
      courseId: COURSE_ID,
    }, new Date('2026-07-21T12:00:00.000Z'));

    expect(repository.findMoodleActivityId).toHaveBeenCalledWith({
      activityId: ACTIVITY_ID,
      courseId: COURSE_ID,
    });
    expect(repository.findLatestRelevant).toHaveBeenCalledWith({
      courseId: COURSE_ID,
      moodleActivityId: '321',
      userId: USER_ID,
    });
    expect(result).toEqual({
      job: expect.objectContaining({
        activityName: 'Trabalho final',
        jobId: '44444444-4444-4444-8444-444444444444',
        processedItems: 3,
      }),
      metadata: {
        contractVersion: 1,
        generatedAt: '2026-07-21T12:00:00.000Z',
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/userId|user_id|activity_name|processed_items/);
  });

  it('does not query jobs when the activity UUID is outside the course', async () => {
    vi.mocked(repository.findMoodleActivityId).mockResolvedValue(null);

    await expect(findLatestRelevantGradeSuggestionJob(repository, USER_ID, {
      action: 'find_latest_relevant',
      activityId: ACTIVITY_ID,
      courseId: COURSE_ID,
    })).rejects.toMatchObject({ code: 'not_found', status: 404 });
    expect(repository.findLatestRelevant).not.toHaveBeenCalled();
  });
});
