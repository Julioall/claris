import { cn } from '@/lib/utils';
import { TaskStatus } from '@/types';

interface StatusBadgeProps {
  status: TaskStatus;
  size?: 'sm' | 'md';
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  aberta: { label: 'Aberta', className: 'bg-card border border-l-2 border-status-pending/30 border-l-status-pending text-status-pending' },
  todo: { label: 'Aberta', className: 'bg-card border border-l-2 border-status-pending/30 border-l-status-pending text-status-pending' },
  em_andamento: { label: 'Em andamento', className: 'bg-card border border-l-2 border-status-warning/30 border-l-status-warning text-status-warning' },
  in_progress: { label: 'Em andamento', className: 'bg-card border border-l-2 border-status-warning/30 border-l-status-warning text-status-warning' },
  resolvida: { label: 'Resolvida', className: 'bg-card border border-l-2 border-status-success/30 border-l-status-success text-status-success' },
  done: { label: 'Resolvida', className: 'bg-card border border-l-2 border-status-success/30 border-l-status-success text-status-success' },
};

export function StatusBadge({ status, size = 'md', className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.aberta;

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
