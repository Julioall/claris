import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  isStudentActivityPendingSubmission,
  isStudentActivityWeightedInGradebook,
} from '@/lib/student-activity-status';

export interface StudentSyncSnapshot {
  id: string;
  student_id: string;
  course_id: string;
  synced_at: string;
  risk_level: string;
  enrollment_status: string;
  last_access: string | null;
  days_since_access: number | null;
  pending_activities: number;
  overdue_activities: number;
  resolved_pending_activities?: number;
  resolved_overdue_activities?: number;
  created_at: string;
  courses?: {
    name: string;
    short_name: string;
    start_date?: string | null;
    end_date?: string | null;
  } | null;
}

interface StudentActivityRow {
  course_id: string;
  due_date: string | null;
  activity_type: string | null;
  grade: number | null;
  grade_max: number | null;
  percentage: number | null;
  status: string | null;
  completed_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
}

function toTimeOrNull(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function isPastCourse(snapshot: StudentSyncSnapshot, nowTime: number) {
  const endTime = toTimeOrNull(snapshot.courses?.end_date);
  return endTime !== null && endTime < nowTime;
}

export function useStudentHistory(studentId: string | undefined) {
  return useQuery({
    queryKey: ['student-history', studentId],
    queryFn: async (): Promise<StudentSyncSnapshot[]> => {
      if (!studentId) return [];

      const { data: snapshotData, error: snapshotError } = await supabase
        .from('student_sync_snapshots')
        .select('*, courses(name, short_name, start_date, end_date)')
        .eq('student_id', studentId)
        .order('synced_at', { ascending: false })
        .limit(60);

      if (snapshotError) throw snapshotError;

      const { data: activityData, error: activityError } = await supabase
        .from('student_activities')
        .select('course_id, due_date, activity_type, grade, grade_max, percentage, status, completed_at, submitted_at, graded_at')
        .eq('student_id', studentId)
        .eq('hidden', false);

      if (activityError) throw activityError;

      const activityCountsByCourse = new Map<string, { pending: number; overdue: number }>();
      const now = new Date();

      for (const activity of (activityData ?? []) as StudentActivityRow[]) {
        if (!isStudentActivityWeightedInGradebook(activity)) continue;
        if (!isStudentActivityPendingSubmission(activity)) continue;

        const existing = activityCountsByCourse.get(activity.course_id) ?? { pending: 0, overdue: 0 };
        existing.pending += 1;

        if (activity.due_date && new Date(activity.due_date) < now) {
          existing.overdue += 1;
        }

        activityCountsByCourse.set(activity.course_id, existing);
      }

      const nowTime = Date.now();

      const resolvedSnapshots = ((snapshotData ?? []) as StudentSyncSnapshot[]).map((snapshot) => {
        const courseCounts = activityCountsByCourse.get(snapshot.course_id);

        return {
          ...snapshot,
          resolved_pending_activities: courseCounts?.pending ?? snapshot.pending_activities,
          resolved_overdue_activities: courseCounts?.overdue ?? snapshot.overdue_activities,
        };
      });

      return resolvedSnapshots.sort((left, right) => {
        const leftPast = isPastCourse(left, nowTime);
        const rightPast = isPastCourse(right, nowTime);

        if (leftPast !== rightPast) {
          return leftPast ? 1 : -1;
        }

        const leftStart = toTimeOrNull(left.courses?.start_date) ?? Number.NEGATIVE_INFINITY;
        const rightStart = toTimeOrNull(right.courses?.start_date) ?? Number.NEGATIVE_INFINITY;

        if (rightStart !== leftStart) {
          return rightStart - leftStart;
        }

        const leftSynced = toTimeOrNull(left.synced_at) ?? Number.NEGATIVE_INFINITY;
        const rightSynced = toTimeOrNull(right.synced_at) ?? Number.NEGATIVE_INFINITY;

        return rightSynced - leftSynced;
      });
    },
    enabled: Boolean(studentId),
    staleTime: 5 * 60 * 1000,
  });
}
