import { cn } from '@/lib/utils';
import { TaskPriority } from '@/types';

interface PriorityBadgeProps {
  priority: TaskPriority;
  size?: 'sm' | 'md';
  className?: string;
}

const priorityConfig: Record<string, { label: string; className: string }> = {
  baixa: { label: 'Baixa', className: 'priority-baixa bg-muted' },
  low: { label: 'Baixa', className: 'priority-baixa bg-muted' },
  media: { label: 'Média', className: 'priority-media bg-status-pending-bg' },
  medium: { label: 'Média', className: 'priority-media bg-status-pending-bg' },
  alta: { label: 'Alta', className: 'priority-alta bg-risk-risco-bg' },
  high: { label: 'Alta', className: 'priority-alta bg-risk-risco-bg' },
  urgente: { label: 'Urgente', className: 'priority-urgente bg-risk-critico-bg' },
  urgent: { label: 'Urgente', className: 'priority-urgente bg-risk-critico-bg' },
};

export function PriorityBadge({ priority, size = 'md', className }: PriorityBadgeProps) {
  const config = priorityConfig[priority] ?? priorityConfig.media;
  
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
