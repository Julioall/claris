import { cn } from '@/lib/utils';
import { TaskStatus } from '@/types';

interface StatusBadgeProps {
  status: TaskStatus;
  size?: 'sm' | 'md';
  className?: string;
}

const statusConfig: Record<TaskStatus, { label: string; className: string }> = {
  aberta: { label: 'Aberta', className: 'bg-status-pending-bg text-status-pending' },
  em_andamento: { label: 'Em andamento', className: 'bg-status-warning-bg text-status-warning' },
  resolvida: { label: 'Resolvida', className: 'bg-status-success-bg text-status-success' },
};

export function StatusBadge({ status, size = 'md', className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded font-medium',
        config.className,
        size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-1',
        className
      )}
    >
      {config.label}
    </span>
  );
}
