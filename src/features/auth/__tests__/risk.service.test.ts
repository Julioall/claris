import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recalculateRiskForCourses } from '@/features/auth/application/risk.service';

const recalculateMoodleRiskMock = vi.fn();

vi.mock('@/features/auth/api/moodle-sync-jobs', () => ({
  recalculateMoodleRisk: (...args: unknown[]) => recalculateMoodleRiskMock(...args),
}));

describe('risk.service', () => {
  const connectionId = 'connection-1';
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates unique course ids to the backend', async () => {
    recalculateMoodleRiskMock.mockResolvedValue({
      contractVersion: 2,
      failedCount: 1,
      missingRpc: false,
      updatedCount: 5,
      usedFallback: true,
    });

    const result = await recalculateRiskForCourses(connectionId, ['course-1', 'course-1', 'course-2']);

    expect(recalculateMoodleRiskMock).toHaveBeenCalledWith(connectionId, ['course-1', 'course-2']);
    expect(result).toEqual({
      failedCount: 1,
      missingRpc: false,
      updatedCount: 5,
      usedFallback: true,
    });
  });

  it('does not call the backend when no course was provided', async () => {
    await expect(recalculateRiskForCourses(connectionId, [])).resolves.toEqual({
      failedCount: 0,
      missingRpc: false,
      updatedCount: 0,
      usedFallback: false,
    });
    expect(recalculateMoodleRiskMock).not.toHaveBeenCalled();
  });
});
