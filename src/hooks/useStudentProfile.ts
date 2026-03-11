import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { RiskLevel } from '@/types';

interface StudentProfile {
  id: string;
  moodle_user_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  current_risk_level: RiskLevel;
  risk_reasons: string[] | null;
  tags: string[] | null;
  last_access: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface PendingTask {
  id: string;
  student_id: string;
  course_id: string | null;
  title: string;
  description: string | null;
  task_type: 'moodle' | 'interna';
  status: 'aberta' | 'em_andamento' | 'resolvida';
  priority: 'baixa' | 'media' | 'alta' | 'urgente';
  due_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface Note {
  id: string;
  student_id: string;
  user_id: string;
  content: string;
  pending_task_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface StudentProfileData {
  student: StudentProfile | null;
  pendingTasks: PendingTask[];
  notes: Note[];
  stats: {
    pendingTasksCount: number;
  };
}

export function useStudentProfile(studentId: string | undefined) {
  const { user } = useAuth();
  const [data, setData] = useState<StudentProfileData>({
    student: null,
    pendingTasks: [],
    notes: [],
    stats: {
      pendingTasksCount: 0,
    },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStudentData = useCallback(async () => {
    if (!studentId || !user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch student basic info
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single();

      if (studentError) {
        if (studentError.code === 'PGRST116') {
          setError('Aluno não encontrado');
        } else {
          throw studentError;
        }
        setIsLoading(false);
        return;
      }

      // Fetch pending tasks
      const { data: pendingTasks, error: tasksError } = await supabase
        .from('pending_tasks')
        .select('*')
        .eq('student_id', studentId)
        .order('due_date', { ascending: true });

      if (tasksError) throw tasksError;

      // Fetch notes
      const { data: notes, error: notesError } = await supabase
        .from('notes')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

      if (notesError) throw notesError;

      // Calculate stats
      const openTasksCount = (pendingTasks || []).filter(t => t.status !== 'resolvida').length;
      setData({
        student: {
          ...student,
          current_risk_level: student.current_risk_level as RiskLevel,
        } as StudentProfile,
        pendingTasks: (pendingTasks || []) as PendingTask[],
        notes: (notes || []) as Note[],
        stats: {
          pendingTasksCount: openTasksCount,
        },
      });
    } catch (err) {
      console.error('Error fetching student profile:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar perfil do aluno');
    } finally {
      setIsLoading(false);
    }
  }, [studentId, user]);

  useEffect(() => {
    fetchStudentData();
  }, [fetchStudentData]);

  return { 
    ...data, 
    isLoading, 
    error, 
    refetch: fetchStudentData 
  };
}
