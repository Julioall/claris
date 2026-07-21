import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recalculateRiskForCourses } from '@/features/auth/application/risk.service';

const recalculateMoodleRiskMock = vi.fn();

vi.mock('@/features/auth/api/moodle-sync-jobs', () => ({
  recalculateMoodleRisk: (...args: unknown[]) => recalculateMoodleRiskMock(...args),
}));

describe('risk.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates unique course ids to the backend', async () => {
    recalculateMoodleRiskMock.mockResolvedValue({
      contractVersion: 1,
      failedCount: 1,
      missingRpc: false,
      updatedCount: 5,
      usedFallback: true,
    });

    const result = await recalculateRiskForCourses(['course-1', 'course-1', 'course-2']);

    expect(recalculateMoodleRiskMock).toHaveBeenCalledWith(['course-1', 'course-2']);
    expect(result).toEqual({
      failedCount: 1,
      missingRpc: false,
      updatedCount: 5,
      usedFallback: true,
    });
  });

  it('does not call the backend when no course was provided', async () => {
    await expect(recalculateRiskForCourses([])).resolves.toEqual({
      failedCount: 0,
      missingRpc: false,
      updatedCount: 0,
      usedFallback: false,
    });
    expect(recalculateMoodleRiskMock).not.toHaveBeenCalled();
  });
});
