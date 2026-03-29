import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RefreshCw, Building2, GraduationCap, Users, ChevronRight, AlertCircle, BookOpen } from 'lucide-react';
import {
  fetchStudentCountsByCourseIds,
  fetchUserSyncPreferences,
  saveUserSyncPreferences,
  type SyncPreferences,
} from '@/features/courses/api';
import type { Course } from '@/features/courses/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { isCourseEffectivelyActive, withEffectiveCourseDates } from '@/lib/course-dates';

interface CourseSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: Course[];
  onSync: (selectedCourseIds: string[]) => void;
  isLoading?: boolean;
}

interface EventNode {
  key: string;
  name: string;
  courses: Course[];
  studentCount: number;
  isFullyFinished: boolean;
}

interface SchoolNode {
  name: string;
  events: EventNode[];
  totalStudents: number;
  totalCourses: number;
}

function isCourseFinishedForSyncFilter(course: Course): boolean {
  const hasDeclaredEndDate = Boolean(course.end_date?.trim());
  const hasEffectiveEndDate = Boolean(course.effective_end_date?.trim());

  if (!hasDeclaredEndDate && !hasEffectiveEndDate) {
    return true;
  }

  return !isCourseEffectivelyActive(course);
}

async function loadPreferencesFromDB(userId: string): Promise<SyncPreferences | null> {
  try {
    return await fetchUserSyncPreferences(userId);
  } catch (e) {
    console.error('Error loading sync preferences:', e);
  }
  return null;
}

async function savePreferencesToDB(userId: string, prefs: SyncPreferences) {
  try {
    await saveUserSyncPreferences(userId, prefs);
  } catch (e) {
    console.error('Error saving sync preferences:', e);
  }
}

export function CourseSelectorDialog({
  open,
  onOpenChange,
  courses,
  onSync,
  isLoading,
}: CourseSelectorDialogProps) {
  const { user } = useAuth();
  const normalizedCourses = useMemo(() => withEffectiveCourseDates(courses), [courses]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [includeEmptyCourses, setIncludeEmptyCourses] = useState(false);
  const [includeFinished, setIncludeFinished] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [studentCounts, setStudentCounts] = useState<Map<string, number>>(new Map());
  const [openSchools, setOpenSchools] = useState<Set<string>>(new Set());
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [countsLoaded, setCountsLoaded] = useState(false);

  // Fetch student counts when dialog opens
  useEffect(() => {
    if (!open || courses.length === 0) {
      setCountsLoaded(false);
      return;
    }

    const fetchCounts = async () => {
      setCountsLoaded(false);
      const courseIds = courses.map(c => c.id);
      const allCounts = await fetchStudentCountsByCourseIds(courseIds);

      setStudentCounts(allCounts);
      setCountsLoaded(true);
      console.log(`✓ Loaded student counts for ${allCounts.size} courses out of ${courseIds.length} total courses`);
    };

    fetchCounts();
  }, [open, courses]);

  // Load preferences when dialog opens
  useEffect(() => {
    if (!open || !user) {
      setPrefsLoaded(false);
      return;
    }

    const load = async () => {
      const prefs = await loadPreferencesFromDB(user.id);
      if (prefs) {
        setSelectedKeys(new Set(prefs.selectedKeys));
        setIncludeEmptyCourses(prefs.includeEmptyCourses);
        setIncludeFinished(prefs.includeFinished);
      }
      setPrefsLoaded(true);
    };
    load();
  }, [open, user]);

  const availableSources = useMemo(() => {
    const sources = new Set(normalizedCourses.map(c => c.moodle_source).filter(Boolean));
    return Array.from(sources) as string[];
  }, [normalizedCourses]);

  const selectableCourses = useMemo(() => {
    return normalizedCourses.filter(course => {
      const count = studentCounts.get(course.id);

      if (count === 0 && !includeEmptyCourses && countsLoaded) {
        console.warn(`Filtering out course "${course.name}" - empty and includeEmptyCourses is false`);
        return false;
      }

      if (sourceFilter && course.moodle_source !== sourceFilter) return false;

      return Boolean(course.category);
    });
  }, [normalizedCourses, includeEmptyCourses, studentCounts, countsLoaded, sourceFilter]);

  const groupedSchools = useMemo(() => {
    const schoolMap = new Map<string, Map<string, Course[]>>();

    selectableCourses.forEach(course => {
      // Parse: "Institution > School > Event > Class"
      const parts = (course.category || '').split(' > ').map(p => p.trim());
      const school = parts[1] || 'Sem escola';
      const event = parts[2] || 'Sem evento';

      if (!schoolMap.has(school)) schoolMap.set(school, new Map());
      const eventMap = schoolMap.get(school)!;
      if (!eventMap.has(event)) eventMap.set(event, []);
      eventMap.get(event)!.push(course);
    });

    const result: SchoolNode[] = [];

    schoolMap.forEach((eventMap, schoolName) => {
      const events: EventNode[] = [];
      let totalStudents = 0;
      let totalCourses = 0;

      eventMap.forEach((eventCourses, eventName) => {
        const key = `${schoolName}::${eventName}`;
        const eventStudentCount = eventCourses.reduce(
          (sum, c) => sum + (studentCounts.get(c.id) || 0), 0
        );

        events.push({
          key,
          name: eventName,
          courses: eventCourses,
          studentCount: eventStudentCount,
          isFullyFinished: eventCourses.length > 0 && eventCourses.every(isCourseFinishedForSyncFilter),
        });

        totalStudents += eventStudentCount;
        totalCourses += eventCourses.length;
      });

      events.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

      result.push({
        name: schoolName,
        events,
        totalStudents,
        totalCourses,
      });
    });

    result.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return result;
  }, [selectableCourses, studentCounts]);

  // Count active vs fully finished course groups
  const courseStats = useMemo(() => {
    let active = 0;
    let finished = 0;

    groupedSchools.forEach(school => {
      school.events.forEach(event => {
        if (event.isFullyFinished) finished++;
        else active++;
      });
    });

    return { active, finished };
  }, [groupedSchools]);

  // Build hierarchy from category paths
  const schools = useMemo(() => {
    return groupedSchools
      .map(school => {
        const events = school.events.filter(event => includeFinished || !event.isFullyFinished);
        if (events.length === 0) return null;

        return {
          ...school,
          events,
          totalStudents: events.reduce((sum, event) => sum + event.studentCount, 0),
          totalCourses: events.reduce((sum, event) => sum + event.courses.length, 0),
        };
      })
      .filter((school): school is SchoolNode => Boolean(school));
  }, [groupedSchools, includeFinished]);

  // First-time: select all events
  useEffect(() => {
    if (!prefsLoaded || schools.length === 0) return;

    setSelectedKeys(previousKeys => {
      if (previousKeys.size > 0) {
        return previousKeys;
      }

      const allKeys = new Set<string>();
      schools.forEach(school => {
        school.events.forEach(event => allKeys.add(event.key));
      });
      return allKeys;
    });

    // Always open all schools
    setOpenSchools(new Set(schools.map(s => s.name)));
  }, [prefsLoaded, schools]);

  const isSchoolFullyChecked = (school: SchoolNode) =>
    school.events.length > 0 && school.events.every(e => selectedKeys.has(e.key));

  const isSchoolPartiallyChecked = (school: SchoolNode) =>
    school.events.some(e => selectedKeys.has(e.key)) && !isSchoolFullyChecked(school);

  const toggleSchool = useCallback((school: SchoolNode) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (school.events.every(e => next.has(e.key))) {
        school.events.forEach(e => next.delete(e.key));
      } else {
        school.events.forEach(e => next.add(e.key));
      }
      return next;
    });
  }, []);

  const toggleEvent = useCallback((eventKey: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(eventKey)) next.delete(eventKey);
      else next.add(eventKey);
      return next;
    });
  }, []);

  const toggleSchoolOpen = useCallback((schoolName: string) => {
    setOpenSchools(prev => {
      const next = new Set(prev);
      if (next.has(schoolName)) next.delete(schoolName);
      else next.add(schoolName);
      return next;
    });
  }, []);

  // Resolve selections to course IDs
  const selectedCourseIds = useMemo(() => {
    const ids: string[] = [];
    schools.forEach(school => {
      school.events.forEach(event => {
        if (selectedKeys.has(event.key)) {
          event.courses.forEach(c => ids.push(c.id));
        }
      });
    });
    return ids;
  }, [schools, selectedKeys]);

  const selectedEventsCount = useMemo(() => {
    let count = 0;
    schools.forEach(school => {
      school.events.forEach(event => {
        if (selectedKeys.has(event.key)) count++;
      });
    });
    return count;
  }, [schools, selectedKeys]);

  const totalEventsCount = schools.reduce((sum, s) => sum + s.events.length, 0);

  const handleSync = () => {
    if (user) {
      savePreferencesToDB(user.id, {
        selectedKeys: Array.from(selectedKeys),
        includeEmptyCourses,
        includeFinished,
      });
    }

    onSync(selectedCourseIds);
    onOpenChange(false);
  };

  const selectAll = () => {
    const allKeys = new Set<string>();
    schools.forEach(s => s.events.forEach(e => allKeys.add(e.key)));
    setSelectedKeys(allKeys);
  };

  const deselectAll = () => {
    setSelectedKeys(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Sincronizar com Moodle
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto pr-1">
          {/* Stats */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-muted-foreground">
                <strong>{courseStats.active}</strong> cursos ativos
                {courseStats.finished > 0 && (
                  <> • <strong>{courseStats.finished}</strong> finalizados</>
                )}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Selecione as escolas e eventos que deseja sincronizar
              </p>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-col gap-3 p-3 rounded-lg border">
            <div className="flex items-center justify-between">
              <Label htmlFor="include-empty" className="text-sm cursor-pointer">
                Incluir cursos sem alunos
              </Label>
              <Switch
                id="include-empty"
                checked={includeEmptyCourses}
                onCheckedChange={setIncludeEmptyCourses}
              />
            </div>
            {courseStats.finished > 0 && (
              <div className="flex items-center justify-between">
                <Label htmlFor="include-finished" className="text-sm cursor-pointer">
                  Incluir finalizados ({courseStats.finished})
                </Label>
                <Switch
                  id="include-finished"
                  checked={includeFinished}
                  onCheckedChange={setIncludeFinished}
                />
              </div>
            )}
            {availableSources.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Origem:</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSourceFilter(null)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${!sourceFilter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                  >
                    Todas
                  </button>
                  {availableSources.map(source => (
                    <button
                      key={source}
                      type="button"
                      onClick={() => setSourceFilter(source === sourceFilter ? null : source)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${sourceFilter === source ? (source === 'goias' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white') : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      {source === 'goias' ? 'Goiás' : source === 'nacional' ? 'Nacional' : source}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Select / Deselect all */}
          {totalEventsCount > 0 && (
            <div className="flex items-center justify-between px-1">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>
                  Selecionar todos
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={deselectAll}>
                  Limpar seleção
                </Button>
              </div>
              {selectedEventsCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {selectedEventsCount}/{totalEventsCount} eventos
                </Badge>
              )}
            </div>
          )}

          {/* Hierarchy */}
          <ScrollArea className="h-[320px] rounded-md border">
            {schools.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {courses.length === 0 ? 'Nenhum curso disponível' : 'Nenhum curso corresponde aos filtros'}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {schools.map(school => (
                  <Collapsible
                    key={school.name}
                    open={openSchools.has(school.name)}
                    onOpenChange={() => toggleSchoolOpen(school.name)}
                  >
                    <div className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50">
                      <Checkbox
                        checked={
                          isSchoolFullyChecked(school)
                            ? true
                            : isSchoolPartiallyChecked(school)
                              ? 'indeterminate'
                              : false
                        }
                        onCheckedChange={() => toggleSchool(school)}
                      />
                      <CollapsibleTrigger className="flex items-center gap-2 flex-1 min-w-0">
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform shrink-0",
                            openSchools.has(school.name) && "rotate-90"
                          )}
                        />
                        <Building2 className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-medium truncate">{school.name}</span>
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="text-[10px] px-1.5">
                          {school.events.length} evento{school.events.length !== 1 ? 's' : ''}
                        </Badge>
                        {school.totalStudents > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {school.totalStudents}
                          </span>
                        )}
                      </div>
                    </div>
                    <CollapsibleContent>
                      <div className="ml-6 pl-4 border-l border-border space-y-0.5">
                        {school.events.map(event => (
                          <label
                            key={event.key}
                            className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/30 cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedKeys.has(event.key)}
                              onCheckedChange={() => toggleEvent(event.key)}
                            />
                            <GraduationCap className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                            <span className="text-sm truncate flex-1">{event.name}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-muted-foreground">
                                {event.courses.length} turma{event.courses.length !== 1 ? 's' : ''}
                              </span>
                              {event.studentCount > 0 ? (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Users className="h-3 w-3" />
                                  {event.studentCount}
                                </span>
                              ) : countsLoaded ? (
                                <span className="text-[10px] text-muted-foreground/50 italic">
                                  sem alunos
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/40 italic">
                                  carregando...
                                </span>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 flex-wrap">
          <div className="flex items-center gap-2 mr-auto text-xs text-muted-foreground min-w-0">
            {selectedCourseIds.length > 0 && (
              <span className="truncate">{selectedCourseIds.length} curso{selectedCourseIds.length !== 1 ? 's' : ''} selecionado{selectedCourseIds.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button
            onClick={handleSync}
            disabled={selectedCourseIds.length === 0 || isLoading}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Sincronizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
