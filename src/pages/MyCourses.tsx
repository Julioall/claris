import { 
  BookOpen, 
  Search,
  Loader2,
  Building2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAllCoursesData } from '@/hooks/useAllCoursesData';
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CategoryHierarchy } from '@/components/courses/CategoryHierarchy';
import { useAuth } from '@/contexts/AuthContext';

export default function MyCourses() {
  const [searchQuery, setSearchQuery] = useState('');
  const { isEditMode } = useAuth();
  const { courses, isLoading, error, toggleFollow, unfollowMultiple } = useAllCoursesData();

  // Filter only followed courses that are active (end_date is null or in the future)
  const followedCourses = useMemo(() => {
    return courses.filter(course => {
      if (!course.is_following) return false;
      if (!course.end_date) return true;
      return new Date(course.end_date) >= new Date();
    });
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
          <h1 className="text-2xl font-bold tracking-tight">Meus Cursos</h1>
          <p className="text-muted-foreground">
            {followedCourses.length} cursos em acompanhamento
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Link to Schools catalog */}
          <Button variant="outline" size="sm" asChild>
            <Link to="/escolas">
              <Building2 className="h-4 w-4 mr-2" />
              Explorar Catálogo
            </Link>
          </Button>

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
