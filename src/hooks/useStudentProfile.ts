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

export function useStudentProfile(studentId: string | undefined) {
  const { user } = useAuth();
  const [student, setStudent] = useState<StudentProfile | null>(null);
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
      const { data: studentData, error: studentError } = await supabase
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

      setStudent({
        ...studentData,
        current_risk_level: studentData.current_risk_level as RiskLevel,
      } as StudentProfile);
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
    student, 
    isLoading, 
    error, 
    refetch: fetchStudentData 
  };
}

