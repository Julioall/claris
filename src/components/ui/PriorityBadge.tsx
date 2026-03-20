import { TASK_PRIORITY_LABELS } from '@/lib/tasks';
import { cn } from '@/lib/utils';
import type { TaskPriority } from '@/types';

interface PriorityBadgeProps {
  priority: TaskPriority;
  size?: 'sm' | 'md';
  className?: string;
}

const priorityStyles: Record<TaskPriority, string> = {
  low: 'priority-baixa bg-muted',
  medium: 'priority-media bg-status-pending-bg',
  high: 'priority-alta bg-risk-risco-bg',
  urgent: 'priority-urgente bg-risk-critico-bg',
};

export function PriorityBadge({ priority, size = 'md', className }: PriorityBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded font-medium',
        priorityStyles[priority],
        size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1',
        className,
      )}
    >
      {TASK_PRIORITY_LABELS[priority]}
    </span>
  );
}
