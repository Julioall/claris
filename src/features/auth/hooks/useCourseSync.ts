import { useCallback, useEffect, useRef, useState } from 'react';

import type { Course } from '@/features/courses/types';
import { useBackgroundActivity } from '@/contexts/BackgroundActivityContext';
import {
  appendBackgroundJobEvent,
  createBackgroundJob,
  createBackgroundJobItems,
  updateBackgroundJob,
  updateBackgroundJobItem,
} from '@/features/background-jobs/api/backgroundJobs.repository';
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

type DeepSyncEntity = Extract<CourseScopedSyncEntity, 'activities' | 'grades'>;

const DEEP_SYNC_ENTITY_LABELS: Record<DeepSyncEntity, string> = {
  activities: 'Sincronizacao de atividades',
  grades: 'Sincronizacao de notas',
};

interface DeepSyncMonitorState {
  jobId: string;
  itemIds: Partial<Record<DeepSyncEntity, string>>;
  processedItems: number;
  successCount: number;
  errorCount: number;
  totalItems: number;
}

function createClientGeneratedId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function initializeDeepSyncMonitor(params: {
  userId: string;
  courseIds: string[];
  courseCount: number;
  entities: DeepSyncEntity[];
}) {
  const job = await createBackgroundJob({
    userId: params.userId,
    courseId: params.courseIds.length === 1 ? params.courseIds[0] : null,
    jobType: 'moodle_deep_sync',
    source: 'sync',
    title: 'Sincronizacao profunda do Moodle',
    description: 'Atividades e notas continuam sendo atualizadas em segundo plano.',
    status: 'processing',
    totalItems: params.entities.length,
    processedItems: 0,
    successCount: 0,
    errorCount: 0,
    startedAt: new Date().toISOString(),
    metadata: {
      course_count: params.courseCount,
      course_ids: params.courseIds,
      entities: params.entities,
    },
  });

  const itemIds: Partial<Record<DeepSyncEntity, string>> = {};
  await createBackgroundJobItems(params.entities.map((entity) => {
    const itemId = createClientGeneratedId(`deep-sync-${entity}`);
    itemIds[entity] = itemId;

    return {
      id: itemId,
      jobId: job.id,
      userId: params.userId,
      itemKey: entity,
      label: DEEP_SYNC_ENTITY_LABELS[entity],
      status: 'pending',
      progressCurrent: 0,
      progressTotal: params.courseCount,
      metadata: {
        course_count: params.courseCount,
        entity,
      },
    };
  }));

  await appendBackgroundJobEvent({
    userId: params.userId,
    jobId: job.id,
    eventType: 'job_processing',
    message: 'Sincronizacao profunda iniciada.',
    metadata: {
      course_count: params.courseCount,
      entities: params.entities,
    },
  });

  return {
    jobId: job.id,
    itemIds,
    processedItems: 0,
    successCount: 0,
    errorCount: 0,
    totalItems: params.entities.length,
  } satisfies DeepSyncMonitorState;
}

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
  const { trackActivity } = useBackgroundActivity();
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
    await trackActivity({
      label: 'Sincronizando dados do Moodle',
      description: `${courseIds.length} curso(s) em processamento`,
      source: 'sync',
    }, async () => {
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
          syncedCourses = allSyncedCourses.filter((course) => courseIds.includes(course.id));
          setCourses(allSyncedCourses);
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
            let deepSyncMonitor: DeepSyncMonitorState | null = null;
            let currentDeepEntity: DeepSyncEntity | null = null;

            try {
              try {
                deepSyncMonitor = await initializeDeepSyncMonitor({
                  userId: syncOwnerId,
                  courseIds: syncedCourses.map((course) => course.id),
                  courseCount: syncedCourses.length,
                  entities: deepPhaseEntities as DeepSyncEntity[],
                });
              } catch (monitorError) {
                console.error('[sync][background-jobs] failed to initialize deep sync monitor:', monitorError);
              }

              const syncDeepEntity = async (entity: DeepSyncEntity) => {
                currentDeepEntity = entity;

                const itemId = deepSyncMonitor?.itemIds[entity] ?? null;
                const totalCourses = syncedCourses.length;
                const startedAt = new Date().toISOString();
                const entityLabel = DEEP_SYNC_ENTITY_LABELS[entity];
                const entityTargetLabel = entity === 'activities' ? 'atividades' : 'notas';

                if (itemId) {
                  await updateBackgroundJobItem(itemId, {
                    started_at: startedAt,
                    progress_current: 0,
                    progress_total: totalCourses,
                    status: 'processing',
                  });
                  await appendBackgroundJobEvent({
                    userId: syncOwnerId,
                    jobId: deepSyncMonitor!.jobId,
                    jobItemId: itemId,
                    eventType: 'job_item_processing',
                    message: `${entityLabel} iniciada.`,
                  });
                }

                const result = await runBatchedEntitySync({
                  entity,
                  selectedCourses: syncedCourses,
                  session: context.session,
                  accessToken: edgeAccessToken || undefined,
                  onProgress: (processedCourses) => {
                    if (!itemId) return;

                    void updateBackgroundJobItem(itemId, {
                      progress_current: processedCourses,
                      progress_total: totalCourses,
                    }).catch((progressError) => {
                      console.error('[sync][background-jobs] failed to update deep sync progress:', progressError);
                    });
                  },
                });

                const completedAt = new Date().toISOString();
                const itemStatus = result.succeeded ? 'completed' : 'failed';
                const itemErrorMessage = result.errorCount > 0
                  ? `${result.errorCount} curso(s) com erro na etapa de ${entityTargetLabel}.`
                  : null;

                if (itemId) {
                  await updateBackgroundJobItem(itemId, {
                    completed_at: completedAt,
                    error_message: itemStatus === 'failed' ? itemErrorMessage ?? `Falha ao sincronizar ${entityTargetLabel}.` : itemErrorMessage,
                    metadata: {
                      course_count: totalCourses,
                      course_error_count: result.errorCount,
                      entity,
                      total_count: result.totalCount,
                    },
                    progress_current: totalCourses,
                    progress_total: totalCourses,
                    status: itemStatus,
                  });
                }

                if (deepSyncMonitor) {
                  deepSyncMonitor.processedItems += 1;
                  if (result.succeeded) {
                    deepSyncMonitor.successCount += 1;
                  } else {
                    deepSyncMonitor.errorCount += 1;
                  }

                  await updateBackgroundJob(deepSyncMonitor.jobId, {
                    error_count: deepSyncMonitor.errorCount,
                    processed_items: deepSyncMonitor.processedItems,
                    status: deepSyncMonitor.processedItems >= deepSyncMonitor.totalItems ? itemStatus : 'processing',
                    success_count: deepSyncMonitor.successCount,
                    total_items: deepSyncMonitor.totalItems,
                  });

                  await appendBackgroundJobEvent({
                    userId: syncOwnerId,
                    jobId: deepSyncMonitor.jobId,
                    jobItemId: itemId,
                    eventType: itemStatus === 'failed' ? 'job_item_failed' : 'job_item_completed',
                    level: itemStatus === 'failed' ? 'error' : 'info',
                    message: itemStatus === 'failed'
                      ? `${entityLabel} finalizada com falha.`
                      : `${entityLabel} concluida com ${result.totalCount} registro(s) sincronizado(s).`,
                    metadata: {
                      course_count: totalCourses,
                      course_error_count: result.errorCount,
                      entity,
                      total_count: result.totalCount,
                    },
                  });
                }

                currentDeepEntity = null;
                return result;
              };

              if (deepPhaseEntities.includes('activities')) {
                const activitiesResult = await syncDeepEntity('activities');
                deepActivities = activitiesResult.totalCount;
              }

              if (deepPhaseEntities.includes('grades')) {
                const gradesResult = await syncDeepEntity('grades');
                deepGrades = gradesResult.totalCount;
              }

              if (deepSyncMonitor) {
                const completedAt = new Date().toISOString();
                const finalStatus = deepSyncMonitor.errorCount > 0 && deepSyncMonitor.successCount === 0
                  ? 'failed'
                  : 'completed';

                await updateBackgroundJob(deepSyncMonitor.jobId, {
                  completed_at: completedAt,
                  error_count: deepSyncMonitor.errorCount,
                  processed_items: deepSyncMonitor.processedItems,
                  status: finalStatus,
                  success_count: deepSyncMonitor.successCount,
                  total_items: deepSyncMonitor.totalItems,
                });
                await appendBackgroundJobEvent({
                  userId: syncOwnerId,
                  jobId: deepSyncMonitor.jobId,
                  eventType: finalStatus === 'failed' ? 'job_failed' : 'job_completed',
                  level: finalStatus === 'failed' ? 'error' : 'info',
                  message: finalStatus === 'failed'
                    ? 'Sincronizacao profunda finalizada com falha.'
                    : 'Sincronizacao profunda concluida.',
                  metadata: {
                    activities: deepActivities,
                    courses: syncedCourses.length,
                    grades: deepGrades,
                  },
                });
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

              if (deepSyncMonitor) {
                const completedAt = new Date().toISOString();
                const errorMessage = error instanceof Error
                  ? error.message
                  : 'Falha inesperada na sincronizacao profunda.';
                const failedItemId = currentDeepEntity ? deepSyncMonitor.itemIds[currentDeepEntity] ?? null : null;

                if (failedItemId && currentDeepEntity) {
                  deepSyncMonitor.processedItems += 1;
                  deepSyncMonitor.errorCount += 1;

                  await updateBackgroundJobItem(failedItemId, {
                    completed_at: completedAt,
                    error_message: errorMessage,
                    progress_current: syncedCourses.length,
                    progress_total: syncedCourses.length,
                    status: 'failed',
                  });
                  await appendBackgroundJobEvent({
                    userId: syncOwnerId,
                    jobId: deepSyncMonitor.jobId,
                    jobItemId: failedItemId,
                    eventType: 'job_item_failed',
                    level: 'error',
                    message: `${DEEP_SYNC_ENTITY_LABELS[currentDeepEntity]} falhou: ${errorMessage}`,
                  });
                }

                await updateBackgroundJob(deepSyncMonitor.jobId, {
                  completed_at: completedAt,
                  error_count: deepSyncMonitor.errorCount,
                  error_message: errorMessage,
                  processed_items: deepSyncMonitor.processedItems,
                  status: 'failed',
                  success_count: deepSyncMonitor.successCount,
                  total_items: deepSyncMonitor.totalItems,
                });
                await appendBackgroundJobEvent({
                  userId: syncOwnerId,
                  jobId: deepSyncMonitor.jobId,
                  eventType: 'job_failed',
                  level: 'error',
                  message: errorMessage,
                });
              }

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
    });
  }, [courses, params, trackActivity, updateStep]);

  const syncEntitiesIncremental = useCallback(async (
    courseIds: string[],
    entities: CourseScopedSyncEntity[],
    labels?: {
      successTitle?: string;
      emptyMessage?: string;
    },
  ): Promise<ScopedSyncSummary | null> => {
    return await trackActivity({
      label: labels?.successTitle || 'Sincronizacao incremental',
      description: `${courseIds.length} curso(s) em atualizacao`,
      source: 'sync',
    }, async () => {
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
    });
  }, [courses, params, trackActivity]);

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
