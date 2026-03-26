import { TASK_STATUS_LABELS } from '@/lib/tasks';
import { cn } from '@/lib/utils';
import type { TaskStatus } from '@/features/tasks/types';

interface StatusBadgeProps {
  status: TaskStatus;
  size?: 'sm' | 'md';
  className?: string;
}

const statusStyles: Record<TaskStatus, string> = {
  todo: 'bg-card border border-l-2 border-status-pending/30 border-l-status-pending text-status-pending',
  in_progress: 'bg-card border border-l-2 border-status-warning/30 border-l-status-warning text-status-warning',
  done: 'bg-card border border-l-2 border-status-success/30 border-l-status-success text-status-success',
};

export function StatusBadge({ status, size = 'md', className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded font-medium',
        statusStyles[status],
        size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1',
        className,
      )}
    >
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}
