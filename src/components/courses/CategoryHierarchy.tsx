import { useMemo, useState, useEffect } from 'react';
import { 
  Users, 
  AlertTriangle, 
  Building2,
  GraduationCap,
  Users2,
  BookOpen,
  StarOff
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { MyCourseCard } from './MyCourseCard';
import { toast } from 'sonner';
import { AttendanceBulkToggleButton } from '@/components/attendance/AttendanceBulkToggleButton';

interface CourseWithStats {
  id: string;
  name: string;
  short_name?: string;
  category?: string;
  start_date?: string;
  end_date?: string;
  last_sync?: string;
  students_count: number;
  at_risk_count: number;
  student_ids?: string[];
  is_attendance_enabled?: boolean;
}

interface CategoryStats {
  totalStudents: number;
  uniqueStudentIds: string[];
  totalAtRisk: number;
  coursesCount: number;
}

// Hierarchical structure: School > Course > Class > Disciplines
interface ClassNode {
  name: string;
  courses: CourseWithStats[];
  stats: CategoryStats;
}

interface CourseNode {
  name: string;
  classes: Record<string, ClassNode>;
  stats: CategoryStats;
}

interface SchoolNode {
  name: string;
  courses: Record<string, CourseNode>;
  stats: CategoryStats;
}

type HierarchyTree = Record<string, SchoolNode>;

interface CategoryHierarchyProps {
  courses: CourseWithStats[];
  onUnfollow?: (courseId: string) => void;
  onUnfollowMultiple?: (courseIds: string[]) => void;
  onToggleAttendance?: (courseId: string) => void;
  onToggleAttendanceMultiple?: (courseIds: string[], shouldEnable: boolean) => void;
}

function calculateStats(courses: CourseWithStats[]): CategoryStats {
  // Collect all student IDs and deduplicate
  const allStudentIds = courses.flatMap(c => c.student_ids || []);
  const uniqueStudentIds = [...new Set(allStudentIds)];
  
  return {
    totalStudents: uniqueStudentIds.length,
    uniqueStudentIds,
    totalAtRisk: courses.reduce((sum, c) => sum + (c.at_risk_count || 0), 0),
    coursesCount: courses.length,
  };
}

function StatsDisplay({ stats, showCourses = false }: { stats: CategoryStats; showCourses?: boolean }) {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground mr-2">
      {showCourses && (
        <span className="flex items-center gap-1">
          <BookOpen className="h-3.5 w-3.5" />
          {stats.coursesCount}
        </span>
      )}
      <span className="flex items-center gap-1">
        <Users className="h-3.5 w-3.5" />
        {stats.totalStudents}
      </span>
      {stats.totalAtRisk > 0 && (
        <span className="flex items-center gap-1 text-risk-risco">
          <AlertTriangle className="h-3.5 w-3.5" />
          {stats.totalAtRisk}
        </span>
      )}
    </div>
  );
}

function RemoveAllButton({ 
  courses, 
  onUnfollowMultiple,
  level 
}: { 
  courses: CourseWithStats[]; 
  onUnfollowMultiple?: (courseIds: string[]) => void;
  level: 'escola' | 'curso' | 'turma';
}) {
  if (!onUnfollowMultiple) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const courseIds = courses.map(c => c.id);
    onUnfollowMultiple(courseIds);
    
    const levelName = level === 'escola' ? 'escola' : level === 'curso' ? 'curso' : 'turma';
    toast.success(`${courses.length} curso${courses.length !== 1 ? 's' : ''} removido${courses.length !== 1 ? 's' : ''} de Meus Cursos`);
  };

  return (
    <Button 
      variant="ghost" 
      size="sm" 
      className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
      onClick={handleClick}
    >
      <StarOff className="h-3.5 w-3.5 mr-1" />
      Remover todos
    </Button>
  );
}

export function CategoryHierarchy({
  courses,
  onUnfollow,
  onUnfollowMultiple,
  onToggleAttendance,
  onToggleAttendanceMultiple,
}: CategoryHierarchyProps) {
  // Persistência do estado dos accordions
  const STORAGE_KEY = 'myCourses_accordion_state';

  const loadAccordionState = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.error('Error loading accordion state:', err);
    }
    return { schools: [], courses: [], classes: [], uncategorized: [] };
  };

  const saveAccordionState = (state: {
    schools: string[];
    courses: string[];
    classes: string[];
    uncategorized: string[];
  }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Error saving accordion state:', err);
    }
  };

  const [openSchools, setOpenSchools] = useState<string[]>(() => loadAccordionState().schools);
  const [openCourses, setOpenCourses] = useState<string[]>(() => loadAccordionState().courses);
  const [openClasses, setOpenClasses] = useState<string[]>(() => loadAccordionState().classes);
  const [openUncategorized, setOpenUncategorized] = useState<string[]>(() => loadAccordionState().uncategorized);

  // Salvar estado sempre que mudar
  useEffect(() => {
    saveAccordionState({
      schools: openSchools,
      courses: openCourses,
      classes: openClasses,
      uncategorized: openUncategorized,
    });
  }, [openSchools, openCourses, openClasses, openUncategorized]);

  const hierarchy = useMemo(() => {
    const tree: HierarchyTree = {};
    const uncategorized: CourseWithStats[] = [];

    courses.forEach(course => {
      if (!course.category) {
        uncategorized.push(course);
        return;
      }

      // Parse category path: "Senai > Escola > Curso > Turma"
      // We ignore first level (Senai/institution)
      const parts = course.category.split(' > ').map(p => p.trim());
      
      // Skip first element (institution), then:
      // [1] = School, [2] = Course, [3] = Class
      const school = parts[1] || 'Sem escola';
      const courseName = parts[2] || 'Sem curso';
      const className = parts[3] || 'Sem turma';

      // Initialize school
      if (!tree[school]) {
        tree[school] = {
          name: school,
          courses: {},
          stats: { totalStudents: 0, uniqueStudentIds: [], totalAtRisk: 0, totalPending: 0, coursesCount: 0 },
        };
      }

      // Initialize course within school
      if (!tree[school].courses[courseName]) {
        tree[school].courses[courseName] = {
          name: courseName,
          classes: {},
          stats: { totalStudents: 0, uniqueStudentIds: [], totalAtRisk: 0, totalPending: 0, coursesCount: 0 },
        };
      }

      // Initialize class within course
      if (!tree[school].courses[courseName].classes[className]) {
        tree[school].courses[courseName].classes[className] = {
          name: className,
          courses: [],
          stats: { totalStudents: 0, uniqueStudentIds: [], totalAtRisk: 0, totalPending: 0, coursesCount: 0 },
        };
      }

      // Add discipline/course to class
      tree[school].courses[courseName].classes[className].courses.push(course);
    });

    // Calculate stats for each level (bottom-up)
    Object.values(tree).forEach(school => {
      let schoolCourses: CourseWithStats[] = [];
      
      Object.values(school.courses).forEach(courseNode => {
        let courseCourses: CourseWithStats[] = [];
        
        Object.values(courseNode.classes).forEach(classNode => {
      // Sort courses within each class by start_date
          classNode.courses.sort((a, b) => {
            const dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
            const dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
            return dateA - dateB;
          });
          classNode.stats = calculateStats(classNode.courses);
          courseCourses = [...courseCourses, ...classNode.courses];
        });
        
        courseNode.stats = calculateStats(courseCourses);
        schoolCourses = [...schoolCourses, ...courseCourses];
      });
      
      school.stats = calculateStats(schoolCourses);
    });

    // Sort schools alphabetically
    const sortedSchools = Object.keys(tree).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    return { tree, sortedSchools, uncategorized };
  }, [courses]);

  if (hierarchy.sortedSchools.length === 0 && hierarchy.uncategorized.length === 0) {
    return null;
  }

  // Helper to get all course IDs from a school
  const getSchoolCourseIds = (schoolKey: string): CourseWithStats[] => {
    const school = hierarchy.tree[schoolKey];
    const allCourses: CourseWithStats[] = [];
    Object.values(school.courses).forEach(courseNode => {
      Object.values(courseNode.classes).forEach(classNode => {
        allCourses.push(...classNode.courses);
      });
    });
    return allCourses;
  };

  // Helper to get all course IDs from a course node
  const getCourseNodeCourseIds = (schoolKey: string, courseKey: string): CourseWithStats[] => {
    const courseNode = hierarchy.tree[schoolKey].courses[courseKey];
    const allCourses: CourseWithStats[] = [];
    Object.values(courseNode.classes).forEach(classNode => {
      allCourses.push(...classNode.courses);
    });
    return allCourses;
  };

  return (
    <div className="space-y-4">
      {/* Schools */}
      <Accordion 
        type="multiple" 
        value={openSchools}
        onValueChange={setOpenSchools}
        className="space-y-4"
      >
        {hierarchy.sortedSchools.map(schoolKey => {
          const school = hierarchy.tree[schoolKey];
          const courseKeys = Object.keys(school.courses).sort((a, b) => a.localeCompare(b, 'pt-BR'));
          const schoolCourses = getSchoolCourseIds(schoolKey);

          return (
            <AccordionItem 
              key={schoolKey} 
              value={schoolKey}
              className="border rounded-lg bg-card overflow-hidden"
            >
              <div className="flex items-center gap-2 px-4 py-3 hover:bg-muted/50">
                <div className="flex-1">
                  <AccordionTrigger className="py-0 hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-2">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-primary" />
                        <div className="text-left">
                          <p className="font-semibold">{school.name}</p>
                          <p className="text-xs text-muted-foreground font-normal">
                            {courseKeys.length} curso{courseKeys.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <StatsDisplay stats={school.stats} />
                    </div>
                  </AccordionTrigger>
                </div>
                <div className="flex items-center gap-2">
                  <AttendanceBulkToggleButton
                    courses={schoolCourses}
                    onToggleAttendanceMultiple={onToggleAttendanceMultiple}
                    level="escola"
                  />
                  <RemoveAllButton 
                    courses={schoolCourses} 
                    onUnfollowMultiple={onUnfollowMultiple}
                    level="escola"
                  />
                </div>
              </div>
              <AccordionContent className="px-4 pb-4">
                {/* Courses within school */}
                <Accordion 
                  type="multiple" 
                  value={openCourses.filter(key => key.startsWith(`${schoolKey}::`))}
                  onValueChange={(values) => {
                    // Remove todas as keys desta escola e adiciona as novas
                    setOpenCourses(prev => [
                      ...prev.filter(key => !key.startsWith(`${schoolKey}::`)),
                      ...values
                    ]);
                  }}
                  className="space-y-3 pt-2"
                >
                  {courseKeys.map(courseKey => {
                    const courseNode = school.courses[courseKey];
                    const classKeys = Object.keys(courseNode.classes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
                    const courseCourses = getCourseNodeCourseIds(schoolKey, courseKey);
                    const courseAccordionKey = `${schoolKey}::${courseKey}`;

                    return (
                      <AccordionItem 
                        key={courseKey} 
                        value={courseAccordionKey}
                        className="border rounded-lg bg-muted/30 overflow-hidden"
                      >
                        <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/50">
                          <div className="flex-1">
                            <AccordionTrigger className="py-0 hover:no-underline">
                              <div className="flex items-center justify-between w-full pr-2">
                                <div className="flex items-center gap-3">
                                  <GraduationCap className="h-4 w-4 text-primary/80" />
                                  <div className="text-left">
                                    <p className="font-medium text-sm">{courseNode.name}</p>
                                    <p className="text-xs text-muted-foreground font-normal">
                                      {classKeys.length} turma{classKeys.length !== 1 ? 's' : ''}
                                    </p>
                                  </div>
                                </div>
                                <StatsDisplay stats={courseNode.stats} />
                              </div>
                            </AccordionTrigger>
                          </div>
                          <div className="flex items-center gap-2">
                            <AttendanceBulkToggleButton
                              courses={courseCourses}
                              onToggleAttendanceMultiple={onToggleAttendanceMultiple}
                              level="curso"
                            />
                            <RemoveAllButton 
                              courses={courseCourses} 
                              onUnfollowMultiple={onUnfollowMultiple}
                              level="curso"
                            />
                          </div>
                        </div>
                        <AccordionContent className="px-4 pb-3">
                          {/* Classes within course */}
                          <Accordion 
                            type="multiple" 
                            value={openClasses.filter(key => key.startsWith(`${courseAccordionKey}::`))}
                            onValueChange={(values) => {
                              // Remove todas as keys deste curso e adiciona as novas
                              setOpenClasses(prev => [
                                ...prev.filter(key => !key.startsWith(`${courseAccordionKey}::`)),
                                ...values
                              ]);
                            }}
                            className="space-y-2 pt-2"
                          >
                            {classKeys.map(classKey => {
                              const classNode = courseNode.classes[classKey];
                              const classAccordionKey = `${courseAccordionKey}::${classKey}`;

                              return (
                                <AccordionItem 
                                  key={classKey} 
                                  value={classAccordionKey}
                                  className="border rounded-lg bg-background overflow-hidden"
                                >
                                  <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30">
                                    <div className="flex-1">
                                      <AccordionTrigger className="py-0 hover:no-underline">
                                        <div className="flex items-center justify-between w-full pr-2">
                                          <div className="flex items-center gap-2">
                                            <Users2 className="h-4 w-4 text-muted-foreground" />
                                            <div className="text-left">
                                              <p className="font-medium text-sm">{classNode.name}</p>
                                              <p className="text-xs text-muted-foreground font-normal">
                                                {classNode.courses.length} disciplina{classNode.courses.length !== 1 ? 's' : ''}
                                              </p>
                                            </div>
                                          </div>
                                          <StatsDisplay stats={classNode.stats} showCourses />
                                        </div>
                                      </AccordionTrigger>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <AttendanceBulkToggleButton
                                        courses={classNode.courses}
                                        onToggleAttendanceMultiple={onToggleAttendanceMultiple}
                                        level="turma"
                                      />
                                      <RemoveAllButton 
                                        courses={classNode.courses} 
                                        onUnfollowMultiple={onUnfollowMultiple}
                                        level="turma"
                                      />
                                    </div>
                                  </div>
                                  <AccordionContent className="px-3 pb-3">
                                    {/* Disciplines/Courses */}
                                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pt-2">
                                      {classNode.courses.map(course => (
                                        <MyCourseCard 
                                          key={course.id} 
                                          course={course}
                                          onUnfollow={onUnfollow}
                                          onToggleAttendance={onToggleAttendance}
                                        />
                                      ))}
                                    </div>
                                  </AccordionContent>
                                </AccordionItem>
                              );
                            })}
                          </Accordion>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Uncategorized courses */}
      {hierarchy.uncategorized.length > 0 && (
        <Accordion 
          type="multiple" 
          value={openUncategorized}
          onValueChange={setOpenUncategorized}
          className="space-y-4"
        >
          <AccordionItem 
            value="uncategorized"
            className="border rounded-lg bg-card overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-3 hover:bg-muted/50">
              <div className="flex-1">
                <AccordionTrigger className="py-0 hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-2">
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-5 w-5 text-muted-foreground" />
                      <div className="text-left">
                        <p className="font-semibold">Sem categoria</p>
                        <p className="text-xs text-muted-foreground font-normal">
                          {hierarchy.uncategorized.length} curso{hierarchy.uncategorized.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <StatsDisplay stats={calculateStats(hierarchy.uncategorized)} />
                  </div>
                </AccordionTrigger>
              </div>
              <div className="flex items-center gap-2">
                <AttendanceBulkToggleButton
                  courses={hierarchy.uncategorized}
                  onToggleAttendanceMultiple={onToggleAttendanceMultiple}
                  level="escola"
                />
                <RemoveAllButton 
                  courses={hierarchy.uncategorized} 
                  onUnfollowMultiple={onUnfollowMultiple}
                  level="escola"
                />
              </div>
            </div>
            <AccordionContent className="px-4 pb-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pt-2">
                {hierarchy.uncategorized.map(course => (
                  <MyCourseCard 
                    key={course.id} 
                    course={course}
                    onUnfollow={onUnfollow}
                    onToggleAttendance={onToggleAttendance}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
