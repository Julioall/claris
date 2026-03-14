import { Link } from 'react-router-dom';
import { 
  Users, 
  AlertTriangle, 
  ClipboardList, 
  Calendar,
  Clock,
  StarOff,
  CalendarCheck2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { CourseLifecycleBadge } from './CourseLifecycleBadge';
import { getCourseEffectiveEndDate } from '@/lib/course-dates';

interface CourseWithStats {
  id: string;
  name: string;
  short_name?: string;
  category?: string;
  start_date?: string;
  end_date?: string;
  effective_end_date?: string;
  last_sync?: string;
  students_count: number;
  at_risk_count: number;
  pending_tasks_count: number;
  is_attendance_enabled?: boolean;
}

interface MyCourseCardProps {
  course: CourseWithStats;
  onUnfollow?: (courseId: string) => void;
  onToggleAttendance?: (courseId: string) => void;
}

export function MyCourseCard({ course, onUnfollow, onToggleAttendance }: MyCourseCardProps) {
  const formatDate = (date: string | undefined) => {
    if (!date) return '-';
    return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
  };

  const formatLastSync = (date: string | undefined) => {
    if (!date) return 'Nunca';
    return format(new Date(date), "dd/MM 'às' HH:mm", { locale: ptBR });
  };

  const handleUnfollow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onUnfollow) {
      onUnfollow(course.id);
      toast.success('Curso removido de Meus Cursos');
    }
  };

  const handleToggleAttendance = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onToggleAttendance) return;
    onToggleAttendance(course.id);
    if (course.is_attendance_enabled) {
      toast.success('Presenca desativada para o curso');
    } else {
      toast.success('Presenca ativada para o curso');
    }
  };

  return (
    <Link to={`/cursos/${course.id}`} className="block">
      <Card className="card-interactive h-full">
        <CardContent className="p-5">
          <div className="space-y-4">
            {/* Header */}
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-2">
                  <h3 className="font-semibold leading-tight line-clamp-2">
                    {course.name}
                  </h3>
                  <CourseLifecycleBadge course={course} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {onUnfollow && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={handleUnfollow}
                      title="Remover de Meus Cursos"
                    >
                      <StarOff className="h-4 w-4" />
                    </Button>
                  )}
                  {onToggleAttendance && (
                    <Button
                      variant={course.is_attendance_enabled ? "default" : "ghost"}
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleToggleAttendance}
                      title={course.is_attendance_enabled ? "Desativar presenca" : "Ativar presenca"}
                    >
                      <CalendarCheck2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 py-3 border-y">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                </div>
                <p className="text-lg font-semibold">{course.students_count || 0}</p>
                <p className="text-xs text-muted-foreground">Alunos</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-risk-risco">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </div>
                <p className="text-lg font-semibold">{course.at_risk_count || 0}</p>
                <p className="text-xs text-muted-foreground">Em risco</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-status-pending">
                  <ClipboardList className="h-3.5 w-3.5" />
                </div>
                <p className="text-lg font-semibold">{course.pending_tasks_count || 0}</p>
                <p className="text-xs text-muted-foreground">Pendências</p>
              </div>
            </div>

            {/* Dates */}
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span>Início: {formatDate(course.start_date)}</span>
                <span>•</span>
                <span>Fim: {formatDate(getCourseEffectiveEndDate(course) || undefined)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                <span>Sincronizado: {formatLastSync(course.last_sync)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
