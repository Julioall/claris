import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeEdgeFunctionMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    readonly code: string;

    constructor(error: { code: string; message: string }) {
      super(error.message);
      this.code = error.code;
    }
  },
  invokeEdgeFunction: invokeEdgeFunctionMock,
}));

import { findLatestRelevantActivityGradeSuggestionJob } from '../gradeSuggestions';

const validResponse = {
  job: {
    activityName: 'Trabalho final',
    courseId: 'course-1',
    createdAt: '2026-07-21T11:30:00.000Z',
    errorCount: 1,
    errorMessage: null,
    jobId: 'job-1',
    moodleActivityId: '321',
    processedItems: 3,
    status: 'processing',
    successCount: 2,
    totalItems: 5,
  },
  metadata: {
    contractVersion: 1,
    generatedAt: '2026-07-21T12:00:00.000Z',
  },
};

describe('grade suggestion jobs API client', () => {
  beforeEach(() => {
    invokeEdgeFunctionMock.mockReset();
  });

  it('queries the backend use case without browser identity or Moodle identifiers', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce(validResponse);
    const controller = new AbortController();

    await expect(findLatestRelevantActivityGradeSuggestionJob({
      activityId: 'activity-row-1',
      courseId: 'course-1',
      signal: controller.signal,
    })).resolves.toEqual(validResponse.job);

    expect(invokeEdgeFunctionMock).toHaveBeenCalledWith('grade-suggestion-jobs', {
      auth: 'required',
      body: {
        action: 'find_latest_relevant',
        activityId: 'activity-row-1',
        courseId: 'course-1',
      },
      signal: controller.signal,
      timeoutMs: 15_000,
    });
    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).not.toHaveProperty('userId');
    expect(invokeEdgeFunctionMock.mock.calls[0][1].body).not.toHaveProperty('moodleActivityId');
  });

  it('accepts an explicit null job', async () => {
    invokeEdgeFunctionMock.mockResolvedValueOnce({
      ...validResponse,
      job: null,
    });

    await expect(findLatestRelevantActivityGradeSuggestionJob({
      activityId: 'activity-row-1',
      courseId: 'course-1',
    })).resolves.toBeNull();
  });

  it.each([
    { ...validResponse, metadata: { ...validResponse.metadata, contractVersion: 2 } },
    { ...validResponse, job: { ...validResponse.job, status: 'unknown' } },
    { ...validResponse, job: { ...validResponse.job, processedItems: 6 } },
    { ...validResponse, job: { ...validResponse.job, successCount: 3 } },
    { ...validResponse, job: { ...validResponse.job, totalItems: 5.5 } },
    { job: validResponse.job },
  ])('rejects responses outside the V1 contract: %o', async (response) => {
    invokeEdgeFunctionMock.mockResolvedValueOnce(response);

    await expect(findLatestRelevantActivityGradeSuggestionJob({
      activityId: 'activity-row-1',
      courseId: 'course-1',
    })).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
