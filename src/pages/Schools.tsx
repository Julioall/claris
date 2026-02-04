import { 
  Building2, 
  Search,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAllCoursesData } from '@/hooks/useAllCoursesData';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { SchoolHierarchy } from '@/components/schools/SchoolHierarchy';

export default function Schools() {
  const [searchQuery, setSearchQuery] = useState('');
  const { courses, isLoading, error, toggleFollow } = useAllCoursesData();
  const { isLoading: isSyncing, setShowCourseSelector } = useAuth();

  const filteredCourses = courses.filter(course =>
    course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    course.short_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    course.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Escolas</h1>
          <p className="text-muted-foreground">
            Catálogo completo com {courses.length} cursos disponíveis
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sync button */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowCourseSelector(true)}
            disabled={isSyncing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            Sincronizar
          </Button>

          {/* Search */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar escola, curso ou disciplina..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
          {error}
        </div>
      )}

      {/* Schools hierarchy */}
      {filteredCourses.length > 0 ? (
        <SchoolHierarchy courses={filteredCourses} onToggleFollow={toggleFollow} />
      ) : (
        <div className="text-center py-12">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">Nenhum curso encontrado</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {searchQuery 
              ? 'Tente uma busca diferente'
              : 'Sincronize com o Moodle para carregar os cursos'
            }
          </p>
          {!searchQuery && (
            <Button onClick={() => setShowCourseSelector(true)} className="mt-4" disabled={isSyncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              Sincronizar agora
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
