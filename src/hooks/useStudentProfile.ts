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

interface Note {
  id: string;
  student_id: string;
  user_id: string;
  content: string;
  created_at: string | null;
  updated_at: string | null;
}

interface StudentProfileData {
  student: StudentProfile | null;
  notes: Note[];
}

export function useStudentProfile(studentId: string | undefined) {
  const { user } = useAuth();
  const [data, setData] = useState<StudentProfileData>({
    student: null,
    notes: [],
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

      // Fetch notes
      const { data: notes, error: notesError } = await supabase
        .from('notes')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

      if (notesError) throw notesError;

      setData({
        student: {
          ...student,
          current_risk_level: student.current_risk_level as RiskLevel,
        } as StudentProfile,
        notes: (notes || []) as Note[],
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
