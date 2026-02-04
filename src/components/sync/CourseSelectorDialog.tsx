import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Search, RefreshCw, BookOpen, AlertCircle } from 'lucide-react';
import { Course } from '@/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CourseSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: Course[];
  onSync: (selectedCourseIds: string[] | 'all') => void;
  isLoading?: boolean;
}

// Helper to check if a course is still active (not ended)
const isCourseActive = (course: Course): boolean => {
  if (!course.end_date) return true; // No end date = always active
  const endDate = new Date(course.end_date);
  return endDate >= new Date();
};

export function CourseSelectorDialog({
  open,
  onOpenChange,
  courses,
  onSync,
  isLoading,
}: CourseSelectorDialogProps) {
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showFinished, setShowFinished] = useState(false);

  // Separate active and finished courses
  const { activeCourses, finishedCourses } = useMemo(() => {
    const active: Course[] = [];
    const finished: Course[] = [];
    
    courses.forEach(course => {
      if (isCourseActive(course)) {
        active.push(course);
      } else {
        finished.push(course);
      }
    });
    
    return { activeCourses: active, finishedCourses: finished };
  }, [courses]);

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedCourses(new Set());
      setSearchQuery('');
      setShowFinished(false);
    }
  }, [open]);

  // Filter courses based on search and active/finished toggle
  const displayedCourses = useMemo(() => {
    const coursesToFilter = showFinished ? finishedCourses : activeCourses;
    return coursesToFilter.filter(course =>
      course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.short_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [activeCourses, finishedCourses, showFinished, searchQuery]);

  const filteredCourses = displayedCourses;

  const toggleCourse = (courseId: string) => {
    const newSelected = new Set(selectedCourses);
    if (newSelected.has(courseId)) {
      newSelected.delete(courseId);
    } else {
      newSelected.add(courseId);
    }
    setSelectedCourses(newSelected);
  };

  const toggleAll = () => {
    if (selectedCourses.size === filteredCourses.length) {
      setSelectedCourses(new Set());
    } else {
      setSelectedCourses(new Set(filteredCourses.map(c => c.id)));
    }
  };

  const handleSync = (mode: 'all' | 'selected') => {
    if (mode === 'all') {
      onSync('all');
    } else {
      onSync(Array.from(selectedCourses));
    }
    onOpenChange(false);
  };

  const allSelected = filteredCourses.length > 0 && selectedCourses.size === filteredCourses.length;
  const someSelected = selectedCourses.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Sincronizar com Moodle
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Info about active courses */}
          {finishedCourses.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm">
              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-muted-foreground">
                  <strong>{activeCourses.length}</strong> cursos ativos • 
                  <strong className="ml-1">{finishedCourses.length}</strong> cursos finalizados
                </p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Apenas cursos ativos serão sincronizados por padrão
                </p>
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="flex gap-2">
            <Button 
              onClick={() => handleSync('all')} 
              className="flex-1"
              disabled={isLoading || activeCourses.length === 0}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Sincronizar ativos ({activeCourses.length} cursos)
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                ou selecione cursos específicos
              </span>
            </div>
          </div>

          {/* Toggle between active and finished */}
          <div className="flex gap-2">
            <Button
              variant={!showFinished ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFinished(false)}
              className="flex-1"
            >
              Ativos ({activeCourses.length})
            </Button>
            <Button
              variant={showFinished ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFinished(true)}
              className="flex-1"
            >
              Finalizados ({finishedCourses.length})
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar curso..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Select all */}
          {filteredCourses.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                />
                <span className="text-muted-foreground">
                  {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                </span>
              </label>
              {someSelected && (
                <Badge variant="secondary">
                  {selectedCourses.size} selecionado{selectedCourses.size !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          )}

          {/* Course list */}
          <ScrollArea className="h-[280px] rounded-md border">
            {filteredCourses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'Nenhum curso encontrado' : 'Nenhum curso disponível'}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredCourses.map((course) => (
                  <label
                    key={course.id}
                    className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selectedCourses.has(course.id)}
                      onCheckedChange={() => toggleCourse(course.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight line-clamp-2">
                        {course.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {course.short_name && (
                          <span className="text-xs text-muted-foreground">
                            {course.short_name}
                          </span>
                        )}
                        {course.end_date && (
                          <span className="text-xs text-muted-foreground/70">
                            • Término: {format(new Date(course.end_date), 'dd/MM/yyyy', { locale: ptBR })}
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={() => handleSync('selected')} 
            disabled={!someSelected || isLoading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Sincronizar selecionados
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
