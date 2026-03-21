import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit2, Trash2, Clock } from 'lucide-react';
import type { CalendarEvent } from '@/features/agenda/types';
import { cn } from '@/lib/utils';
import { format, parseISO, isToday, isTomorrow, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CALENDAR_EVENT_APPEARANCE } from './agenda-item-appearance';

function formatEventDate(start: string): string {
  const parsedDate = parseISO(start);
  if (isToday(parsedDate)) return `Hoje · ${format(parsedDate, 'HH:mm')}`;
  if (isTomorrow(parsedDate)) return `Amanha · ${format(parsedDate, 'HH:mm')}`;
  return format(parsedDate, "d MMM yyyy 'as' HH:mm", { locale: ptBR });
}

interface CalendarEventCardProps {
  event: CalendarEvent;
  onEdit?: (event: CalendarEvent) => void;
  onDelete?: (id: string) => void;
}

export function CalendarEventCard({ event, onEdit, onDelete }: CalendarEventCardProps) {
  const config = CALENDAR_EVENT_APPEARANCE[event.type] ?? CALENDAR_EVENT_APPEARANCE.other;
  const Icon = config.icon;
  const isOver = isPast(parseISO(event.end_at ?? event.start_at));

  return (
    <div className={cn('group flex items-start gap-4 rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md', isOver && 'opacity-60')}>
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border', config.tone)}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug">{event.title}</p>
          <Badge variant="outline" className={cn('shrink-0 text-[11px]', config.tone)}>
            {config.label}
          </Badge>
        </div>

        {event.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{event.description}</p>
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

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
