import { Link } from 'react-router-dom';
import { 
  BookOpen, 
  Users, 
  AlertTriangle, 
  ClipboardList, 
  Calendar,
  Clock,
  ExternalLink,
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { mockCourses } from '@/lib/mock-data';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';

export default function Courses() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCourses = mockCourses.filter(course =>
    course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    course.short_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (date: string | undefined) => {
    if (!date) return '-';
    return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
  };

  const formatLastSync = (date: string | undefined) => {
    if (!date) return 'Nunca';
    return format(new Date(date), "dd/MM 'às' HH:mm", { locale: ptBR });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cursos</h1>
          <p className="text-muted-foreground">
            {mockCourses.length} cursos vinculados à sua conta
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar curso..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Courses grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredCourses.map((course) => (
          <Card key={course.id} className="card-interactive">
            <CardContent className="p-5">
              <div className="space-y-4">
                {/* Header */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight line-clamp-2">
                      {course.name}
                    </h3>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {course.short_name}
                    </Badge>
                  </div>
                  {course.category && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {course.category}
                    </p>
                  )}
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
        ))}
      </div>

      {filteredCourses.length === 0 && (
        <div className="text-center py-12">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">Nenhum curso encontrado</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {searchQuery 
              ? 'Tente uma busca diferente'
              : 'Sincronize com o Moodle para carregar seus cursos'
            }
          </p>
        </div>
      )}
    </div>
  );
}
