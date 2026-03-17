import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, AuthContextType, Course } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { SyncStep } from '@/components/sync/SyncProgressDialog';
import { encryptSessionData, decryptSessionData } from '@/lib/session-crypto';
import {
  normalizeMoodleUrl,
  resolveFunctionsInvokeErrorMessage,
  resolveMoodleErrorMessage,
} from '@/lib/moodle-errors';
import { trackEvent, logError } from '@/lib/tracking';

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
}

type SyncEntity = 'courses' | 'students' | 'activities' | 'grades';
type CourseScopedSyncEntity = Exclude<SyncEntity, 'courses'>;

interface ScopedSyncSummary {
  students: number;
  activities: number;
  grades: number;
}

interface ExtendedAuthContextType extends AuthContextType {
  moodleSession: MoodleSession | null;
  courses: Course[];
  setCourses: (courses: Course[]) => void;
  syncProgress: SyncProgress;
  closeSyncProgress: () => void;
  syncSelectedCourses: (courseIds: string[]) => Promise<void>;
  syncStudentsIncremental: (courseIds: string[]) => Promise<void>;
  syncCourseIncremental: (courseId: string, entities?: CourseScopedSyncEntity[]) => Promise<void>;
  showCourseSelector: boolean;
  setShowCourseSelector: (show: boolean) => void;
  isEditMode: boolean;
  setIsEditMode: (mode: boolean) => void;
  isOfflineMode: boolean;
}

const AuthContext = createContext<ExtendedAuthContextType | undefined>(undefined);

const STORAGE_KEY = 'session';

const initialSteps: SyncStep[] = [
  { id: 'courses', label: 'Sincronizar cursos', icon: 'courses', status: 'pending' },
  { id: 'students', label: 'Sincronizar alunos', icon: 'students', status: 'pending' },
];

const BATCH_DELAY_MS = 120;

const STEP_FUNCTION_MAP: Record<Exclude<SyncEntity, 'courses'>, string> = {
  students: 'moodle-sync-students',
  activities: 'moodle-sync-activities',
  grades: 'moodle-sync-grades',
};

const STEP_BATCH_CONFIG: Record<Exclude<SyncEntity, 'courses'>, { batchSize: number; timeoutMs: number }> = {
  students: { batchSize: 5, timeoutMs: 22000 },
  activities: { batchSize: 2, timeoutMs: 26000 },
  grades: { batchSize: 2, timeoutMs: 26000 },
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const SUPABASE_FUNCTIONS_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1`;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

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

function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error) return false;
  const message = String((error as { message?: string })?.message || error).toLowerCase();
  return message.includes('invalid refresh token') || message.includes('refresh token not found');
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
  const deepSyncInProgressRef = useRef(false);

  const resetAuthState = useCallback(() => {
    setUser(null);
    setMoodleSession(null);
    setLastSync(null);
    setCourses([]);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    const handleInvalidRefreshToken = async () => {
      resetAuthState();
      await supabase.auth.signOut({ scope: 'local' });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        resetAuthState();
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

    const initializeSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error && isInvalidRefreshTokenError(error)) {
          await handleInvalidRefreshToken();
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
          return;
        }

        setIsLoading(false);
      } catch (error) {
        if (isInvalidRefreshTokenError(error)) {
          await handleInvalidRefreshToken();
        }
        setIsLoading(false);
      }
    };

    initializeSession();

    return () => subscription.unsubscribe();
  }, [resetAuthState]);

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

  const createSystemNotification = useCallback(async (
    userId: string,
    payload: {
      title: string;
      description?: string;
      eventType?: string;
      severity?: 'info' | 'warning' | 'critical';
      metadata?: Record<string, unknown>;
    },
  ) => {
    if (!userId) return;

    try {
      const { title, description, eventType = 'sync_finish', severity = 'info', metadata = {} } = payload;
      await supabase.from('activity_feed').insert({
        user_id: userId,
        event_type: eventType,
        title,
        description: description || null,
        metadata: {
          severity,
          ...metadata,
        },
      });
    } catch (notificationError) {
      console.warn('Falha ao registrar notificação do sistema:', notificationError);
    }
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

  const resolveEdgeAccessToken = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    return currentSession?.access_token || SUPABASE_PUBLISHABLE_KEY;
  }, []);

  const invokeMoodleWithTimeout = useCallback(async (
    functionName: string,
    body: Record<string, unknown>,
    timeoutMs = 25000,
    accessTokenOverride?: string,
  ) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const accessToken = accessTokenOverride || await resolveEdgeAccessToken();

      const response = await fetch(`${SUPABASE_FUNCTIONS_BASE_URL}/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      let payload: Record<string, unknown> | null = null;
      try {
        payload = await response.json() as Record<string, unknown>;
      } catch {
        payload = null;
      }

      const error = response.ok
        ? null
        : {
            message:
              payload?.error ||
              payload?.msg ||
              `Request failed with status ${response.status}`,
          };

      const data = response.ok ? payload : null;

      clearTimeout(timeoutId);
      return { data, error };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        return { data: null, error: { message: 'Request timeout' } };
      }
      throw err;
    }
  }, [resolveEdgeAccessToken]);

  const resolveCoursesByIds = useCallback(async (courseIds: string[]): Promise<Course[]> => {
    const uniqueIds = Array.from(new Set(courseIds.filter(Boolean)));
    if (uniqueIds.length === 0) return [];

    const existingById = new Map(courses.map(course => [course.id, course]));
    const resolved: Course[] = [];
    const missingIds: string[] = [];

    for (const courseId of uniqueIds) {
      const fromState = existingById.get(courseId);
      if (fromState) {
        resolved.push(fromState);
      } else {
        missingIds.push(courseId);
      }
    }

    if (missingIds.length > 0) {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .in('id', missingIds);

      if (error) {
        console.error('Error loading courses for scoped sync:', error);
      } else if (data) {
        resolved.push(...(data as Course[]));
      }
    }

    return resolved;
  }, [courses]);

  const runBatchedEntitySync = useCallback(async (
    entity: CourseScopedSyncEntity,
    selectedCourses: Course[],
    sessionToUse: MoodleSession,
    options?: {
      onProgress?: (processedCourses: number) => void;
      accessToken?: string;
    },
  ): Promise<{ totalCount: number; succeeded: boolean; errorCount: number }> => {
    const { batchSize, timeoutMs } = STEP_BATCH_CONFIG[entity];
    const functionName = STEP_FUNCTION_MAP[entity];
    let totalCount = 0;
    let errorCount = 0;
    let processedCourses = 0;

    for (let i = 0; i < selectedCourses.length; i += batchSize) {
      const batch = selectedCourses.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (course: Course) => {
          const parsedCourseId = parseInt(course.moodle_course_id, 10);
          if (!Number.isFinite(parsedCourseId)) {
            return 0;
          }

          try {
            const { data, error } = await invokeMoodleWithTimeout(functionName, {
              moodleUrl: sessionToUse.moodleUrl,
              token: sessionToUse.moodleToken,
              courseId: parsedCourseId,
            }, timeoutMs, options?.accessToken);

            if (error || data?.error) {
              console.warn(`${entity} sync failed for course ${course.moodle_course_id}:`, error || data?.error);
              errorCount++;
              return 0;
            }

            if (entity === 'students') return (data as { students?: unknown[] })?.students?.length || 0;
            if (entity === 'activities') return Number(data?.activitiesCount || 0);
            return Number(data?.gradesCount || 0);
          } catch (err) {
            console.warn(`${entity} sync error for course ${course.moodle_course_id}:`, err);
            errorCount++;
            return 0;
          }
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && typeof result.value === 'number') {
          totalCount += result.value;
        } else if (result.status === 'rejected') {
          errorCount++;
        }
      }

      processedCourses += batch.length;
      options?.onProgress?.(processedCourses);

      if (i + batchSize < selectedCourses.length) {
        await wait(BATCH_DELAY_MS);
      }
    }

    const failedCompletely = errorCount > 0 && totalCount === 0;
    return {
      totalCount,
      succeeded: !failedCompletely,
      errorCount,
    };
  }, [invokeMoodleWithTimeout]);

  const recalculateRiskForCourses = useCallback(async (selectedCourseIds: string[]) => {
    const isMissingRpcError = (error: { code?: string | null; message?: string } | null) =>
      Boolean(error) && (
        error?.code === 'PGRST202' ||
        error?.message?.toLowerCase().includes('could not find the function') === true
      );

    const runCourseUpdate = async () => {
      if (selectedCourseIds.length === 0) {
        return { failedCount: 0, updatedCount: 0, missingRpc: false };
      }

      const firstCourse = await supabase.rpc('update_course_students_risk', {
        p_course_id: selectedCourseIds[0],
      });

      if (isMissingRpcError(firstCourse.error)) {
        return { failedCount: 0, updatedCount: 0, missingRpc: true };
      }

      if (firstCourse.error) {
        return { failedCount: 1, updatedCount: 0, missingRpc: false };
      }

      if (selectedCourseIds.length === 1) {
        return {
          failedCount: 0,
          updatedCount: firstCourse.data ?? 0,
          missingRpc: false,
        };
      }

      const results = await Promise.all(
        selectedCourseIds.slice(1).map(courseId =>
          supabase.rpc('update_course_students_risk', { p_course_id: courseId }),
        ),
      );

      const errors = results
        .map(result => result.error)
        .filter((error): error is NonNullable<typeof error> => Boolean(error));

      return {
        failedCount: errors.length,
        updatedCount: (firstCourse.data ?? 0) + results.reduce((acc, result) => acc + (result.data ?? 0), 0),
        missingRpc: errors.some(isMissingRpcError),
      };
    };

    const runStudentFallback = async () => {
      if (selectedCourseIds.length === 0) {
        return { failedCount: 0, updatedCount: 0, missingRpc: false };
      }

      const { data: studentCourseRows, error: studentCourseError } = await supabase
        .from('student_courses')
        .select('student_id')
        .in('course_id', selectedCourseIds);

      if (studentCourseError) {
        return { failedCount: 1, updatedCount: 0, missingRpc: false };
      }

      const uniqueStudentIds = Array.from(new Set((studentCourseRows || []).map(row => row.student_id)));
      if (uniqueStudentIds.length === 0) {
        return { failedCount: 0, updatedCount: 0, missingRpc: false };
      }

      const firstStudent = await supabase.rpc('update_student_risk', {
        p_student_id: uniqueStudentIds[0],
      });

      if (isMissingRpcError(firstStudent.error)) {
        return { failedCount: 0, updatedCount: 0, missingRpc: true };
      }

      if (firstStudent.error) {
        return { failedCount: 1, updatedCount: 0, missingRpc: false };
      }

      if (uniqueStudentIds.length === 1) {
        return { failedCount: 0, updatedCount: 1, missingRpc: false };
      }

      const results = await Promise.all(
        uniqueStudentIds.slice(1).map(studentId =>
          supabase.rpc('update_student_risk', { p_student_id: studentId }),
        ),
      );

      const errors = results
        .map(result => result.error)
        .filter((error): error is NonNullable<typeof error> => Boolean(error));

      return {
        failedCount: errors.length,
        updatedCount: uniqueStudentIds.length - errors.length,
        missingRpc: errors.some(isMissingRpcError),
      };
    };

    let updateResult = await runCourseUpdate();
    let usedFallback = false;

    if (updateResult.missingRpc) {
      usedFallback = true;
      updateResult = await runStudentFallback();
    }

    return {
      ...updateResult,
      usedFallback,
    };
  }, []);

  const login = useCallback(async (username: string, password: string, moodleUrl: string, service: string = 'moodle_mobile_app'): Promise<boolean> => {
    setIsLoading(true);

    try {
      const cleanUrl = normalizeMoodleUrl(moodleUrl);

      const { data, error } = await supabase.functions.invoke('moodle-auth', {
        body: {
          moodleUrl: cleanUrl,
          username,
          password,
          service,
        },
      });

      if (error) {
        const parsed = await parseFunctionsError(error);
        const loginErrorMessage = resolveFunctionsInvokeErrorMessage(parsed.message || error);
        console.error('Login error:', error);
        toast({
          title: 'Erro de autenticacao',
          description: loginErrorMessage,
          variant: 'destructive',
        });
        return false;
      }

      if (data.error) {
        const loginErrorMessage = resolveMoodleErrorMessage(data.error, data.errorcode);
        toast({
          title: 'Erro de autenticacao',
          description: loginErrorMessage,
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
      const newSession: MoodleSession | null = data.moodleToken ? {
        moodleToken: data.moodleToken,
        moodleUserId: data.moodleUserId,
        moodleUrl: cleanUrl,
      } : null;

      setUser(newUser);
      setMoodleSession(newSession);
      setLastSync(newUser.last_sync || null);
      if (newSession) {
        await saveSession(newUser, newSession);
      }

      const offlineNote = data.offlineMode ? ' (modo offline)' : '';
      toast({
        title: 'Login realizado com sucesso',
        description: `Bem-vindo, ${newUser.full_name}!${offlineNote}`,
      });

      void trackEvent(newUser.id, 'login');

      return true;
    } catch (err) {
      console.error('Login error:', err);
      const parsed = await parseFunctionsError(err);
      toast({
        title: 'Erro de autenticacao',
        description: resolveFunctionsInvokeErrorMessage(parsed.message || err),
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [saveSession]);

  const logout = useCallback(async () => {
    void trackEvent(user?.id, 'logout');
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
  }, [user?.id]);

  const clearInvalidSession = useCallback(async () => {
    resetAuthState();
    await supabase.auth.signOut({ scope: 'local' });
  }, [resetAuthState]);

  const fetchMoodleCourses = useCallback(async (userIdOverride?: number): Promise<{ courses: Course[]; handledError: boolean }> => {
    const context = await resolveSessionContext();
    if (!context) return { courses: [], handledError: false };
    const { session: sessionToUse } = context;
    const moodleUserId = userIdOverride ?? sessionToUse.moodleUserId;

    try {
      const { data, error } = await supabase.functions.invoke('moodle-sync-courses', {
        body: {
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

    const { session: sessionToUse } = context;
    const initialPhaseEntities: SyncEntity[] = ['courses', 'students'];
    const deepPhaseEntities: CourseScopedSyncEntity[] = ['activities', 'grades'];

    setIsSyncing(true);
    setSyncProgress({
      isOpen: true,
      steps: initialSteps
        .filter(step => initialPhaseEntities.includes(step.id as SyncEntity))
        .map(step => ({ ...step, status: 'pending' as const })),
      currentStep: null,
      isComplete: false,
    });

    void trackEvent(context.user.id, 'sync_start', {
      metadata: { courseIds, courseCount: courseIds.length },
    });

    let syncedCourses = courses.filter(course => courseIds.includes(course.id));
    let totalStudents = 0;
    let riskUpdateResult: {
      failedCount: number;
      updatedCount: number;
      missingRpc: boolean;
      usedFallback: boolean;
    } | null = null;
    let edgeAccessToken: string | null = null;

    try {
      edgeAccessToken = await resolveEdgeAccessToken();

      await invokeMoodleWithTimeout('moodle-sync-courses', {
        action: 'link_selected_courses',
        userId: sessionToUse.moodleUserId,
        selectedCourseIds: courseIds,
      }, 30000, edgeAccessToken);

      if (initialPhaseEntities.includes('courses')) {
        updateStep('courses', { status: 'in_progress', count: 0, total: 1 });
        const { data, error } = await invokeMoodleWithTimeout('moodle-sync-courses', {
          moodleUrl: sessionToUse.moodleUrl,
          token: sessionToUse.moodleToken,
          userId: sessionToUse.moodleUserId,
        }, 30000, edgeAccessToken);

        if (error || data?.error) {
          updateStep('courses', {
            status: 'error',
            errorMessage: (typeof error?.message === 'string' ? error.message : undefined) || (data as { error?: string })?.error || 'Falha ao sincronizar cursos',
          });
        } else {
          const allSyncedCourses: Course[] = (data as { courses?: Course[] })?.courses || [];
          setCourses(allSyncedCourses);
          syncedCourses = allSyncedCourses.filter(course => courseIds.includes(course.id));
          updateStep('courses', {
            status: 'completed',
            count: syncedCourses.length,
            total: syncedCourses.length,
          });
        }
      }

      if (initialPhaseEntities.includes('students')) {
        updateStep('students', { status: 'in_progress', count: 0, total: syncedCourses.length });
        const result = await runBatchedEntitySync('students', syncedCourses, sessionToUse, {
          accessToken: edgeAccessToken,
          onProgress: (processedCourses) => {
            updateStep('students', { count: processedCourses, total: syncedCourses.length });
          },
        });
        totalStudents = result.totalCount;
        updateStep('students', {
          status: result.succeeded ? 'completed' : 'error',
          count: totalStudents,
          errorMessage: result.errorCount > 0 ? `${result.errorCount} cursos com erro` : undefined,
        });
      }

      if ((initialPhaseEntities.includes('courses') || initialPhaseEntities.includes('students')) && courseIds.length > 0) {
        riskUpdateResult = await recalculateRiskForCourses(courseIds);
      }

      const now = new Date().toISOString();
      setLastSync(now);
      setSyncProgress(prev => ({
        ...prev,
        isComplete: true,
      }));

      toast({
        title: 'Sincronização inicial concluída',
        description: `${syncedCourses.length} cursos e ${totalStudents} alunos sincronizados. Atividades e notas continuarao em segundo plano.${riskUpdateResult && !riskUpdateResult.missingRpc && riskUpdateResult.failedCount === 0 ? ` Risco recalculado automaticamente para ${riskUpdateResult.updatedCount} alunos.` : ''}`,
      });

      void trackEvent(context.user.id, 'sync_finish', {
        metadata: {
          courses: syncedCourses.length,
          students: totalStudents,
          activities: 0,
          grades: 0,
        },
      });

      if (riskUpdateResult?.missingRpc) {
        toast({
          title: 'Funcao de risco indisponivel',
          description: 'As funcoes de atualizacao de risco nao existem no banco local. Crie/aplique as migracoes.',
          variant: 'destructive',
        });
      } else if (riskUpdateResult && riskUpdateResult.failedCount > 0) {
        toast({
          title: 'Atualizacao parcial de risco',
          description: riskUpdateResult.usedFallback
            ? `${riskUpdateResult.updatedCount} alunos recalculados via fallback e ${riskUpdateResult.failedCount} com erro.`
            : `${riskUpdateResult.updatedCount} alunos recalculados e ${riskUpdateResult.failedCount} com erro.`,
          variant: 'destructive',
        });
      }

      if (deepPhaseEntities.length > 0 && !deepSyncInProgressRef.current) {
        deepSyncInProgressRef.current = true;
        const syncOwnerId = context.user.id;

        await createSystemNotification(syncOwnerId, {
          title: 'Sincronização em segundo plano iniciada',
          description: 'As atividades e notas restantes serão sincronizadas em segundo plano.',
          eventType: 'sync_start',
          severity: 'info',
          metadata: {
            sync_phase: 'deep',
            courses: syncedCourses.length,
          },
        });

        void (async () => {
          let deepActivities = 0;
          let deepGrades = 0;

          try {
            if (deepPhaseEntities.includes('activities')) {
              const activitiesResult = await runBatchedEntitySync('activities', syncedCourses, sessionToUse, {
                accessToken: edgeAccessToken || undefined,
              });
              deepActivities = activitiesResult.totalCount;
            }

            if (deepPhaseEntities.includes('grades')) {
              const gradesResult = await runBatchedEntitySync('grades', syncedCourses, sessionToUse, {
                accessToken: edgeAccessToken || undefined,
              });
              deepGrades = gradesResult.totalCount;
            }

            setLastSync(new Date().toISOString());
            toast({
              title: 'Sincronização concluída',
              description: `${deepActivities} atividades e ${deepGrades} notas sincronizadas em segundo plano.`,
            });
            await createSystemNotification(syncOwnerId, {
              title: 'Sincronização concluída',
              description: `${deepActivities} atividades e ${deepGrades} notas foram sincronizadas em segundo plano.`,
              eventType: 'sync_finish',
              severity: 'info',
              metadata: {
                sync_phase: 'deep',
                activities: deepActivities,
                grades: deepGrades,
                courses: syncedCourses.length,
              },
            });
          } catch (deepErr) {
            console.error('Background deep sync error:', deepErr);
            toast({
              title: 'Erro na sincronização profunda',
              description: 'Nao foi possivel concluir a sincronização em segundo plano de atividades e notas.',
              variant: 'destructive',
            });
            await createSystemNotification(syncOwnerId, {
              title: 'Falha na sincronização em segundo plano',
              description: 'Não foi possível concluir a sincronização em segundo plano de atividades e notas.',
              eventType: 'sync_error',
              severity: 'warning',
              metadata: {
                sync_phase: 'deep',
                courses: syncedCourses.length,
              },
            });
          } finally {
            deepSyncInProgressRef.current = false;
          }
        })();
      }
    } catch (err) {
      console.error('Sync error:', err);
      toast({
        title: 'Erro na sincronização',
        description: 'Ocorreu um erro durante a sincronização. Tente novamente.',
        variant: 'destructive',
      });
      void trackEvent(context.user.id, 'sync_error');
      void logError(context.user.id, 'Erro na sincronizacao com Moodle', {
        category: 'integration',
        payload: { message: err instanceof Error ? err.message : String(err) },
      });
      setSyncProgress(prev => ({ ...prev, isComplete: true }));
    } finally {
      setIsSyncing(false);
    }
  }, [courses, createSystemNotification, invokeMoodleWithTimeout, recalculateRiskForCourses, resolveEdgeAccessToken, resolveSessionContext, runBatchedEntitySync, updateStep]);

  const syncEntitiesIncremental = useCallback(async (
    courseIds: string[],
    entities: CourseScopedSyncEntity[],
    labels?: {
      successTitle?: string;
      emptyMessage?: string;
    },
  ): Promise<ScopedSyncSummary | null> => {
    const context = await resolveSessionContext();
    if (!context) {
      toast({
        title: 'Erro',
        description: 'Sessao expirada. Faca login novamente.',
        variant: 'destructive',
      });
      return null;
    }

    const { session: sessionToUse } = context;
    const selectedCourses = await resolveCoursesByIds(courseIds);
    if (selectedCourses.length === 0) {
      toast({
        title: 'Nenhum curso selecionado',
        description: labels?.emptyMessage || 'Selecione ao menos um curso para sincronizar.',
        variant: 'destructive',
      });
      return null;
    }

    const summary: ScopedSyncSummary = {
      students: 0,
      activities: 0,
      grades: 0,
    };

    setIsSyncing(true);
    try {
      const accessToken = await resolveEdgeAccessToken();

      for (const entity of entities) {
        const result = await runBatchedEntitySync(entity, selectedCourses, sessionToUse, { accessToken });
        summary[entity] = result.totalCount;
      }

      if (entities.includes('students')) {
        await recalculateRiskForCourses(selectedCourses.map(course => course.id));
      }

      const now = new Date().toISOString();
      setLastSync(now);

      const parts: string[] = [];
      if (entities.includes('students')) parts.push(`${summary.students} alunos`);
      if (entities.includes('activities')) parts.push(`${summary.activities} atividades`);
      if (entities.includes('grades')) parts.push(`${summary.grades} notas`);

      toast({
        title: labels?.successTitle || 'Sincronização incremental concluída',
        description: `${selectedCourses.length} curso(s): ${parts.join(', ')} atualizados.`,
      });

      return summary;
    } catch (err) {
      console.error('Incremental sync error:', err);
      toast({
        title: 'Erro na sincronização incremental',
        description: 'Nao foi possivel atualizar os dados solicitados.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [recalculateRiskForCourses, resolveCoursesByIds, resolveEdgeAccessToken, resolveSessionContext, runBatchedEntitySync]);

  const syncStudentsIncremental = useCallback(async (courseIds: string[]) => {
    await syncEntitiesIncremental(courseIds, ['students'], {
      successTitle: 'Alunos sincronizados',
      emptyMessage: 'Nao ha cursos elegiveis para sincronizar alunos.',
    });
  }, [syncEntitiesIncremental]);

  const syncCourseIncremental = useCallback(async (
    courseId: string,
    entities: CourseScopedSyncEntity[] = ['students', 'activities', 'grades'],
  ) => {
    await syncEntitiesIncremental([courseId], entities, {
      successTitle: 'Unidade curricular sincronizada',
      emptyMessage: 'Nao foi possivel encontrar a unidade curricular selecionada.',
    });
  }, [syncEntitiesIncremental]);

  const value: ExtendedAuthContextType = {
    user,
    isLoading,
    isSyncing,
    isAuthenticated: !!user,
    isOfflineMode: !!user && !moodleSession,
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
    syncStudentsIncremental,
    syncCourseIncremental,
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

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
