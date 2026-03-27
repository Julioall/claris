import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { useBackgroundActivity } from '@/contexts/BackgroundActivityContext';
import { listActiveBackgroundJobsForUser } from '@/features/background-jobs/api/backgroundJobs.repository';

const BACKGROUND_JOB_ACTIVITY_PREFIX = 'background-job:';

function shouldHideFromBackgroundActivity(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }

  return (metadata as { background_activity_visibility?: unknown }).background_activity_visibility === 'hidden';
}

function buildActivityDescription(job: {
  description: string | null;
  processed_items: number;
  total_items: number;
  source: string;
}) {
  if (job.source === 'messages' && job.total_items > 0) {
    return `${job.processed_items}/${job.total_items} destinatario(s) processados`;
  }

  if (job.total_items > 0 && job.description) {
    return `${job.description} (${job.processed_items}/${job.total_items})`;
  }

  if (job.total_items > 0) {
    return `${job.processed_items}/${job.total_items} item(ns) processados`;
  }

  return job.description;
}

export function BackgroundActivitySyncBridge() {
  const { user } = useAuth();
  const { activities, finishActivity, upsertActivity } = useBackgroundActivity();
  const activitiesRef = useRef(activities);

  const clearManagedActivities = useCallback((prefixes: string[]) => {
    activitiesRef.current.forEach((activity) => {
      if (prefixes.some((prefix) => activity.id.startsWith(prefix))) {
        finishActivity(activity.id);
      }
    });
  }, [finishActivity]);

  const backgroundJobsQuery = useQuery({
    queryKey: ['background-activity', 'jobs', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return await listActiveBackgroundJobsForUser(user.id);
    },
    enabled: !!user?.id,
    refetchInterval: 8000,
  });

  const activeBackgroundJobs = useMemo(
    () => backgroundJobsQuery.data ?? [],
    [backgroundJobsQuery.data],
  );
  const backgroundJobsDataIsStale = (
    backgroundJobsQuery.dataUpdatedAt > 0 &&
    backgroundJobsQuery.errorUpdatedAt > backgroundJobsQuery.dataUpdatedAt
  );

  useEffect(() => {
    activitiesRef.current = activities;
  }, [activities]);

  useEffect(() => {
    if (backgroundJobsDataIsStale) {
      clearManagedActivities([BACKGROUND_JOB_ACTIVITY_PREFIX]);
      return;
    }

    const activeIds = new Set<string>();

    activeBackgroundJobs
      .filter((job) => !shouldHideFromBackgroundActivity(job.metadata))
      .forEach((job) => {
        const id = `${BACKGROUND_JOB_ACTIVITY_PREFIX}${job.id}`;
        activeIds.add(id);

        upsertActivity({
          id,
          label: job.title,
          description: buildActivityDescription(job),
          source: job.source,
        });
      });

    activitiesRef.current.forEach((activity) => {
      if (activity.id.startsWith(BACKGROUND_JOB_ACTIVITY_PREFIX) && !activeIds.has(activity.id)) {
        finishActivity(activity.id);
      }
    });
  }, [
    activeBackgroundJobs,
    backgroundJobsDataIsStale,
    clearManagedActivities,
    finishActivity,
    upsertActivity,
  ]);

  useEffect(() => {
    if (user?.id) return;

    clearManagedActivities([BACKGROUND_JOB_ACTIVITY_PREFIX]);
  }, [clearManagedActivities, user?.id]);

  useEffect(() => () => {
    clearManagedActivities([BACKGROUND_JOB_ACTIVITY_PREFIX]);
  }, [clearManagedActivities]);

  return null;
}
