import { useState } from 'react';
import { Building2, Search } from 'lucide-react';

import { SchoolHierarchy } from '@/components/schools/SchoolHierarchy';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';

import { useAllCoursesData } from '../hooks/useAllCoursesData';

export default function SchoolsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const { isEditMode } = useAuth();
  const {
    courses,
    isLoading,
    error,
    toggleFollow,
    toggleIgnore,
    toggleIgnoreMultiple,
    toggleAttendance,
    toggleAttendanceMultiple,
  } = useAllCoursesData();

  const syncedCourses = courses.filter((course) => course.is_following);

  const filteredCourses = syncedCourses.filter((course) =>
    course.name.toLowerCase().includes(searchQuery.toLowerCase())
    || course.short_name?.toLowerCase().includes(searchQuery.toLowerCase())
    || course.category?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Escolas</h1>
          <p className="text-muted-foreground">
            Listando {syncedCourses.length} cursos sincronizados
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar escola, curso ou disciplina..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

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
        <div className="py-12 text-center">
          <Building2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium">Nenhum curso encontrado</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {searchQuery
              ? 'Tente uma busca diferente'
              : 'Use os fluxos de sincronizacao incremental para carregar os cursos'}
          </p>
        </div>
      )}
    </div>
  );
}
