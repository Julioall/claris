import { useBackgroundActivity } from '@/contexts/BackgroundActivityContext';

export function GlobalBackgroundActivityBar() {
  const { activeCount, currentActivity, hasActiveActivities } = useBackgroundActivity();
  const activityLabel = currentActivity?.label || 'Atividade em andamento';
  const liveMessage = activeCount > 1
    ? `${activeCount} atividades em andamento. ${activityLabel}.`
    : `${activityLabel}.`;

  return (
    <div
      aria-live={hasActiveActivities ? 'polite' : 'off'}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-0.5 overflow-hidden"
      role={hasActiveActivities ? 'status' : undefined}
    >
      {hasActiveActivities ? <span className="sr-only">{liveMessage}</span> : null}
      <div className="absolute inset-0 bg-primary/12" />
      {hasActiveActivities ? (
        <div className="background-activity-line absolute inset-y-0 left-0 w-28 bg-primary shadow-[0_0_14px_hsl(var(--primary)/0.45)] sm:w-40" />
      ) : (
        <div className="absolute inset-y-0 left-0 right-0 bg-primary/20" />
      )}
    </div>
  );
}
