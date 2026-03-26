import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupSelection, resolveCleanupTables } from '@/features/settings/api/cleanup';

const invokeMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

describe('settings cleanup api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expands course cleanup to include dependent tables', () => {
    expect(resolveCleanupTables('courses')).toEqual([
      'user_courses',
      'student_courses',
      'student_course_grades',
      'courses',
    ]);
  });

  it('maps activities cleanup to student_activities before invoking the edge function', async () => {
    invokeMock.mockResolvedValue({
      data: { success: true, cleaned: ['student_activities'], errors: [] },
      error: null,
    });

    const result = await cleanupSelection('activities');

    expect(result).toEqual({ success: true });
    expect(invokeMock).toHaveBeenCalledWith(
      'data-cleanup',
      expect.objectContaining({
        body: {
          mode: 'selected_cleanup',
          tables: ['student_activities'],
        },
      }),
    );
  });

  it('returns the first backend cleanup error when the edge function reports partial failure', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: false,
        cleaned: [],
        errors: [{ table: 'user_courses', error: 'fail user_courses' }],
      },
      error: null,
    });

    const result = await cleanupSelection('courses');

    expect(result).toEqual({
      success: false,
      error: 'fail user_courses',
    });
  });

  it('rejects unknown cleanup selections without calling the backend', async () => {
    const result = await cleanupSelection('unknown-table');

    expect(result).toEqual({
      success: false,
      error: 'Tabela desconhecida',
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
