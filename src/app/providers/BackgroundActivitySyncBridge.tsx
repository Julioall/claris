import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { useBackgroundActivity } from '@/contexts/BackgroundActivityContext';
import { listActiveBulkMessageJobsForUser } from '@/features/messages/api/bulk-messaging.repository';
import { listActiveActivityGradeSuggestionJobsForUser } from '@/features/students/api/gradeSuggestions';

const BULK_MESSAGE_ACTIVITY_PREFIX = 'background-job:bulk-message:';
const AI_GRADING_ACTIVITY_PREFIX = 'background-job:ai-grading:';

export function BackgroundActivitySyncBridge() {
  const { user } = useAuth();
  const { activities, finishActivity, upsertActivity } = useBackgroundActivity();
  const activitiesRef = useRef(activities);

  const { data: activeBulkJobs = [] } = useQuery({
    queryKey: ['background-activity', 'bulk-message-jobs', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return await listActiveBulkMessageJobsForUser(user.id);
    },
    enabled: !!user?.id,
    refetchInterval: 8000,
  });

  const { data: activeAiGradeSuggestionJobs = [] } = useQuery({
    queryKey: ['background-activity', 'ai-grade-suggestion-jobs', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return await listActiveActivityGradeSuggestionJobsForUser(user.id);
    },
    enabled: !!user?.id,
    refetchInterval: 8000,
  });

  useEffect(() => {
    activitiesRef.current = activities;
  }, [activities]);

  useEffect(() => {
    const activeIds = new Set<string>();

    activeBulkJobs.forEach((job) => {
      const id = `${BULK_MESSAGE_ACTIVITY_PREFIX}${job.id}`;
      activeIds.add(id);

      upsertActivity({
        id,
        label: 'Envio em massa em andamento',
        description: `${job.sent_count}/${job.total_recipients} enviados`,
        source: 'messages',
      });
    });

    activitiesRef.current.forEach((activity) => {
      if (activity.id.startsWith(BULK_MESSAGE_ACTIVITY_PREFIX) && !activeIds.has(activity.id)) {
        finishActivity(activity.id);
      }
    });
  }, [activeBulkJobs, finishActivity, upsertActivity]);

  useEffect(() => {
    const activeIds = new Set<string>();

    activeAiGradeSuggestionJobs.forEach((job) => {
      const id = `${AI_GRADING_ACTIVITY_PREFIX}${job.jobId}`;
      activeIds.add(id);

      upsertActivity({
        id,
        label: 'Correcoes por IA em lote',
        description: job.totalItems > 0
          ? `${job.activityName} (${job.processedItems}/${job.totalItems})`
          : job.activityName,
        source: 'ai-grading',
      });
    });

    activitiesRef.current.forEach((activity) => {
      if (activity.id.startsWith(AI_GRADING_ACTIVITY_PREFIX) && !activeIds.has(activity.id)) {
        finishActivity(activity.id);
      }
    });
  }, [activeAiGradeSuggestionJobs, finishActivity, upsertActivity]);

  useEffect(() => {
    if (user?.id) return;

    activitiesRef.current.forEach((activity) => {
      if (
        activity.id.startsWith(BULK_MESSAGE_ACTIVITY_PREFIX) ||
        activity.id.startsWith(AI_GRADING_ACTIVITY_PREFIX)
      ) {
        finishActivity(activity.id);
      }
    });
  }, [finishActivity, user?.id]);

  useEffect(() => () => {
    activitiesRef.current.forEach((activity) => {
      if (
        activity.id.startsWith(BULK_MESSAGE_ACTIVITY_PREFIX) ||
        activity.id.startsWith(AI_GRADING_ACTIVITY_PREFIX)
      ) {
        finishActivity(activity.id);
      }
    });
  }, [finishActivity]);

  return null;
}
