import { Link } from 'react-router-dom';
import {
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  FileText,
  MessageSquare,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ActivityFeedItem } from '@/features/dashboard/types';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ActivityFeedProps {
  items: ActivityFeedItem[];
}

const eventIcons: Record<string, { icon: typeof Activity; className: string }> = {
  action_completed: { icon: CheckCircle2, className: 'text-status-success bg-status-success-bg' },
  risk_change: { icon: AlertTriangle, className: 'text-risk-risco bg-risk-risco-bg' },
  note_created: { icon: MessageSquare, className: 'text-primary bg-accent' },
  task_resolved: { icon: CheckCircle2, className: 'text-status-success bg-status-success-bg' },
  task_created: { icon: FileText, className: 'text-status-pending bg-status-pending-bg' },
};

export function ActivityFeed({ items }: ActivityFeedProps) {
  const getEventConfig = (eventType: string) => {
    return eventIcons[eventType] || { icon: Activity, className: 'text-muted-foreground bg-muted' };
  };

  const formatTime = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Atividade Recente
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {items.map((item, index) => {
            const config = getEventConfig(item.event_type);
            const Icon = config.icon;
            
            return (
              <div key={item.id} className="relative">
                {/* Timeline connector */}
                {index < items.length - 1 && (
                  <div className="absolute left-4 top-10 -bottom-1 w-0.5 bg-border" />
                )}
                
                <div className="flex gap-3 py-2">
                  <div className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                    config.className
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {item.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {formatTime(item.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {items.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma atividade recente</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
