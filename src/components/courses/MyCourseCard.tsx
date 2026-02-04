import { Link } from 'react-router-dom';
import { 
  Users, 
  AlertTriangle, 
  ClipboardList, 
  Calendar,
  Clock,
  ExternalLink,
  StarOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
}

interface MyCourseCardProps {
  course: CourseWithStats;
  onUnfollow?: (courseId: string) => void;
}

export function MyCourseCard({ course, onUnfollow }: MyCourseCardProps) {
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

  return (
    <Card className="card-interactive">
      <CardContent className="p-5">
        <div className="space-y-4">
          {/* Header */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold leading-tight line-clamp-2">
                {course.name}
              </h3>
              <div className="flex items-center gap-1 shrink-0">
                {course.short_name && (
                  <Badge variant="secondary" className="text-xs">
                    {course.short_name}
                  </Badge>
                )}
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
              <span>Fim: {formatDate(course.end_date)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3" />
              <span>Sincronizado: {formatLastSync(course.last_sync)}</span>
            </div>
          </div>

          {/* Action */}
          <Button asChild className="w-full">
            <Link to={`/cursos/${course.id}`}>
              Ver painel do curso
              <ExternalLink className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
