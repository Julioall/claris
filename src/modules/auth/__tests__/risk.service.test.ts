import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recalculateRiskForCourses } from '@/modules/auth/application/risk.service';

const rpcMock = vi.fn();
const fromMock = vi.fn();
const selectMock = vi.fn();
const inMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

describe('risk.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    fromMock.mockReturnValue({
      select: selectMock,
    });
    selectMock.mockReturnValue({
      in: inMock,
    });
  });

  it('uses course-level RPCs when they exist', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: 2, error: null })
      .mockResolvedValueOnce({ data: 3, error: null });

    const result = await recalculateRiskForCourses(['course-1', 'course-2']);

    expect(rpcMock).toHaveBeenNthCalledWith(1, 'update_course_students_risk', {
      p_course_id: 'course-1',
    });
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'update_course_students_risk', {
      p_course_id: 'course-2',
    });
    expect(result).toEqual({
      failedCount: 0,
      updatedCount: 5,
      missingRpc: false,
      usedFallback: false,
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('falls back to student-level RPCs when the course RPC is missing', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: 'PGRST202',
          message: 'could not find the function public.update_course_students_risk',
        },
      })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    inMock.mockResolvedValueOnce({
      data: [
        { student_id: 'student-1' },
        { student_id: 'student-1' },
        { student_id: 'student-2' },
      ],
      error: null,
    });

    const result = await recalculateRiskForCourses(['course-1']);

    expect(fromMock).toHaveBeenCalledWith('student_courses');
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'update_student_risk', {
      p_student_id: 'student-1',
    });
    expect(rpcMock).toHaveBeenNthCalledWith(3, 'update_student_risk', {
      p_student_id: 'student-2',
    });
    expect(result).toEqual({
      failedCount: 0,
      updatedCount: 2,
      missingRpc: false,
      usedFallback: true,
    });
  });
});
