import { cn } from '@/lib/utils';
import { RiskLevel } from '@/types';
import { getRiskLevelLabel } from '@/lib/mock-data';

interface RiskBadgeProps {
  level: RiskLevel;
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
  className?: string;
}

export function RiskBadge({ level, size = 'md', showDot = true, className }: RiskBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-2.5 py-1',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md font-medium border',
        `risk-${level}`,
        sizeClasses[size],
        className
      )}
    >
      {showDot && (
        <span 
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            level === 'normal' && 'bg-risk-normal',
            level === 'atencao' && 'bg-risk-atencao',
            level === 'risco' && 'bg-risk-risco',
            level === 'critico' && 'bg-risk-critico animate-pulse-soft',
            level === 'inativo' && 'bg-muted-foreground',
          )}
        />
      )}
      {getRiskLevelLabel(level)}
    </span>
  );
}
