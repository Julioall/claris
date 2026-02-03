import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, AuthContextType, Course } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { SyncStep } from '@/components/sync/SyncProgressDialog';

interface MoodleSession {
  moodleToken: string;
  moodleUserId: number;
  moodleUrl: string;
}

interface SyncProgress {
  isOpen: boolean;
  steps: SyncStep[];
  currentStep: string | null;
  isComplete: boolean;
  summary?: {
    courses: number;
    students: number;
    activities: number;
  };
}

interface ExtendedAuthContextType extends AuthContextType {
  moodleSession: MoodleSession | null;
  courses: Course[];
  setCourses: (courses: Course[]) => void;
  syncProgress: SyncProgress;
  closeSyncProgress: () => void;
}

const AuthContext = createContext<ExtendedAuthContextType | undefined>(undefined);

const STORAGE_KEY = 'guia_tutor_session';

const initialSteps: SyncStep[] = [
  { id: 'courses', label: 'Sincronizar cursos', icon: 'courses', status: 'pending' },
  { id: 'students', label: 'Sincronizar alunos', icon: 'students', status: 'pending' },
  { id: 'activities', label: 'Sincronizar atividades', icon: 'activities', status: 'pending' },
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [moodleSession, setMoodleSession] = useState<MoodleSession | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    isOpen: false,
    steps: initialSteps,
    currentStep: null,
    isComplete: false,
  });

  // Load session from storage on mount
  useEffect(() => {
    const loadSession = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const session = JSON.parse(stored);
          setUser(session.user);
          setMoodleSession(session.moodleSession);
          setLastSync(session.user?.last_sync || null);
        }
      } catch (err) {
        console.error('Error loading session:', err);
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  // Save session to storage whenever it changes
  const saveSession = useCallback((newUser: User | null, newMoodleSession: MoodleSession | null) => {
    if (newUser && newMoodleSession) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        user: newUser,
        moodleSession: newMoodleSession,
      }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const updateStep = useCallback((stepId: string, updates: Partial<SyncStep>) => {
    setSyncProgress(prev => ({
      ...prev,
      currentStep: updates.status === 'in_progress' ? stepId : prev.currentStep,
      steps: prev.steps.map(step => 
        step.id === stepId ? { ...step, ...updates } : step
      ),
    }));
  }, []);

  const closeSyncProgress = useCallback(() => {
    setSyncProgress(prev => ({ ...prev, isOpen: false }));
  }, []);

  const login = useCallback(async (username: string, password: string, moodleUrl: string, service: string = 'moodle_mobile_app'): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      const cleanUrl = moodleUrl.replace(/\/$/, '');
      
      const { data, error } = await supabase.functions.invoke('moodle-api', {
        body: {
          action: 'login',
          moodleUrl: cleanUrl,
          username,
          password,
          service,
        },
      });

      if (error) {
        console.error('Login error:', error);
        toast({
          title: "Erro de autenticação",
          description: error.message || "Não foi possível conectar ao Moodle",
          variant: "destructive",
        });
        return false;
      }

      if (data.error) {
        toast({
          title: "Erro de autenticação",
          description: data.error === 'invalidlogin' 
            ? "Usuário ou senha inválidos" 
            : data.error,
          variant: "destructive",
        });
        return false;
      }

      const newUser: User = data.user;
      const newSession: MoodleSession = {
        moodleToken: data.moodleToken,
        moodleUserId: data.moodleUserId,
        moodleUrl: cleanUrl,
      };

      setUser(newUser);
      setMoodleSession(newSession);
      setLastSync(newUser.last_sync || null);
      saveSession(newUser, newSession);
      
      toast({
        title: "Login realizado com sucesso",
        description: `Bem-vindo, ${newUser.full_name}!`,
      });

      return true;
    } catch (err) {
      console.error('Login error:', err);
      toast({
        title: "Erro de autenticação",
        description: "Não foi possível conectar ao Moodle. Verifique suas credenciais e a URL.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [saveSession]);

  const loginWithToken = useCallback(async (token: string, moodleUrl: string): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      const cleanUrl = moodleUrl.replace(/\/$/, '');
      
      const { data, error } = await supabase.functions.invoke('moodle-api', {
        body: {
          action: 'login_with_token',
          moodleUrl: cleanUrl,
          token,
        },
      });

      if (error) {
        console.error('Token login error:', error);
        toast({
          title: "Erro de autenticação",
          description: error.message || "Não foi possível validar o token",
          variant: "destructive",
        });
        return false;
      }

      if (data.error) {
        toast({
          title: "Erro de autenticação",
          description: data.error,
          variant: "destructive",
        });
        return false;
      }

      const newUser: User = data.user;
      const newSession: MoodleSession = {
        moodleToken: token,
        moodleUserId: data.moodleUserId,
        moodleUrl: cleanUrl,
      };

      setUser(newUser);
      setMoodleSession(newSession);
      setLastSync(newUser.last_sync || null);
      saveSession(newUser, newSession);
      
      toast({
        title: "Login realizado com sucesso",
        description: `Bem-vindo, ${newUser.full_name}!`,
      });

      return true;
    } catch (err) {
      console.error('Token login error:', err);
      toast({
        title: "Erro de autenticação",
        description: "Não foi possível validar o token. Verifique se está correto.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [saveSession]);

  const logout = useCallback(() => {
    setUser(null);
    setMoodleSession(null);
    setCourses([]);
    setLastSync(null);
    localStorage.removeItem(STORAGE_KEY);
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado com sucesso.",
    });
  }, []);

  const syncData = useCallback(async () => {
    if (!user || !moodleSession) {
      toast({
        title: "Erro",
        description: "Sessão expirada. Faça login novamente.",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    // Reset and open sync progress dialog
    setSyncProgress({
      isOpen: true,
      steps: initialSteps.map(s => ({ ...s, status: 'pending' as const })),
      currentStep: null,
      isComplete: false,
    });

    let syncedCourses: Course[] = [];
    let totalStudents = 0;
    let totalActivities = 0;

    try {
      // ============ STEP 1: SYNC COURSES ============
      updateStep('courses', { status: 'in_progress' });
      
      const { data: coursesData, error: coursesError } = await supabase.functions.invoke('moodle-api', {
        body: {
          action: 'sync_courses',
          moodleUrl: moodleSession.moodleUrl,
          token: moodleSession.moodleToken,
          userId: moodleSession.moodleUserId,
        },
      });

      if (coursesError || coursesData.error) {
        updateStep('courses', { 
          status: 'error', 
          errorMessage: coursesError?.message || coursesData.error 
        });
        throw new Error(coursesError?.message || coursesData.error);
      }

      syncedCourses = coursesData.courses || [];
      setCourses(syncedCourses);
      updateStep('courses', { status: 'completed', count: syncedCourses.length });

      // ============ STEP 2: SYNC STUDENTS ============
      updateStep('students', { status: 'in_progress', count: 0, total: syncedCourses.length });
      
      const STUDENT_BATCH_SIZE = 5;
      let processedCoursesStudents = 0;

      for (let i = 0; i < syncedCourses.length; i += STUDENT_BATCH_SIZE) {
        const batch = syncedCourses.slice(i, i + STUDENT_BATCH_SIZE);
        
        const results = await Promise.allSettled(
          batch.map(async (course: any) => {
            const { data } = await supabase.functions.invoke('moodle-api', {
              body: {
                action: 'sync_students',
                moodleUrl: moodleSession.moodleUrl,
                token: moodleSession.moodleToken,
                courseId: parseInt(course.moodle_course_id, 10),
              },
            });
            return data?.students?.length || 0;
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            totalStudents += result.value;
          }
        }
        
        processedCoursesStudents += batch.length;
        updateStep('students', { count: processedCoursesStudents, total: syncedCourses.length });
      }

      updateStep('students', { status: 'completed', count: totalStudents });

      // ============ STEP 3: SYNC ACTIVITIES ============
      updateStep('activities', { status: 'in_progress', count: 0, total: syncedCourses.length });
      
      const ACTIVITY_BATCH_SIZE = 3;
      let processedCoursesActivities = 0;

      for (let i = 0; i < syncedCourses.length; i += ACTIVITY_BATCH_SIZE) {
        const batch = syncedCourses.slice(i, i + ACTIVITY_BATCH_SIZE);
        
        const results = await Promise.allSettled(
          batch.map(async (course: any) => {
            const { data } = await supabase.functions.invoke('moodle-api', {
              body: {
                action: 'sync_activities',
                moodleUrl: moodleSession.moodleUrl,
                token: moodleSession.moodleToken,
                courseId: parseInt(course.moodle_course_id, 10),
              },
            });
            return data?.activitiesCount || 0;
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            totalActivities += result.value;
          }
        }
        
        processedCoursesActivities += batch.length;
        updateStep('activities', { count: processedCoursesActivities, total: syncedCourses.length });
      }

      updateStep('activities', { status: 'completed', count: totalActivities });
      
      // ============ FINALIZE ============
      const newSyncTime = new Date().toISOString();
      setLastSync(newSyncTime);
      
      const updatedUser = { ...user, last_sync: newSyncTime };
      setUser(updatedUser);
      saveSession(updatedUser, moodleSession);
      
      setSyncProgress(prev => ({
        ...prev,
        isComplete: true,
        summary: {
          courses: syncedCourses.length,
          students: totalStudents,
          activities: totalActivities,
        },
      }));

    } catch (err) {
      console.error('Sync error:', err);
      setSyncProgress(prev => ({ ...prev, isComplete: true }));
      toast({
        title: "Erro na sincronização",
        description: err instanceof Error ? err.message : "Não foi possível sincronizar com o Moodle.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, moodleSession, saveSession, updateStep]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user && !!moodleSession,
        login,
        loginWithToken,
        logout,
        syncData,
        lastSync,
        moodleSession,
        courses,
        setCourses,
        syncProgress,
        closeSyncProgress,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
