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
      'background_job_events',
      'background_job_items',
      'background_jobs',
      'ai_grade_suggestion_job_items',
      'ai_grade_suggestion_history',
      'ai_grade_suggestion_jobs',
      'activity_feed',
      'attendance_records',
      'attendance_course_settings',
      'dashboard_course_activity_aggregates',
      'student_sync_snapshots',
      'student_activities',
      'student_course_grades',
      'student_courses',
      'user_courses',
      'user_ignored_courses',
      'courses',
    ]);
  });

  it('maps activities cleanup to the expanded activity-related tables before invoking the edge function', async () => {
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
          tables: [
            'ai_grade_suggestion_job_items',
            'ai_grade_suggestion_history',
            'ai_grade_suggestion_jobs',
            'dashboard_course_activity_aggregates',
            'student_activities',
            'student_course_grades',
          ],
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
