import { useCallback, useEffect, useRef, useState } from 'react';

import type { Course } from '@/features/courses/types';
import { toast } from '@/hooks/use-toast';
import { logError, trackEvent } from '@/lib/tracking';

import type { SessionContext } from '../domain/session';
import {
  createInitialSyncProgress,
  INITIAL_SYNC_STEPS,
  type CourseScopedSyncEntity,
  type ScopedSyncSummary,
  type SyncEntity,
  type SyncProgress,
} from '../domain/sync';
import { recalculateRiskForCourses } from '../application/risk.service';
import { createSystemNotification } from '../application/system-notification.service';
import { resolveCoursesByIds, runBatchedEntitySync } from '../infrastructure/course-sync.service';
import {
  fetchMoodleCoursesFromSession,
  invokeMoodleFunctionWithTimeout,
  resolveEdgeAccessToken,
} from '../infrastructure/moodle-api';

export interface UseCourseSyncResult {
  courses: Course[];
  setCourses: (courses: Course[]) => void;
  isSyncing: boolean;
  syncProgress: SyncProgress;
  closeSyncProgress: () => void;
  syncData: () => Promise<void>;
  syncSelectedCourses: (courseIds: string[]) => Promise<void>;
  syncStudentsIncremental: (courseIds: string[]) => Promise<void>;
  syncCourseIncremental: (courseId: string, entities?: CourseScopedSyncEntity[]) => Promise<void>;
  showCourseSelector: boolean;
  setShowCourseSelector: (show: boolean) => void;
}

export function useCourseSync(params: {
  userId?: string;
  resolveSessionContext: () => Promise<SessionContext | null>;
  clearInvalidSession: () => Promise<void>;
  setLastSync: (value: string | null) => void;
}): UseCourseSyncResult {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showCourseSelector, setShowCourseSelector] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>(createInitialSyncProgress());
  const deepSyncInProgressRef = useRef(false);

  const resetSyncState = useCallback(() => {
    setCourses([]);
    setIsSyncing(false);
    setShowCourseSelector(false);
    setSyncProgress(createInitialSyncProgress());
  }, []);

  useEffect(() => {
    if (!params.userId) {
      resetSyncState();
    }
  }, [params.userId, resetSyncState]);

  const updateStep = useCallback((stepId: string, updates: Partial<SyncProgress['steps'][number]>) => {
    setSyncProgress((previous) => ({
      ...previous,
      currentStep: updates.status === 'in_progress' ? stepId : previous.currentStep,
      steps: previous.steps.map((step) =>
        step.id === stepId ? { ...step, ...updates } : step,
      ),
    }));
  }, []);

  const closeSyncProgress = useCallback(() => {
    setSyncProgress((previous) => ({ ...previous, isOpen: false }));
  }, []);

  const fetchMoodleCourses = useCallback(async (userIdOverride?: number) => {
    const context = await params.resolveSessionContext();
    if (!context) return { courses: [], handledError: false };

    const result = await fetchMoodleCoursesFromSession(
      context.session,
      userIdOverride ?? context.session.moodleUserId,
    );

    if (!result.handledError) {
      return result;
    }

    if (result.isMissingUser) {
      await params.clearInvalidSession();
      toast({
        title: 'Sessao invalida',
        description: 'Sua sessao local ficou desatualizada. Faca login novamente.',
        variant: 'destructive',
      });

      return { courses: [], handledError: true };
    }

    toast({
      title: 'Erro ao buscar cursos',
      description: result.errorMessage || 'Nao foi possivel obter cursos do Moodle.',
      variant: 'destructive',
    });

    return { courses: [], handledError: true };
  }, [params]);

  const syncData = useCallback(async () => {
    const context = await params.resolveSessionContext();
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
      let fetchedCourses = result.courses;

      if (fetchedCourses.length === 0 && !result.handledError) {
        const fallbackMoodleUserId = Number(context.user.moodle_user_id);
        if (Number.isInteger(fallbackMoodleUserId) && fallbackMoodleUserId > 0) {
          result = await fetchMoodleCourses(fallbackMoodleUserId);
          fetchedCourses = result.courses;
        }
      }

      if (result.handledError) return;

      setCourses(fetchedCourses);
      if (fetchedCourses.length > 0) {
        setShowCourseSelector(true);
        return;
      }

      toast({
        title: 'Nenhum curso encontrado',
        description: 'Nao foram encontrados cursos no Moodle.',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  }, [courses.length, fetchMoodleCourses, params]);

  const syncSelectedCourses = useCallback(async (courseIds: string[]) => {
    const context = await params.resolveSessionContext();
    if (!context) {
      toast({
        title: 'Erro',
        description: 'Sessao expirada. Faca login novamente.',
        variant: 'destructive',
      });
      return;
    }

    const initialPhaseEntities: SyncEntity[] = ['courses', 'students'];
    const deepPhaseEntities: CourseScopedSyncEntity[] = ['activities', 'grades'];

    setIsSyncing(true);
    setSyncProgress({
      isOpen: true,
      steps: INITIAL_SYNC_STEPS
        .filter((step) => initialPhaseEntities.includes(step.id as SyncEntity))
        .map((step) => ({ ...step, status: 'pending' as const })),
      currentStep: null,
      isComplete: false,
    });

    void trackEvent(context.user.id, 'sync_start', {
      metadata: { courseIds, courseCount: courseIds.length },
    });

    let syncedCourses = courses.filter((course) => courseIds.includes(course.id));
    let totalStudents = 0;
    let riskUpdateResult: Awaited<ReturnType<typeof recalculateRiskForCourses>> | null = null;
    let edgeAccessToken: string | null = null;

    try {
      edgeAccessToken = await resolveEdgeAccessToken();

      await invokeMoodleFunctionWithTimeout({
        functionName: 'moodle-sync-courses',
        body: {
          action: 'link_selected_courses',
          userId: context.session.moodleUserId,
          selectedCourseIds: courseIds,
        },
        timeoutMs: 30000,
        accessTokenOverride: edgeAccessToken,
      });

      updateStep('courses', { status: 'in_progress', count: 0, total: 1 });
      const { data: coursesData, error: coursesError } = await invokeMoodleFunctionWithTimeout({
        functionName: 'moodle-sync-courses',
        body: {
          moodleUrl: context.session.moodleUrl,
          token: context.session.moodleToken,
          userId: context.session.moodleUserId,
        },
        timeoutMs: 30000,
        accessTokenOverride: edgeAccessToken,
      });

      if (coursesError || coursesData?.error) {
        updateStep('courses', {
          status: 'error',
          errorMessage:
            (typeof coursesError?.message === 'string' ? coursesError.message : undefined) ||
            (coursesData as { error?: string } | null)?.error ||
            'Falha ao sincronizar cursos',
        });
      } else {
        const allSyncedCourses = ((coursesData as { courses?: Course[] } | null)?.courses || []);
        setCourses(allSyncedCourses);
        syncedCourses = allSyncedCourses.filter((course) => courseIds.includes(course.id));
        updateStep('courses', {
          status: 'completed',
          count: syncedCourses.length,
          total: syncedCourses.length,
        });
      }

      updateStep('students', { status: 'in_progress', count: 0, total: syncedCourses.length });
      const studentsResult = await runBatchedEntitySync({
        entity: 'students',
        selectedCourses: syncedCourses,
        session: context.session,
        accessToken: edgeAccessToken,
        onProgress: (processedCourses) => {
          updateStep('students', { count: processedCourses, total: syncedCourses.length });
        },
      });

      totalStudents = studentsResult.totalCount;
      updateStep('students', {
        status: studentsResult.succeeded ? 'completed' : 'error',
        count: totalStudents,
        errorMessage: studentsResult.errorCount > 0 ? `${studentsResult.errorCount} cursos com erro` : undefined,
      });

      if (courseIds.length > 0) {
        riskUpdateResult = await recalculateRiskForCourses(courseIds);
      }

      const now = new Date().toISOString();
      params.setLastSync(now);
      setSyncProgress((previous) => ({
        ...previous,
        isComplete: true,
      }));

      toast({
        title: 'Sincronizacao inicial concluida',
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
          title: 'Sincronizacao em segundo plano iniciada',
          description: 'As atividades e notas restantes serao sincronizadas em segundo plano.',
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
              const activitiesResult = await runBatchedEntitySync({
                entity: 'activities',
                selectedCourses: syncedCourses,
                session: context.session,
                accessToken: edgeAccessToken || undefined,
              });
              deepActivities = activitiesResult.totalCount;
            }

            if (deepPhaseEntities.includes('grades')) {
              const gradesResult = await runBatchedEntitySync({
                entity: 'grades',
                selectedCourses: syncedCourses,
                session: context.session,
                accessToken: edgeAccessToken || undefined,
              });
              deepGrades = gradesResult.totalCount;
            }

            params.setLastSync(new Date().toISOString());
            toast({
              title: 'Sincronizacao concluida',
              description: `${deepActivities} atividades e ${deepGrades} notas sincronizadas em segundo plano.`,
            });

            await createSystemNotification(syncOwnerId, {
              title: 'Sincronizacao concluida',
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
          } catch (error) {
            console.error('Background deep sync error:', error);
            toast({
              title: 'Erro na sincronizacao profunda',
              description: 'Nao foi possivel concluir a sincronizacao em segundo plano de atividades e notas.',
              variant: 'destructive',
            });

            await createSystemNotification(syncOwnerId, {
              title: 'Falha na sincronizacao em segundo plano',
              description: 'Nao foi possivel concluir a sincronizacao em segundo plano de atividades e notas.',
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
    } catch (error) {
      console.error('Sync error:', error);
      toast({
        title: 'Erro na sincronizacao',
        description: 'Ocorreu um erro durante a sincronizacao. Tente novamente.',
        variant: 'destructive',
      });
      void trackEvent(context.user.id, 'sync_error');
      void logError(context.user.id, 'Erro na sincronizacao com Moodle', {
        category: 'integration',
        payload: { message: error instanceof Error ? error.message : String(error) },
      });
      setSyncProgress((previous) => ({ ...previous, isComplete: true }));
    } finally {
      setIsSyncing(false);
    }
  }, [courses, params, updateStep]);

  const syncEntitiesIncremental = useCallback(async (
    courseIds: string[],
    entities: CourseScopedSyncEntity[],
    labels?: {
      successTitle?: string;
      emptyMessage?: string;
    },
  ): Promise<ScopedSyncSummary | null> => {
    const context = await params.resolveSessionContext();
    if (!context) {
      toast({
        title: 'Erro',
        description: 'Sessao expirada. Faca login novamente.',
        variant: 'destructive',
      });
      return null;
    }

    const selectedCourses = await resolveCoursesByIds(courseIds, courses);
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
        const result = await runBatchedEntitySync({
          entity,
          selectedCourses,
          session: context.session,
          accessToken,
        });
        summary[entity] = result.totalCount;
      }

      if (entities.includes('students')) {
        await recalculateRiskForCourses(selectedCourses.map((course) => course.id));
      }

      params.setLastSync(new Date().toISOString());

      const parts: string[] = [];
      if (entities.includes('students')) parts.push(`${summary.students} alunos`);
      if (entities.includes('activities')) parts.push(`${summary.activities} atividades`);
      if (entities.includes('grades')) parts.push(`${summary.grades} notas`);

      toast({
        title: labels?.successTitle || 'Sincronizacao incremental concluida',
        description: `${selectedCourses.length} curso(s): ${parts.join(', ')} atualizados.`,
      });

      return summary;
    } catch (error) {
      console.error('Incremental sync error:', error);
      toast({
        title: 'Erro na sincronizacao incremental',
        description: 'Nao foi possivel atualizar os dados solicitados.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [courses, params]);

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

  return {
    courses,
    setCourses,
    isSyncing,
    syncProgress,
    closeSyncProgress,
    syncData,
    syncSelectedCourses,
    syncStudentsIncremental,
    syncCourseIncremental,
    showCourseSelector,
    setShowCourseSelector,
  };
}
