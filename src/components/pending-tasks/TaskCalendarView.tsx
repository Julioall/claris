import React, { useMemo } from 'react';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  isSameDay, isSameMonth, isToday, startOfWeek, endOfWeek,
  isPast, addMonths, subMonths
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface CalendarTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date?: string;
  student?: { full_name: string } | null;
  course?: { short_name: string } | null;
}

interface TaskCalendarViewProps {
  tasks: CalendarTask[];
  onTaskClick?: (taskId: string) => void;
}

const priorityColors: Record<string, string> = {
  urgente: 'bg-red-500',
  alta: 'bg-orange-500',
  media: 'bg-blue-500',
  baixa: 'bg-gray-400',
};

export function TaskCalendarView({ tasks, onTaskClick }: TaskCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = React.useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { locale: ptBR });
  const calendarEnd = endOfWeek(monthEnd, { locale: ptBR });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const tasksByDate = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    tasks
      .filter(t => t.due_date)
      .forEach(t => {
        const key = format(new Date(t.due_date!), 'yyyy-MM-dd');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      });
    return map;
  }, [tasks]);

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-semibold capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {/* Header */}
        {weekDays.map(day => (
          <div key={day} className="bg-muted p-2 text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}

        {/* Days */}
        {days.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayTasks = tasksByDate.get(dateKey) || [];
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isCurrentDay = isToday(day);
          const hasOverdue = dayTasks.some(t => t.status !== 'resolvida' && isPast(new Date(t.due_date!)));

          return (
            <div
              key={dateKey}
              className={cn(
                "bg-background min-h-[80px] p-1 transition-colors",
                !isCurrentMonth && "opacity-40",
                isCurrentDay && "ring-2 ring-primary ring-inset",
              )}
            >
              <div className={cn(
                "text-xs font-medium mb-1 px-1",
                isCurrentDay && "text-primary font-bold",
                hasOverdue && "text-destructive"
              )}>
                {format(day, 'd')}
              </div>
              
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map(task => (
                  <Popover key={task.id}>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(
                          "w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate block",
                          task.status === 'resolvida'
                            ? "bg-muted text-muted-foreground line-through"
                            : "bg-primary/10 text-primary hover:bg-primary/20"
                        )}
                        onClick={() => onTaskClick?.(task.id)}
                      >
                        <span className={cn(
                          "inline-block w-1.5 h-1.5 rounded-full mr-1 shrink-0",
                          priorityColors[task.priority] || 'bg-gray-400'
                        )} />
                        {task.title}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" side="right">
                      <div className="space-y-2">
                        <p className="font-medium text-sm">{task.title}</p>
                        {task.student && (
                          <p className="text-xs text-muted-foreground">
                            Aluno: {task.student.full_name}
                          </p>
                        )}
                        {task.course && (
                          <p className="text-xs text-muted-foreground">
                            Curso: {task.course.short_name}
                          </p>
                        )}
                        <div className="flex gap-1">
                          <Badge variant={task.status === 'resolvida' ? 'secondary' : 'default'} className="text-[10px]">
                            {task.status}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {task.priority}
                          </Badge>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                ))}
                {dayTasks.length > 3 && (
                  <p className="text-[10px] text-muted-foreground px-1">
                    +{dayTasks.length - 3} mais
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Urgente
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-orange-500" /> Alta
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" /> Média
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-400" /> Baixa
        </div>
      </div>
    </div>
  );
}
