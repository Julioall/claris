import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit2, Trash2, Clock, Video, Users, AlignLeft, PackageCheck, GraduationCap, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CalendarEvent, CalendarEventType } from '@/types';
import { format, parseISO, isToday, isTomorrow, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TYPE_CONFIG: Record<CalendarEventType, { label: string; icon: React.ElementType; color: string }> = {
  manual: { label: 'Geral', icon: AlignLeft, color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  webclass: { label: 'WebAula', icon: Video, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  meeting: { label: 'Reunião', icon: Users, color: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300' },
  alignment: { label: 'Alinhamento', icon: Users, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  delivery: { label: 'Entrega', icon: PackageCheck, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  training: { label: 'Treinamento', icon: GraduationCap, color: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900 dark:text-fuchsia-300' },
  other: { label: 'Outro', icon: HelpCircle, color: 'bg-muted text-muted-foreground' },
};

function formatEventDate(start: string): string {
  const d = parseISO(start);
  if (isToday(d)) return `Hoje · ${format(d, 'HH:mm')}`;
  if (isTomorrow(d)) return `Amanhã · ${format(d, 'HH:mm')}`;
  return format(d, "d MMM yyyy 'às' HH:mm", { locale: ptBR });
}

interface CalendarEventCardProps {
  event: CalendarEvent;
  onEdit?: (event: CalendarEvent) => void;
  onDelete?: (id: string) => void;
}

export function CalendarEventCard({ event, onEdit, onDelete }: CalendarEventCardProps) {
  const config = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.other;
  const Icon = config.icon;
  const isOver = isPast(parseISO(event.end_at ?? event.start_at));

  return (
    <div className={cn('group flex items-start gap-4 rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md', isOver && 'opacity-60')}>
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', config.color)}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm leading-snug">{event.title}</p>
          <Badge variant="outline" className={cn('text-[11px] shrink-0', config.color)}>
            {config.label}
          </Badge>
        </div>

        {event.description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{event.description}</p>
        )}

        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatEventDate(event.start_at)}
          </span>
          {event.end_at && (
            <span>→ {format(parseISO(event.end_at), 'HH:mm')}</span>
          )}
          {event.external_source !== 'manual' && (
            <Badge variant="secondary" className="text-[10px]">
              {event.external_source}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onEdit && (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(event)}>
            <Edit2 className="h-3.5 w-3.5" />
            <span className="sr-only">Editar</span>
          </Button>
        )}
        {onDelete && (
          <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive" onClick={() => onDelete(event.id)}>
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only">Remover</span>
          </Button>
        )}
      </div>
    </div>
  );
}
