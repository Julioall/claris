import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, AuthContextType, Course } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { SyncStep } from '@/components/sync/SyncProgressDialog';
import { encryptSessionData, decryptSessionData } from '@/lib/session-crypto';

interface MoodleSession {
  moodleToken: string;
  moodleUserId: number;
  moodleUrl: string;
}

interface StoredSession {
  user: User;
  moodleSession: MoodleSession;
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

type SyncEntity = 'courses' | 'students' | 'activities' | 'grades';

interface SyncSettings {
  syncIntervalHours: Record<SyncEntity, number>;
  entityLastSync: Partial<Record<SyncEntity, string>>;
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

const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  syncIntervalHours: {
    courses: 24,
    students: 12,
    activities: 2.4,
    grades: 2.4,
  },
  entityLastSync: {},
};

const initialSteps: SyncStep[] = [
  { id: 'courses', label: 'Sincronizar cursos', icon: 'courses', status: 'pending' },
  { id: 'students', label: 'Sincronizar alunos', icon: 'students', status: 'pending' },
  { id: 'activities', label: 'Sincronizar atividades', icon: 'activities', status: 'pending' },
  { id: 'grades', label: 'Sincronizar notas', icon: 'grades', status: 'pending' },
];

const BATCH_DELAY_MS = 450;

const STEP_ACTIONS: Record<Exclude<SyncEntity, 'courses'>, 'sync_students' | 'sync_activities' | 'sync_grades'> = {
  students: 'sync_students',
  activities: 'sync_activities',
  grades: 'sync_grades',
};

const STEP_BATCH_CONFIG: Record<Exclude<SyncEntity, 'courses'>, { batchSize: number; timeoutMs: number }> = {
  students: { batchSize: 2, timeoutMs: 22000 },
  activities: { batchSize: 1, timeoutMs: 26000 },
  grades: { batchSize: 1, timeoutMs: 26000 },
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const sanitizeSyncSettings = (raw?: Partial<SyncSettings> | null): SyncSettings => {
  const settings = raw || {};
  const syncIntervalHours = settings.syncIntervalHours || {};
  const entityLastSync = settings.entityLastSync || {};

  return {
    syncIntervalHours: {
      courses: Number(syncIntervalHours.courses ?? DEFAULT_SYNC_SETTINGS.syncIntervalHours.courses),
      students: Number(syncIntervalHours.students ?? DEFAULT_SYNC_SETTINGS.syncIntervalHours.students),
      activities: Number(syncIntervalHours.activities ?? DEFAULT_SYNC_SETTINGS.syncIntervalHours.activities),
      grades: Number(syncIntervalHours.grades ?? DEFAULT_SYNC_SETTINGS.syncIntervalHours.grades),
    },
    entityLastSync: {
      courses: typeof entityLastSync.courses === 'string' ? entityLastSync.courses : undefined,
      students: typeof entityLastSync.students === 'string' ? entityLastSync.students : undefined,
      activities: typeof entityLastSync.activities === 'string' ? entityLastSync.activities : undefined,
      grades: typeof entityLastSync.grades === 'string' ? entityLastSync.grades : undefined,
    },
  };
};

const shouldSyncByRecency = (settings: SyncSettings, entity: SyncEntity, now: Date): boolean => {
  const intervalHours = settings.syncIntervalHours[entity];
  if (!Number.isFinite(intervalHours) || intervalHours <= 0) return true;

  const lastSync = settings.entityLastSync[entity];
  if (!lastSync) return true;

  const lastSyncMs = new Date(lastSync).getTime();
  if (!Number.isFinite(lastSyncMs)) return true;

  const elapsedMs = now.getTime() - lastSyncMs;
  return elapsedMs >= intervalHours * 60 * 60 * 1000;
};

async function parseFunctionsError(err: unknown): Promise<{ status?: number; message?: string }> {
  const context = (err as { context?: Response })?.context;
  if (!context) return {};

  const status = context.status;
  try {
    const payload = await context.clone().json();
    const message = typeof payload?.error === 'string' ? payload.error : undefined;
    return { status, message };
  } catch {
    return { status };
  }
}

async function loadStoredSession(): Promise<StoredSession | null> {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return await decryptSessionData<StoredSession>(stored);
  } catch {
    console.error('Error loading session');
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [moodleSession, setMoodleSession] = useState<MoodleSession | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [showCourseSelector, setShowCourseSelector] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    isOpen: false,
    steps: initialSteps,
    currentStep: null,
    isComplete: false,
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
        loadStoredSession().then(stored => {
          if (stored) {
            if (stored.user) setUser(stored.user);
            if (stored.moodleSession) setMoodleSession(stored.moodleSession);
            setLastSync(stored.user?.last_sync || null);
          }
          setIsLoading(false);
        }).catch(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadStoredSession().then(stored => {
          if (stored) {
            if (stored.user) setUser(stored.user);
            if (stored.moodleSession) setMoodleSession(stored.moodleSession);
            setLastSync(stored.user?.last_sync || null);
          }
          setIsLoading(false);
        }).catch(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const saveSession = useCallback(async (newUser: User | null, newMoodleSession: MoodleSession | null) => {
    if (newUser && newMoodleSession) {
      const encrypted = await encryptSessionData({ user: newUser, moodleSession: newMoodleSession });
      sessionStorage.setItem(STORAGE_KEY, encrypted);
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

  const resolveSessionContext = useCallback(async (): Promise<{ user: User; session: MoodleSession } | null> => {
    let userToUse = user;
    let sessionToUse = moodleSession;

    if (!userToUse || !sessionToUse) {
      const stored = await loadStoredSession();
      if (stored) {
        userToUse = stored.user;
        sessionToUse = stored.moodleSession;
      }
    }

    if (!userToUse || !sessionToUse) {
      return null;
    }

    return { user: userToUse, session: sessionToUse };
  }, [moodleSession, user]);

  const invokeMoodleWithTimeout = useCallback(async (body: Record<string, unknown>, timeoutMs = 25000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const { data, error } = await supabase.functions.invoke('moodle-api', { body });
      clearTimeout(timeoutId);
      return { data, error };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        return { data: null, error: { message: 'Request timeout' } };
      }
      throw err;
    }
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
          title: 'Erro de autenticacao',
          description: error.message || 'Nao foi possivel conectar ao Moodle',
          variant: 'destructive',
        });
        return false;
      }

      if (data.error) {
        toast({
          title: 'Erro de autenticacao',
          description: data.error === 'invalidlogin'
            ? 'Usuario ou senha invalidos'
            : data.error,
          variant: 'destructive',
        });
        return false;
      }

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
      await saveSession(newUser, newSession);

      toast({
        title: 'Login realizado com sucesso',
        description: `Bem-vindo, ${newUser.full_name}!`,
      });

      return true;
    } catch (err) {
      console.error('Login error:', err);
      toast({
        title: 'Erro de autenticacao',
        description: 'Nao foi possivel conectar ao Moodle. Verifique suas credenciais e a URL.',
        variant: 'destructive',
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
      title: 'Logout realizado',
      description: 'Voce foi desconectado com sucesso.',
    });
  }, []);

  const clearInvalidSession = useCallback(async () => {
    setUser(null);
    setMoodleSession(null);
    setCourses([]);
    setLastSync(null);
    sessionStorage.removeItem(STORAGE_KEY);
    await supabase.auth.signOut();
  }, []);

  const fetchMoodleCourses = useCallback(async (userIdOverride?: number): Promise<{ courses: Course[]; handledError: boolean }> => {
    const context = await resolveSessionContext();
    if (!context) return { courses: [], handledError: false };
    const { session: sessionToUse } = context;
    const moodleUserId = userIdOverride ?? sessionToUse.moodleUserId;

    try {
      const { data, error } = await supabase.functions.invoke('moodle-api', {
        body: {
          action: 'sync_courses',
          moodleUrl: sessionToUse.moodleUrl,
          token: sessionToUse.moodleToken,
          userId: moodleUserId,
        },
      });

      if (error || data?.error) {
        console.error('Error fetching courses:', error || data?.error);
        toast({
          title: 'Erro ao buscar cursos',
          description: error?.message || data?.error || 'Nao foi possivel obter cursos do Moodle.',
          variant: 'destructive',
        });
        return { courses: [], handledError: true };
      }

      return { courses: data.courses || [], handledError: false };
    } catch (err) {
      console.error('Error fetching courses:', err);
      const parsed = await parseFunctionsError(err);
      const isMissingUser = parsed.status === 404 && parsed.message === 'User not found in database';

      if (isMissingUser) {
        await clearInvalidSession();
        toast({
          title: 'Sessao invalida',
          description: 'Sua sessao local ficou desatualizada. Faca login novamente.',
          variant: 'destructive',
        });
        return { courses: [], handledError: true };
      }

      toast({
        title: 'Erro ao buscar cursos',
        description: 'Nao foi possivel conectar ao Moodle.',
        variant: 'destructive',
      });
      return { courses: [], handledError: true };
    }
  }, [clearInvalidSession, resolveSessionContext]);

  const loadSyncSettings = useCallback(async (userId: string): Promise<SyncSettings> => {
    try {
      const { data, error } = await supabase
        .from('user_sync_preferences')
        .select('sync_interval_hours, sync_interval_days, entity_last_sync')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error loading sync settings:', error);
        return DEFAULT_SYNC_SETTINGS;
      }

      const syncIntervalHoursRaw = (data?.sync_interval_hours as Record<SyncEntity, number> | undefined);
      const syncIntervalDaysRaw = (data?.sync_interval_days as Record<SyncEntity, number> | undefined);
      const syncIntervalHoursFallback = syncIntervalDaysRaw
        ? {
            courses: Number(syncIntervalDaysRaw.courses || 0) * 24,
            students: Number(syncIntervalDaysRaw.students || 0) * 24,
            activities: Number(syncIntervalDaysRaw.activities || 0) * 24,
            grades: Number(syncIntervalDaysRaw.grades || 0) * 24,
          }
        : undefined;

      return sanitizeSyncSettings({
        syncIntervalHours: syncIntervalHoursRaw || syncIntervalHoursFallback,
        entityLastSync: data?.entity_last_sync as Partial<Record<SyncEntity, string>> | undefined,
      });
    } catch (err) {
      console.error('Error loading sync settings:', err);
      return DEFAULT_SYNC_SETTINGS;
    }
  }, []);

  const syncData = useCallback(async () => {
    const context = await resolveSessionContext();

    if (!context) {
      toast({
        title: 'Erro',
        description: 'Sessao expirada. Faca login novamente.',
        variant: 'destructive',
      });
      return;
    }

    if (courses.length > 0) {
      setShowCourseSelector(true);
      return;
    }

    setIsSyncing(true);
    try {
      let result = await fetchMoodleCourses();
      let fetched = result.courses;
      if (fetched.length === 0 && !result.handledError) {
        const fallbackMoodleUserId = Number(context.user.moodle_user_id);
        if (Number.isInteger(fallbackMoodleUserId) && fallbackMoodleUserId > 0) {
          result = await fetchMoodleCourses(fallbackMoodleUserId);
          fetched = result.courses;
        }
      }

      if (result.handledError) return;

      setCourses(fetched);
      if (fetched.length > 0) {
        setShowCourseSelector(true);
      } else {
        toast({
          title: 'Nenhum curso encontrado',
          description: 'Nao foram encontrados cursos no Moodle.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSyncing(false);
    }
  }, [courses.length, fetchMoodleCourses, resolveSessionContext]);

  const syncSelectedCourses = useCallback(async (courseIds: string[]) => {
    const context = await resolveSessionContext();
    if (!context) {
      toast({
        title: 'Erro',
        description: 'Sessao expirada. Faca login novamente.',
        variant: 'destructive',
      });
      return;
    }

    const { session: sessionToUse, user: userToUse } = context;
    const syncSettings = await loadSyncSettings(userToUse.id);
    const enabledEntities: SyncEntity[] = initialSteps.map(step => step.id as SyncEntity);
    const nowReference = new Date();
    const entitiesToSync = enabledEntities.filter(entity => shouldSyncByRecency(syncSettings, entity, nowReference));
    const skippedByRecency = enabledEntities.filter(entity => !entitiesToSync.includes(entity));

    const runBatchedEntitySync = async (
      entity: Exclude<SyncEntity, 'courses'>,
      selectedCourses: Course[],
    ): Promise<{ totalCount: number; succeeded: boolean }> => {
      const { batchSize, timeoutMs } = STEP_BATCH_CONFIG[entity];
      const action = STEP_ACTIONS[entity];
      let totalCount = 0;
      let errorCount = 0;
      let processedCourses = 0;

      updateStep(entity, { status: 'in_progress', count: 0, total: selectedCourses.length });

      for (let i = 0; i < selectedCourses.length; i += batchSize) {
        const batch = selectedCourses.slice(i, i + batchSize);

        const results = await Promise.allSettled(
          batch.map(async (course: Course) => {
            try {
              const { data, error } = await invokeMoodleWithTimeout({
                action,
                moodleUrl: sessionToUse.moodleUrl,
                token: sessionToUse.moodleToken,
                courseId: parseInt(course.moodle_course_id, 10),
              }, timeoutMs);

              if (error || data?.error) {
                console.warn(`${entity} sync failed for course ${course.moodle_course_id}:`, error || data?.error);
                return 0;
              }

              if (entity === 'students') return data?.students?.length || 0;
              if (entity === 'activities') return data?.activitiesCount || 0;
              return data?.gradesCount || 0;
            } catch (err) {
              console.warn(`${entity} sync error for course ${course.moodle_course_id}:`, err);
              return 0;
            }
          }),
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            totalCount += result.value;
          } else {
            errorCount++;
          }
        }

        processedCourses += batch.length;
        updateStep(entity, { count: processedCourses, total: selectedCourses.length });

        if (i + batchSize < selectedCourses.length) {
          await wait(BATCH_DELAY_MS);
        }
      }

      const failedCompletely = errorCount > 0 && totalCount === 0;
      updateStep(entity, {
        status: failedCompletely ? 'error' : 'completed',
        count: totalCount,
        errorMessage: errorCount > 0 ? `${errorCount} cursos com erro` : undefined,
      });

      return { totalCount, succeeded: !failedCompletely };
    };

    setIsSyncing(true);
    setSyncProgress({
      isOpen: true,
      steps: initialSteps
        .filter(step => enabledEntities.includes(step.id as SyncEntity))
        .map(step => ({ ...step, status: 'pending' as const })),
      currentStep: null,
      isComplete: false,
    });

    for (const skippedEntity of skippedByRecency) {
      updateStep(skippedEntity, { status: 'completed', count: 0, total: 0 });
    }

    if (entitiesToSync.length === 0) {
      setSyncProgress(prev => ({
        ...prev,
        isComplete: true,
        summary: { courses: 0, students: 0, activities: 0, grades: 0 },
      }));
      toast({
        title: 'Sincronizacao ignorada por recencia',
        description: 'As entidades habilitadas ainda estao dentro do intervalo configurado.',
      });
      setIsSyncing(false);
      return;
    }

    let syncedCourses = courses.filter(course => courseIds.includes(course.id));
    let totalStudents = 0;
    let totalActivities = 0;
    let totalGrades = 0;
    const nextEntityLastSync: Partial<Record<SyncEntity, string>> = {
      ...syncSettings.entityLastSync,
    };

    try {
      await invokeMoodleWithTimeout({
        action: 'link_selected_courses',
        userId: sessionToUse.moodleUserId,
        selectedCourseIds: courseIds,
      }, 30000);

      if (entitiesToSync.includes('courses')) {
        updateStep('courses', { status: 'in_progress', count: 0, total: 1 });
        const { data, error } = await invokeMoodleWithTimeout({
          action: 'sync_courses',
          moodleUrl: sessionToUse.moodleUrl,
          token: sessionToUse.moodleToken,
          userId: sessionToUse.moodleUserId,
        }, 30000);

        if (error || data?.error) {
          updateStep('courses', {
            status: 'error',
            errorMessage: error?.message || data?.error || 'Falha ao sincronizar cursos',
          });
        } else {
          const allSyncedCourses: Course[] = data?.courses || [];
          setCourses(allSyncedCourses);
          syncedCourses = allSyncedCourses.filter(course => courseIds.includes(course.id));
          nextEntityLastSync.courses = new Date().toISOString();
          updateStep('courses', {
            status: 'completed',
            count: syncedCourses.length,
            total: syncedCourses.length,
          });
        }
      }

      if (entitiesToSync.includes('students')) {
        const result = await runBatchedEntitySync('students', syncedCourses);
        totalStudents = result.totalCount;
        if (result.succeeded) {
          nextEntityLastSync.students = new Date().toISOString();
        }
      }

      if (entitiesToSync.includes('activities')) {
        const result = await runBatchedEntitySync('activities', syncedCourses);
        totalActivities = result.totalCount;
        if (result.succeeded) {
          nextEntityLastSync.activities = new Date().toISOString();
        }
      }

      if (entitiesToSync.includes('grades')) {
        const result = await runBatchedEntitySync('grades', syncedCourses);
        totalGrades = result.totalCount;
        if (result.succeeded) {
          nextEntityLastSync.grades = new Date().toISOString();
        }
      }

      await supabase
        .from('user_sync_preferences')
        .upsert(
          {
            user_id: userToUse.id,
            entity_last_sync: nextEntityLastSync,
          },
          { onConflict: 'user_id' },
        );

      const now = new Date().toISOString();
      setLastSync(now);
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

      toast({
        title: 'Sincronizacao concluida',
        description: `${syncedCourses.length} cursos, ${totalStudents} alunos, ${totalActivities} atividades e ${totalGrades} notas sincronizados.`,
      });
    } catch (err) {
      console.error('Sync error:', err);
      toast({
        title: 'Erro na sincronizacao',
        description: 'Ocorreu um erro durante a sincronizacao. Tente novamente.',
        variant: 'destructive',
      });
      setSyncProgress(prev => ({ ...prev, isComplete: true }));
    } finally {
      setIsSyncing(false);
    }
  }, [courses, invokeMoodleWithTimeout, loadSyncSettings, resolveSessionContext, updateStep]);

  const value: ExtendedAuthContextType = {
    user,
    isLoading,
    isSyncing,
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
  };

  return (
    <AuthContext.Provider value={value}>
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
