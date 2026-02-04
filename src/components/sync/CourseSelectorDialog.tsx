import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Search, RefreshCw, BookOpen } from 'lucide-react';
import { Course } from '@/types';

interface CourseSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: Course[];
  onSync: (selectedCourseIds: string[] | 'all') => void;
  isLoading?: boolean;
}

export function CourseSelectorDialog({
  open,
  onOpenChange,
  courses,
  onSync,
  isLoading,
}: CourseSelectorDialogProps) {
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedCourses(new Set());
      setSearchQuery('');
    }
  }, [open]);

  const filteredCourses = courses.filter(course =>
    course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    course.short_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          {/* Quick actions */}
          <div className="flex gap-2">
            <Button 
              onClick={() => handleSync('all')} 
              className="flex-1"
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Sincronizar tudo ({courses.length} cursos)
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
                      {course.short_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {course.short_name}
                        </p>
                      )}
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
