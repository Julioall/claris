import { 
  BookOpen, 
  Search
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { useAllCoursesData } from '@/hooks/useAllCoursesData';
import { useState, useMemo } from 'react';
import { CategoryHierarchy } from '@/components/courses/CategoryHierarchy';
import { useAuth } from '@/contexts/AuthContext';

export default function MyCourses() {
  const [searchQuery, setSearchQuery] = useState('');
  const { isEditMode } = useAuth();
  const { courses, isLoading, error, toggleFollow, unfollowMultiple, toggleAttendance, toggleAttendanceMultiple } = useAllCoursesData();

  const followedCourses = useMemo(() => {
    return courses.filter(course => course.is_following);
  }, [courses]);

  const filteredCourses = followedCourses.filter(course =>
    course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    course.short_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    course.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleUnfollow = (courseId: string) => {
    toggleFollow(courseId);
  };

  const handleUnfollowMultiple = (courseIds: string[]) => {
    unfollowMultiple(courseIds);
  };

  const handleToggleAttendance = (courseId: string) => {
    toggleAttendance(courseId);
  };

  const handleToggleAttendanceMultiple = (courseIds: string[], shouldEnable: boolean) => {
    toggleAttendanceMultiple(courseIds, shouldEnable);
  };

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
          <h1 className="text-2xl font-bold tracking-tight">Meus Cursos</h1>
          <p className="text-muted-foreground">
            {followedCourses.length} cursos em acompanhamento
          </p>
        </div>

        <div className="flex items-center gap-2">
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
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
          {error}
        </div>
      )}

      {/* Courses hierarchy */}
      {filteredCourses.length > 0 ? (
        <CategoryHierarchy 
          courses={filteredCourses}
          onUnfollow={isEditMode ? handleUnfollow : undefined}
          onUnfollowMultiple={isEditMode ? handleUnfollowMultiple : undefined}
          onToggleAttendance={isEditMode ? handleToggleAttendance : undefined}
          onToggleAttendanceMultiple={isEditMode ? handleToggleAttendanceMultiple : undefined}
        />
      ) : (
        <div className="text-center py-12">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">Nenhum curso em acompanhamento</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {searchQuery 
              ? 'Tente uma busca diferente'
              : 'Adicione cursos a partir do catálogo de Escolas'
            }
          </p>
        </div>
      )}
    </div>
  );
}
