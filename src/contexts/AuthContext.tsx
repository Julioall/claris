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
    grades: number;
  };
}

interface ExtendedAuthContextType extends AuthContextType {
  moodleSession: MoodleSession | null;
  courses: Course[];
  setCourses: (courses: Course[]) => void;
  syncProgress: SyncProgress;
  closeSyncProgress: () => void;
  syncSelectedCourses: (courseIds: string[]) => Promise<void>;
  showCourseSelector: boolean;
  setShowCourseSelector: (show: boolean) => void;
  isEditMode: boolean;
  setIsEditMode: (mode: boolean) => void;
}

const AuthContext = createContext<ExtendedAuthContextType | undefined>(undefined);

const STORAGE_KEY = 'guia_tutor_session';

const initialSteps: SyncStep[] = [
  { id: 'courses', label: 'Sincronizar cursos', icon: 'courses', status: 'pending' },
  { id: 'students', label: 'Sincronizar alunos', icon: 'students', status: 'pending' },
  { id: 'activities', label: 'Sincronizar atividades', icon: 'activities', status: 'pending' },
  { id: 'grades', label: 'Sincronizar notas', icon: 'grades', status: 'pending' },
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [moodleSession, setMoodleSession] = useState<MoodleSession | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [showCourseSelector, setShowCourseSelector] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    isOpen: false,
    steps: initialSteps,
    currentStep: null,
    isComplete: false,
  });

  // Load session from Supabase Auth on mount
  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setMoodleSession(null);
        setLastSync(null);
        setCourses([]);
        sessionStorage.removeItem(STORAGE_KEY);
        setIsLoading(false);
        return;
      }

      if (session?.user) {
        // Load moodle session from sessionStorage
        try {
          const stored = sessionStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.user) setUser(parsed.user);
            if (parsed.moodleSession) setMoodleSession(parsed.moodleSession);
            setLastSync(parsed.user?.last_sync || null);
          }
        } catch (err) {
          console.error('Error loading moodle session:', err);
        }
        setIsLoading(false);
      }
    });

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        try {
          const stored = sessionStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.user) setUser(parsed.user);
            if (parsed.moodleSession) setMoodleSession(parsed.moodleSession);
            setLastSync(parsed.user?.last_sync || null);
          }
        } catch (err) {
          console.error('Error loading session:', err);
        }
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Save moodle session data to sessionStorage (cleared when browser closes)
  const saveSession = useCallback((newUser: User | null, newMoodleSession: MoodleSession | null) => {
    if (newUser && newMoodleSession) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        user: newUser,
        moodleSession: newMoodleSession,
      }));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
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

      // Set Supabase Auth session
      if (data.session) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (sessionError) {
          console.error('Error setting auth session:', sessionError);
        }
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


  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMoodleSession(null);
    setCourses([]);
    setLastSync(null);
    sessionStorage.removeItem(STORAGE_KEY);
    toast({
      title: "Logout realizado",
      description: "Você foi desconectado com sucesso.",
    });
  }, []);

  const fetchMoodleCourses = useCallback(async (): Promise<Course[]> => {
    let sessionToUse = moodleSession;
    let userToUse = user;
    
    if (!sessionToUse || !userToUse) {
      try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          sessionToUse = parsed.moodleSession;
          userToUse = parsed.user;
        }
      } catch (e) {
        console.error('Error recovering session:', e);
      }
    }
    
    if (!userToUse || !sessionToUse) return [];
    
    try {
      const { data, error } = await supabase.functions.invoke('moodle-api', {
        body: {
          action: 'sync_courses',
          moodleUrl: sessionToUse.moodleUrl,
          token: sessionToUse.moodleToken,
          userId: sessionToUse.moodleUserId,
        },
      });
      
      if (error || data?.error) {
        console.error('Error fetching courses:', error || data?.error);
        toast({
          title: "Erro ao buscar cursos",
          description: error?.message || data?.error || "Não foi possível obter cursos do Moodle.",
          variant: "destructive",
        });
        return [];
      }
      
      return data.courses || [];
    } catch (err) {
      console.error('Error fetching courses:', err);
      toast({
        title: "Erro ao buscar cursos",
        description: "Não foi possível conectar ao Moodle.",
        variant: "destructive",
      });
      return [];
    }
  }, [moodleSession, user]);

  const syncData = useCallback(async () => {
    if (courses.length > 0) {
      setShowCourseSelector(true);
      return;
    }
    // Fetch courses first, then show selector
    setIsLoading(true);
    try {
      const fetched = await fetchMoodleCourses();
      setCourses(fetched);
      if (fetched.length > 0) {
        setShowCourseSelector(true);
      } else {
        toast({
          title: "Nenhum curso encontrado",
          description: "Não foram encontrados cursos no Moodle.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [courses.length, fetchMoodleCourses]);

  const syncSelectedCourses = useCallback(async (courseIds: string[]) => {
    // Try to get session from state or from localStorage as fallback
    let sessionToUse = moodleSession;
    let userToUse = user;
    
    if (!sessionToUse || !userToUse) {
      try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          sessionToUse = parsed.moodleSession;
          userToUse = parsed.user;
        }
      } catch (e) {
        console.error('Error recovering session:', e);
      }
    }
    
    if (!userToUse || !sessionToUse) {
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
    let totalGrades = 0;

    // Helper to invoke edge function with timeout
    const invokeWithTimeout = async (body: Record<string, unknown>, timeoutMs = 25000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const { data, error } = await supabase.functions.invoke('moodle-api', {
          body,
        });
        clearTimeout(timeoutId);
        return { data, error };
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === 'AbortError') {
          return { data: null, error: { message: 'Request timeout' } };
        }
        throw err;
      }
    };

    try {
      // ============ STEP 1: COURSES (link only selected to user_courses) ============
      syncedCourses = courses.filter(c => courseIds.includes(c.id));
      
      // Call edge function to update user_courses with only selected courses
      await invokeWithTimeout({
        action: 'link_selected_courses',
        userId: sessionToUse.moodleUserId,
        selectedCourseIds: courseIds,
      }, 30000);
      
      updateStep('courses', { status: 'completed', count: syncedCourses.length });

      // ============ STEP 2: SYNC STUDENTS ============
      updateStep('students', { status: 'in_progress', count: 0, total: syncedCourses.length });
      
      // Process in smaller batches with individual error handling
      const STUDENT_BATCH_SIZE = 3; // Smaller batch to avoid timeout
      let processedCoursesStudents = 0;
      let studentErrors = 0;

      for (let i = 0; i < syncedCourses.length; i += STUDENT_BATCH_SIZE) {
        const batch = syncedCourses.slice(i, i + STUDENT_BATCH_SIZE);
        
        const results = await Promise.allSettled(
          batch.map(async (course: Course) => {
            try {
              const { data, error } = await invokeWithTimeout({
                action: 'sync_students',
                moodleUrl: sessionToUse.moodleUrl,
                token: sessionToUse.moodleToken,
                courseId: parseInt(course.moodle_course_id, 10),
              }, 20000); // 20s timeout per course
              
              if (error) {
                console.warn(`Student sync failed for course ${course.moodle_course_id}:`, error);
                return 0;
              }
              return data?.students?.length || 0;
            } catch (err) {
              console.warn(`Student sync error for course ${course.moodle_course_id}:`, err);
              return 0;
            }
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            totalStudents += result.value;
          } else {
            studentErrors++;
          }
        }
        
        processedCoursesStudents += batch.length;
        updateStep('students', { count: processedCoursesStudents, total: syncedCourses.length });
      }

      updateStep('students', { 
        status: studentErrors > 0 && totalStudents === 0 ? 'error' : 'completed', 
        count: totalStudents,
        errorMessage: studentErrors > 0 ? `${studentErrors} cursos com erro` : undefined
      });

      // ============ STEP 3: SYNC ACTIVITIES ============
      updateStep('activities', { status: 'in_progress', count: 0, total: syncedCourses.length });
      
      const ACTIVITY_BATCH_SIZE = 2; // Even smaller for activities (more data per course)
      let processedCoursesActivities = 0;
      let activityErrors = 0;

      for (let i = 0; i < syncedCourses.length; i += ACTIVITY_BATCH_SIZE) {
        const batch = syncedCourses.slice(i, i + ACTIVITY_BATCH_SIZE);
        
        const results = await Promise.allSettled(
          batch.map(async (course: Course) => {
            try {
              const { data, error } = await invokeWithTimeout({
                action: 'sync_activities',
                moodleUrl: sessionToUse.moodleUrl,
                token: sessionToUse.moodleToken,
                courseId: parseInt(course.moodle_course_id, 10),
              }, 25000); // 25s timeout per course
              
              if (error) {
                console.warn(`Activity sync failed for course ${course.moodle_course_id}:`, error);
                return 0;
              }
              return data?.activitiesCount || 0;
            } catch (err) {
              console.warn(`Activity sync error for course ${course.moodle_course_id}:`, err);
              return 0;
            }
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            totalActivities += result.value;
          } else {
            activityErrors++;
          }
        }
        
        processedCoursesActivities += batch.length;
        updateStep('activities', { count: processedCoursesActivities, total: syncedCourses.length });
      }

      updateStep('activities', { 
        status: activityErrors > 0 && totalActivities === 0 ? 'error' : 'completed', 
        count: totalActivities,
        errorMessage: activityErrors > 0 ? `${activityErrors} cursos com erro` : undefined
      });

      // ============ STEP 4: SYNC GRADES ============
      updateStep('grades', { status: 'in_progress', count: 0, total: syncedCourses.length });
      
      const GRADE_BATCH_SIZE = 3;
      let processedCoursesGrades = 0;
      let gradeErrors = 0;

      for (let i = 0; i < syncedCourses.length; i += GRADE_BATCH_SIZE) {
        const batch = syncedCourses.slice(i, i + GRADE_BATCH_SIZE);
        
        const results = await Promise.allSettled(
          batch.map(async (course: Course) => {
            try {
              const { data, error } = await invokeWithTimeout({
                action: 'sync_grades',
                moodleUrl: sessionToUse.moodleUrl,
                token: sessionToUse.moodleToken,
                courseId: parseInt(course.moodle_course_id, 10),
              }, 25000);
              
              if (error) {
                console.warn(`Grade sync failed for course ${course.moodle_course_id}:`, error);
                return 0;
              }
              return data?.gradesCount || 0;
            } catch (err) {
              console.warn(`Grade sync error for course ${course.moodle_course_id}:`, err);
              return 0;
            }
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            totalGrades += result.value;
          } else {
            gradeErrors++;
          }
        }
        
        processedCoursesGrades += batch.length;
        updateStep('grades', { count: processedCoursesGrades, total: syncedCourses.length });
      }

      updateStep('grades', { 
        status: gradeErrors > 0 && totalGrades === 0 ? 'error' : 'completed', 
        count: totalGrades,
        errorMessage: gradeErrors > 0 ? `${gradeErrors} cursos com erro` : undefined
      });
      
      // ============ FINALIZE ============
      const newSyncTime = new Date().toISOString();
      setLastSync(newSyncTime);
      
      const updatedUser = { ...userToUse, last_sync: newSyncTime };
      setUser(updatedUser);
      saveSession(updatedUser, sessionToUse);
      
      setSyncProgress(prev => ({
        ...prev,
        isComplete: true,
        summary: {
          courses: syncedCourses.length,
          students: totalStudents,
          activities: totalActivities,
          grades: totalGrades,
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
  }, [user, moodleSession, courses, saveSession, updateStep]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user && !!moodleSession,
        login,
        
        logout,
        syncData,
        lastSync,
        moodleSession,
        courses,
        setCourses,
        syncProgress,
        closeSyncProgress,
        syncSelectedCourses,
        showCourseSelector,
        setShowCourseSelector,
        isEditMode,
        setIsEditMode,
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
