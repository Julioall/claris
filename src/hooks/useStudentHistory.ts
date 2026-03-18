import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  created_at: string;
  courses?: { name: string; short_name: string } | null;
}

export function useStudentHistory(studentId: string | undefined) {
  return useQuery({
    queryKey: ['student-history', studentId],
    queryFn: async (): Promise<StudentSyncSnapshot[]> => {
      if (!studentId) return [];

      const { data, error } = await supabase
        .from('student_sync_snapshots')
        .select('*, courses(name, short_name)')
        .eq('student_id', studentId)
        .order('synced_at', { ascending: false })
        .limit(60);

      if (error) throw error;
      return (data ?? []) as StudentSyncSnapshot[];
    },
    enabled: Boolean(studentId),
    staleTime: 5 * 60 * 1000,
  });
}
