import { 
  Building2, 
  Search
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { useAllCoursesData } from '@/hooks/useAllCoursesData';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { SchoolHierarchy } from '@/components/schools/SchoolHierarchy';

export default function Schools() {
  const [searchQuery, setSearchQuery] = useState('');
  const { courses, isLoading, error, toggleFollow, toggleIgnore, toggleIgnoreMultiple, toggleAttendance, toggleAttendanceMultiple } = useAllCoursesData();
  const { isEditMode } = useAuth();

  const filteredCourses = courses.filter(course =>
    course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    course.short_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    course.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="h-8 w-8" />
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
        <SchoolHierarchy 
          courses={filteredCourses} 
          onToggleFollow={isEditMode ? toggleFollow : undefined}
          onToggleIgnore={isEditMode ? toggleIgnore : undefined}
          onToggleIgnoreMultiple={isEditMode ? toggleIgnoreMultiple : undefined}
          onToggleAttendance={isEditMode ? toggleAttendance : undefined}
          onToggleAttendanceMultiple={isEditMode ? toggleAttendanceMultiple : undefined}
        />
      ) : (
        <div className="text-center py-12">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">Nenhum curso encontrado</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {searchQuery 
              ? 'Tente uma busca diferente'
              : 'Use o botão de sincronização na barra superior para carregar os cursos'
            }
          </p>
        </div>
      )}
    </div>
  );
}
