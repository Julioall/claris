import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSupabaseClient } from '../../../../supabase/functions/_shared/db/mod.ts';
import { recalculateRiskForCourses } from '../../../../supabase/functions/_shared/domain/risk/recalculation.ts';

const rpcMock = vi.fn();
const fromMock = vi.fn();
const selectMock = vi.fn();
const inMock = vi.fn();

function client(): AppSupabaseClient {
  return {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  } as unknown as AppSupabaseClient;
}

describe('backend risk recalculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReturnValue({ select: selectMock });
    selectMock.mockReturnValue({ in: inMock });
  });

  it('deduplicates courses and aggregates course-level RPC results', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: 2, error: null })
      .mockResolvedValueOnce({ data: 3, error: null });

    await expect(recalculateRiskForCourses(client(), ['course-1', 'course-1', 'course-2']))
      .resolves.toEqual({
        failedCount: 0,
        missingRpc: false,
        updatedCount: 5,
        usedFallback: false,
      });
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'update_course_students_risk', { p_course_id: 'course-1' });
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'update_course_students_risk', { p_course_id: 'course-2' });
  });

  it('falls back to unique students when the course RPC is unavailable', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function' },
      })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    inMock.mockResolvedValue({
      data: [
        { student_id: 'student-1' },
        { student_id: 'student-1' },
        { student_id: 'student-2' },
      ],
      error: null,
    });

    await expect(recalculateRiskForCourses(client(), ['course-1'])).resolves.toEqual({
      failedCount: 0,
      missingRpc: false,
      updatedCount: 2,
      usedFallback: true,
    });
    expect(fromMock).toHaveBeenCalledWith('student_courses');
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'update_student_risk', { p_student_id: 'student-1' });
    expect(rpcMock).toHaveBeenNthCalledWith(3, 'update_student_risk', { p_student_id: 'student-2' });
  });

  it('retries a deadlocked backend RPC', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { code: '40P01', message: 'deadlock detected' } })
      .mockResolvedValueOnce({ data: 4, error: null });

    await expect(recalculateRiskForCourses(client(), ['course-1'])).resolves.toEqual({
      failedCount: 0,
      missingRpc: false,
      updatedCount: 4,
      usedFallback: false,
    });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it('short-circuits an empty scope', async () => {
    await expect(recalculateRiskForCourses(client(), [])).resolves.toEqual({
      failedCount: 0,
      missingRpc: false,
      updatedCount: 0,
      usedFallback: false,
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });
});
