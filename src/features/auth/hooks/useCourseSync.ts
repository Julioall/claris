import { useCallback, useEffect, useRef, useState } from 'react';

import type { Course } from '@/features/courses/types';
import { loadSelectedMoodleConnectionId } from '@/features/moodle-connections/state/selected-connection';
import { useBackgroundActivity } from '@/contexts/BackgroundActivityContext';
import { toast } from '@/hooks/use-toast';
import { logError, trackEvent } from '@/lib/tracking';

import {
  listActiveMoodleSyncJobs,
  listAvailableMoodleCourses,
  startCourseMoodleSync,
  startInitialMoodleSync,
  waitForMoodleSyncJob,
} from '../api/moodle-sync-jobs';
import type {
  MoodleSyncEntityDto,
  MoodleSyncJobDto,
  MoodleSyncJobStepDto,
} from '../api/contracts/moodle-sync-jobs.contract';
import {
  createInitialSyncProgress,
  INITIAL_SYNC_STEPS,
  type CourseScopedSyncEntity,
  type ScopedSyncSummary,
  type SyncProgress,
  type SyncStep,
} from '../domain/sync';

const STEP_DETAILS: Record<Exclude<MoodleSyncJobStepDto['entity'], 'risk'>, {
  icon: SyncStep['icon'];
  label: string;
}> = {
  courses: { icon: 'courses', label: 'Sincronizar cursos' },
  students: { icon: 'students', label: 'Sincronizar alunos' },
  activities: { icon: 'activities', label: 'Sincronizar atividades' },
  grades: { icon: 'grades', label: 'Sincronizar notas' },
};

function mapStepStatus(status: MoodleSyncJobStepDto['status']): SyncStep['status'] {
  if (status === 'processing') return 'in_progress';
  if (status === 'completed') return 'completed';
  if (status === 'failed' || status === 'cancelled') return 'error';
  return 'pending';
}

function mapJobProgress(job: MoodleSyncJobDto, isOpen = true): SyncProgress {
  const steps = job.steps
    .filter((step): step is MoodleSyncJobStepDto & { entity: Exclude<MoodleSyncJobStepDto['entity'], 'risk'> } => (
      step.entity !== 'risk'
    ))
    .map<SyncStep>((step) => {
      const details = STEP_DETAILS[step.entity];
      const status = mapStepStatus(step.status);
      return {
        id: step.entity,
        label: details.label,
        icon: details.icon,
        status,
        count: status === 'completed' ? step.recordCount : step.processedItems,
        total: status === 'in_progress' ? step.totalItems : undefined,
        errorMessage: step.errorMessage ?? undefined,
      };
    });

  return {
    isOpen,
    steps: steps.length > 0 ? steps : INITIAL_SYNC_STEPS.map((step) => ({ ...step })),
    currentStep: steps.find((step) => step.status === 'in_progress')?.id ?? null,
    isComplete: job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled',
  };
}

function summaryFromJob(job: MoodleSyncJobDto): ScopedSyncSummary {
  const count = (entity: MoodleSyncEntityDto) => (
    job.steps.find((step) => step.entity === entity)?.recordCount ?? 0
  );
  return {
    students: count('students'),
    activities: count('activities'),
    grades: count('grades'),
  };
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
  syncCourseIncremental: (
    courseId: string,
    entities?: CourseScopedSyncEntity[],
    options?: { silent?: boolean; successTitle?: string },
  ) => Promise<void>;
  showCourseSelector: boolean;
  setShowCourseSelector: (show: boolean) => void;
}

export function useCourseSync(params: {
  userId?: string;
  setLastSync: (value: string | null) => void;
}): UseCourseSyncResult {
  const { userId, setLastSync } = params;
  const connectionId = userId ? loadSelectedMoodleConnectionId(userId) : null;
  const { trackActivity } = useBackgroundActivity();
  const [courses, setCourses] = useState<Course[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showCourseSelector, setShowCourseSelector] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>(createInitialSyncProgress());
  const monitoredJobIdRef = useRef<string | null>(null);
  const scopeRef = useRef<{ connectionId: string | null; userId?: string } | null>(null);

  const resetSyncState = useCallback(() => {
    monitoredJobIdRef.current = null;
    setCourses([]);
    setIsSyncing(false);
    setShowCourseSelector(false);
    setSyncProgress(createInitialSyncProgress());
  }, []);

  useEffect(() => {
    const previousScope = scopeRef.current;
    const scopeChanged = previousScope !== null && (
      previousScope.userId !== userId || previousScope.connectionId !== connectionId
    );

    if (!userId || !connectionId || scopeChanged) resetSyncState();
    scopeRef.current = { userId, connectionId };
  }, [connectionId, resetSyncState, userId]);

  const closeSyncProgress = useCallback(() => {
    setSyncProgress((previous) => ({ ...previous, isOpen: false }));
  }, []);

  const monitorJob = useCallback(async (
    initialJob: MoodleSyncJobDto,
    options: { openProgress?: boolean } = {},
  ) => {
    monitoredJobIdRef.current = initialJob.id;
    setIsSyncing(true);
    try {
      const finalJob = await waitForMoodleSyncJob(initialJob, (job) => {
        if (monitoredJobIdRef.current !== job.id) return;
        setSyncProgress(mapJobProgress(job, options.openProgress ?? true));
      });
      if (monitoredJobIdRef.current === finalJob.id) {
        setLastSync(finalJob.completedAt ?? finalJob.updatedAt);
        setIsSyncing(false);
        monitoredJobIdRef.current = null;
      }
      return finalJob;
    } catch (error) {
      if (monitoredJobIdRef.current === initialJob.id) {
        setIsSyncing(false);
        monitoredJobIdRef.current = null;
      }
      throw error;
    }
  }, [setLastSync]);

  useEffect(() => {
    if (!userId || !connectionId || monitoredJobIdRef.current) return;
    let cancelled = false;

    void listActiveMoodleSyncJobs()
      .then(async (jobs) => {
        const latest = jobs.find((job) => job.connectionId === connectionId);
        if (!latest || cancelled || monitoredJobIdRef.current) return;
        try {
          await monitorJob(latest, { openProgress: true });
        } catch (error) {
          if (!cancelled) console.warn('Falha ao retomar acompanhamento da sincronizacao:', error);
        }
      })
      .catch((error) => {
        if (!cancelled) console.warn('Falha ao consultar sincronizacoes ativas:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [connectionId, monitorJob, userId]);

  const syncData = useCallback(async () => {
    if (!userId) {
      toast({
        title: 'Erro',
        description: 'Sessao expirada. Faca login novamente.',
        variant: 'destructive',
      });
      return;
    }
    if (!connectionId) {
      toast({
        title: 'Conexao Moodle necessaria',
        description: 'Selecione uma conexao Moodle antes de sincronizar.',
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
      const availableCourses = await listAvailableMoodleCourses(connectionId);
      setCourses(availableCourses);
      if (availableCourses.length > 0) {
        setShowCourseSelector(true);
      } else {
        toast({
          title: 'Nenhum curso encontrado',
          description: 'Nao foram encontrados cursos no Moodle.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Erro ao buscar cursos',
        description: error instanceof Error ? error.message : 'Nao foi possivel obter cursos do Moodle.',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  }, [connectionId, courses.length, userId]);

  const syncSelectedCourses = useCallback(async (courseIds: string[]) => {
    if (courseIds.length === 0 || !connectionId) return;

    await trackActivity({
      label: 'Sincronizando dados do Moodle',
      description: `${courseIds.length} curso(s) em processamento pelo servidor`,
      source: 'sync',
    }, async () => {
      setSyncProgress({
        isOpen: true,
        steps: INITIAL_SYNC_STEPS.map((step) => ({ ...step })),
        currentStep: null,
        isComplete: false,
      });
      setIsSyncing(true);
      void trackEvent('sync_start', { metadata: { courseCount: courseIds.length } });

      try {
        const started = await startInitialMoodleSync(connectionId, courseIds);
        const finalJob = await monitorJob(started.job);
        const summary = summaryFromJob(finalJob);

        if (finalJob.status === 'completed') {
          toast({
            title: 'Sincronizacao inicial concluida',
            description: `${courseIds.length} cursos e ${summary.students} alunos sincronizados pelo servidor.`,
          });
          void trackEvent('sync_finish', {
            metadata: { courses: courseIds.length, ...summary },
          });
        } else {
          toast({
            title: 'Sincronizacao concluida com erros',
            description: finalJob.errorMessage ?? 'Consulte o painel de jobs para ver os detalhes.',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('Sync error:', error);
        setIsSyncing(false);
        setSyncProgress((previous) => ({ ...previous, isComplete: true }));
        toast({
          title: 'Erro na sincronizacao',
          description: error instanceof Error ? error.message : 'Nao foi possivel iniciar a sincronizacao.',
          variant: 'destructive',
        });
        void trackEvent('sync_error');
        void logError('Erro na sincronizacao com Moodle', {
          category: 'integration',
          payload: { message: error instanceof Error ? error.message : String(error) },
        });
      }
    });
  }, [connectionId, monitorJob, trackActivity]);

  const syncEntitiesIncremental = useCallback(async (
    courseIds: string[],
    entities: CourseScopedSyncEntity[],
    labels?: { successTitle?: string; emptyMessage?: string; silent?: boolean },
  ): Promise<ScopedSyncSummary | null> => {
    if (!connectionId) {
      toast({
        title: 'Conexao Moodle necessaria',
        description: 'Selecione uma conexao Moodle antes de sincronizar.',
        variant: 'destructive',
      });
      return null;
    }
    if (courseIds.length === 0) {
      toast({
        title: 'Nenhum curso selecionado',
        description: labels?.emptyMessage || 'Selecione ao menos um curso para sincronizar.',
        variant: 'destructive',
      });
      return null;
    }

    return await trackActivity({
      label: labels?.successTitle || 'Sincronizacao incremental',
      description: `${courseIds.length} curso(s) em atualizacao pelo servidor`,
      source: 'sync',
    }, async () => {
      setIsSyncing(true);
      try {
        const started = await startCourseMoodleSync(connectionId, courseIds, entities);
        const finalJob = await monitorJob(started.job, { openProgress: !labels?.silent });
        const summary = summaryFromJob(finalJob);

        if (finalJob.status !== 'completed') {
          throw new Error(finalJob.errorMessage ?? 'A sincronizacao foi concluida com erros.');
        }

        if (!labels?.silent) {
          const parts: string[] = [];
          if (entities.includes('students')) parts.push(`${summary.students} alunos`);
          if (entities.includes('activities')) parts.push(`${summary.activities} atividades`);
          if (entities.includes('grades')) parts.push(`${summary.grades} notas`);
          toast({
            title: labels?.successTitle || 'Sincronizacao incremental concluida',
            description: `${courseIds.length} curso(s): ${parts.join(', ')} atualizados.`,
          });
        }
        return summary;
      } catch (error) {
        console.error('Incremental sync error:', error);
        setIsSyncing(false);
        if (!labels?.silent) {
          toast({
            title: 'Erro na sincronizacao incremental',
            description: error instanceof Error ? error.message : 'Nao foi possivel atualizar os dados solicitados.',
            variant: 'destructive',
          });
        }
        return null;
      }
    });
  }, [connectionId, monitorJob, trackActivity]);

  const syncStudentsIncremental = useCallback(async (courseIds: string[]) => {
    await syncEntitiesIncremental(courseIds, ['students'], {
      successTitle: 'Alunos sincronizados',
      emptyMessage: 'Nao ha cursos elegiveis para sincronizar alunos.',
    });
  }, [syncEntitiesIncremental]);

  const syncCourseIncremental = useCallback(async (
    courseId: string,
    entities: CourseScopedSyncEntity[] = ['students', 'activities', 'grades'],
    options?: { silent?: boolean; successTitle?: string },
  ) => {
    await syncEntitiesIncremental([courseId], entities, {
      successTitle: options?.successTitle || 'Unidade curricular sincronizada',
      emptyMessage: 'Nao foi possivel encontrar a unidade curricular selecionada.',
      silent: options?.silent,
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
