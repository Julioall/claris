import { Link } from 'react-router-dom';
import { Users, AlertTriangle, ClipboardList, Star, StarOff, EyeOff, Eye, CalendarCheck2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface CourseWithStats {
  id: string;
  name: string;
  short_name?: string;
  category?: string;
  start_date?: string;
  end_date?: string;
  last_sync?: string;
  students_count: number;
  at_risk_count: number;
  pending_tasks_count: number;
  is_following: boolean;
  is_ignored: boolean;
  is_attendance_enabled: boolean;
}

interface SchoolCourseCardProps {
  course: CourseWithStats;
  onToggleFollow?: (courseId: string) => void;
  onToggleIgnore?: (courseId: string) => void;
  onToggleAttendance?: (courseId: string) => void;
}

export function SchoolCourseCard({ course, onToggleFollow, onToggleIgnore, onToggleAttendance }: SchoolCourseCardProps) {
  const isExpired = course.end_date && new Date(course.end_date) < new Date();

  const handleToggleFollow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onToggleFollow) return;
    onToggleFollow(course.id);
    if (course.is_following) {
      toast.success('Removido dos Meus Cursos');
    } else {
      toast.success('Adicionado aos Meus Cursos');
    }
  };

  const handleToggleIgnore = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onToggleIgnore) return;
    onToggleIgnore(course.id);
    if (course.is_ignored) {
      toast.success('Curso será sincronizado');
    } else {
      toast.success('Curso ignorado na sincronização');
    }
  };

  const handleToggleAttendance = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onToggleAttendance) return;
    onToggleAttendance(course.id);
    if (course.is_attendance_enabled) {
      toast.success('Presenca desativada para este curso');
    } else {
      toast.success('Presenca ativada para este curso');
    }
  };

  const isEditMode = !!onToggleFollow || !!onToggleIgnore || !!onToggleAttendance;

  return (
    <Card className={`hover:shadow-md transition-shadow ${isExpired ? 'opacity-60' : ''} ${course.is_ignored ? 'bg-muted/50' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <Link to={`/cursos/${course.id}`}>
              <CardTitle className={`text-sm font-medium hover:text-primary transition-colors line-clamp-2 ${course.is_ignored ? 'text-muted-foreground' : ''}`}>
                {course.name}
              </CardTitle>
            </Link>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isEditMode && (
              <>
                {onToggleIgnore && (
                  <Button
                    variant={course.is_ignored ? "secondary" : "outline"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleToggleIgnore}
                    title={course.is_ignored ? "Parar de ignorar" : "Ignorar na sincronização"}
                  >
                    {course.is_ignored ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </Button>
                )}
                {onToggleFollow && (
                  <Button
                    variant={course.is_following ? "default" : "outline"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleToggleFollow}
                    title={course.is_following ? "Remover dos Meus Cursos" : "Adicionar aos Meus Cursos"}
                  >
                    {course.is_following ? (
                      <Star className="h-4 w-4 fill-current" />
                    ) : (
                      <StarOff className="h-4 w-4" />
                    )}
                  </Button>
                )}
                {onToggleAttendance && (
                  <Button
                    variant={course.is_attendance_enabled ? "default" : "outline"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleToggleAttendance}
                    title={course.is_attendance_enabled ? "Desativar controle de presenca" : "Ativar controle de presenca"}
                  >
                    <CalendarCheck2 className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {course.students_count}
          </span>
          {course.at_risk_count > 0 && (
            <span className="flex items-center gap-1 text-risk-risco">
              <AlertTriangle className="h-3.5 w-3.5" />
              {course.at_risk_count}
            </span>
          )}
          {course.pending_tasks_count > 0 && (
            <span className="flex items-center gap-1 text-status-pending">
              <ClipboardList className="h-3.5 w-3.5" />
              {course.pending_tasks_count}
            </span>
          )}
          {course.is_ignored && (
            <span className="flex items-center gap-1 text-muted-foreground/70 ml-auto">
              <EyeOff className="h-3.5 w-3.5" />
              Ignorado
            </span>
          )}
          {course.is_attendance_enabled && (
            <span className="flex items-center gap-1 text-primary">
              <CalendarCheck2 className="h-3.5 w-3.5" />
              Presenca
            </span>
          )}
        </div>
        
        {isExpired && course.end_date && (
          <p className="text-xs text-muted-foreground mt-2">
            Encerrado em {format(new Date(course.end_date), "dd/MM/yyyy", { locale: ptBR })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
