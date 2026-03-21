import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Course, Student } from '@/types';
import type { MoodleSession } from '@/modules/auth/domain/session';
import {
  authenticateMoodleUser,
  fetchMoodleCoursesFromSession,
} from '@/modules/auth/infrastructure/moodle-api';

interface LoginResult {
  success: boolean;
  user?: User;
  session?: MoodleSession;
  error?: string;
}

interface SyncCoursesResult {
  success: boolean;
  courses?: Course[];
  error?: string;
}

interface SyncStudentsResult {
  success: boolean;
  students?: Student[];
  error?: string;
}

export function useMoodleApi() {
  const [isLoading, setIsLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);

  const login = useCallback(async (
    username: string,
    password: string,
    moodleUrl: string
  ): Promise<LoginResult> => {
    setIsLoading(true);
    try {
      const result = await authenticateMoodleUser({ username, password, moodleUrl });
      if (!result.success) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        user: result.user,
        session: result.moodleSession || undefined,
      };
    } catch (err) {
      console.error('Login error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Erro ao conectar com o Moodle',
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const syncCourses = useCallback(async (session: MoodleSession): Promise<SyncCoursesResult> => {
    setIsLoading(true);
    setSyncProgress('Sincronizando cursos...');
    
    try {
      const result = await fetchMoodleCoursesFromSession(session, session.moodleUserId);
      if (result.handledError) {
        return { success: false, error: result.errorMessage || 'Erro ao sincronizar cursos' };
      }

      return {
        success: true,
        courses: result.courses,
      };
    } catch (err) {
      console.error('Sync courses error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Erro ao sincronizar cursos',
      };
    } finally {
      setIsLoading(false);
      setSyncProgress(null);
    }
  }, []);

  const syncStudents = useCallback(async (
    session: MoodleSession,
    courseId: string
  ): Promise<SyncStudentsResult> => {
    setIsLoading(true);
    setSyncProgress(`Sincronizando alunos do curso...`);
    
    try {
      const { data, error } = await supabase.functions.invoke('moodle-sync-students', {
        body: {
          moodleUrl: session.moodleUrl,
          token: session.moodleToken,
          courseId: parseInt(courseId, 10),
        },
      });

      if (error) {
        console.error('Sync students error:', error);
        return { success: false, error: error.message };
      }

      if (data.error) {
        return { success: false, error: data.error };
      }

      return {
        success: true,
        students: data.students,
      };
    } catch (err) {
      console.error('Sync students error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Erro ao sincronizar alunos',
      };
    } finally {
      setIsLoading(false);
      setSyncProgress(null);
    }
  }, []);

  const syncAllStudents = useCallback(async (
    session: MoodleSession,
    courses: Course[]
  ): Promise<{ success: boolean; totalStudents: number; error?: string }> => {
    setIsLoading(true);
    let totalStudents = 0;
    
    try {
      for (let i = 0; i < courses.length; i++) {
        const course = courses[i];
        setSyncProgress(`Sincronizando alunos (${i + 1}/${courses.length}): ${course.name}`);
        
        const result = await syncStudents(session, course.moodle_course_id);
        if (result.success && result.students) {
          totalStudents += result.students.length;
        }
      }

      return { success: true, totalStudents };
    } catch (err) {
      console.error('Sync all students error:', err);
      return {
        success: false,
        totalStudents,
        error: err instanceof Error ? err.message : 'Erro ao sincronizar alunos',
      };
    } finally {
      setIsLoading(false);
      setSyncProgress(null);
    }
  }, [syncStudents]);

  return {
    isLoading,
    syncProgress,
    login,
    syncCourses,
    syncStudents,
    syncAllStudents,
  };
}
