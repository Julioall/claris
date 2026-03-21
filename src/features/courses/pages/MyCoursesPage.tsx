import { useMemo, useState } from 'react';
import { BookOpen, Search } from 'lucide-react';

import { CategoryHierarchy } from '@/components/courses/CategoryHierarchy';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/AuthContext';

import { useAllCoursesData } from '../hooks/useAllCoursesData';

export default function MyCoursesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const { isEditMode } = useAuth();
  const {
    courses,
    isLoading,
    error,
    toggleFollow,
    unfollowMultiple,
    toggleAttendance,
    toggleAttendanceMultiple,
  } = useAllCoursesData();

  const followedCourses = useMemo(
    () => courses.filter((course) => course.is_following),
    [courses],
  );

  const filteredCourses = followedCourses.filter((course) =>
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
          <h1 className="text-2xl font-bold tracking-tight">Meus Cursos</h1>
          <p className="text-muted-foreground">
            {followedCourses.length} cursos em acompanhamento
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar curso..."
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
        <CategoryHierarchy
          courses={filteredCourses}
          onUnfollow={isEditMode ? toggleFollow : undefined}
          onUnfollowMultiple={isEditMode ? unfollowMultiple : undefined}
          onToggleAttendance={isEditMode ? toggleAttendance : undefined}
          onToggleAttendanceMultiple={isEditMode ? toggleAttendanceMultiple : undefined}
        />
      ) : (
        <div className="py-12 text-center">
          <BookOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium">Nenhum curso em acompanhamento</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {searchQuery
              ? 'Tente uma busca diferente'
              : 'Adicione cursos a partir do catálogo de Escolas'}
          </p>
        </div>
      )}
    </div>
  );
}
