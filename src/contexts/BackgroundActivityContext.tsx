import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export interface BackgroundActivity {
  id: string;
  label: string;
  description: string | null;
  source: string | null;
  startedAt: string;
}

export interface BackgroundActivityInput {
  id?: string;
  label: string;
  description?: string | null;
  source?: string | null;
}

interface BackgroundActivityContextValue {
  activities: BackgroundActivity[];
  activeCount: number;
  currentActivity: BackgroundActivity | null;
  hasActiveActivities: boolean;
  startActivity: (activity: BackgroundActivityInput) => string;
  upsertActivity: (activity: BackgroundActivityInput & { id: string }) => string;
  updateActivity: (id: string, updates: Partial<Omit<BackgroundActivity, 'id' | 'startedAt'>>) => void;
  finishActivity: (id: string) => void;
  trackActivity: <T>(
    activity: BackgroundActivityInput,
    work: Promise<T> | (() => Promise<T>),
  ) => Promise<T>;
}

const BackgroundActivityContext = createContext<BackgroundActivityContextValue | undefined>(undefined);

function createActivityId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `activity-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildActivity(
  input: BackgroundActivityInput & { id: string },
  previous?: BackgroundActivity,
): BackgroundActivity {
  return {
    id: input.id,
    label: input.label,
    description: input.description ?? previous?.description ?? null,
    source: input.source ?? previous?.source ?? null,
    startedAt: previous?.startedAt ?? new Date().toISOString(),
  };
}

export function BackgroundActivityProvider({ children }: { children: React.ReactNode }) {
  const [activityMap, setActivityMap] = useState<Record<string, BackgroundActivity>>({});

  const startActivity = useCallback((activity: BackgroundActivityInput) => {
    const id = activity.id?.trim() || createActivityId();

    setActivityMap((current) => ({
      ...current,
      [id]: buildActivity({ ...activity, id }, current[id]),
    }));

    return id;
  }, []);

  const upsertActivity = useCallback((activity: BackgroundActivityInput & { id: string }) => {
    const id = activity.id.trim();

    setActivityMap((current) => ({
      ...current,
      [id]: buildActivity({ ...activity, id }, current[id]),
    }));

    return id;
  }, []);

  const updateActivity = useCallback((id: string, updates: Partial<Omit<BackgroundActivity, 'id' | 'startedAt'>>) => {
    setActivityMap((current) => {
      const existing = current[id];
      if (!existing) return current;

      return {
        ...current,
        [id]: {
          ...existing,
          ...updates,
          description: updates.description ?? existing.description,
          source: updates.source ?? existing.source,
        },
      };
    });
  }, []);

  const finishActivity = useCallback((id: string) => {
    setActivityMap((current) => {
      if (!(id in current)) return current;

      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const trackActivity = useCallback<BackgroundActivityContextValue['trackActivity']>(async (activity, work) => {
    const id = startActivity(activity);

    try {
      if (typeof work === 'function') {
        return await work();
      }

      return await work;
    } finally {
      finishActivity(id);
    }
  }, [finishActivity, startActivity]);

  const activities = useMemo(
    () => Object.values(activityMap).sort((left, right) => left.startedAt.localeCompare(right.startedAt)),
    [activityMap],
  );

  const value = useMemo<BackgroundActivityContextValue>(() => ({
    activities,
    activeCount: activities.length,
    currentActivity: activities[0] ?? null,
    hasActiveActivities: activities.length > 0,
    startActivity,
    upsertActivity,
    updateActivity,
    finishActivity,
    trackActivity,
  }), [activities, finishActivity, startActivity, trackActivity, updateActivity, upsertActivity]);

  return (
    <BackgroundActivityContext.Provider value={value}>
      {children}
    </BackgroundActivityContext.Provider>
  );
}

export function useBackgroundActivity() {
  const context = useContext(BackgroundActivityContext);

  if (!context) {
    throw new Error('useBackgroundActivity must be used within a BackgroundActivityProvider');
  }

  return context;
}

export function useBackgroundActivityFlag(
  activity: BackgroundActivityInput & { id: string; active: boolean; cleanupOnUnmount?: boolean },
) {
  const { finishActivity, upsertActivity } = useBackgroundActivity();
  const cleanupOnUnmount = activity.cleanupOnUnmount ?? true;

  useEffect(() => {
    if (activity.active) {
      upsertActivity({
        id: activity.id,
        label: activity.label,
        description: activity.description,
        source: activity.source,
      });
      return;
    }

    finishActivity(activity.id);
  }, [
    activity.active,
    cleanupOnUnmount,
    activity.description,
    activity.id,
    activity.label,
    activity.source,
    finishActivity,
    upsertActivity,
  ]);

  useEffect(() => () => {
    if (!cleanupOnUnmount) {
      return;
    }

    finishActivity(activity.id);
  }, [cleanupOnUnmount, activity.id, finishActivity]);
}
