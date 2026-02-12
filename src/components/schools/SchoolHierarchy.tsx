import { useMemo, useState } from 'react';
import { 
  Users, 
  AlertTriangle, 
  ClipboardList, 
  Building2,
  GraduationCap,
  Users2,
  BookOpen,
  EyeOff,
  Eye
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SchoolCourseCard } from './SchoolCourseCard';
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
  pending_tasks_count: number;
  is_following: boolean;
  is_ignored: boolean;
  is_attendance_enabled?: boolean;
}

interface CategoryStats {
  totalStudents: number;
  totalAtRisk: number;
  totalPending: number;
  coursesCount: number;
  followingCount: number;
  ignoredCount: number;
}

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

interface SchoolHierarchyProps {
  courses: CourseWithStats[];
  onToggleFollow?: (courseId: string) => void;
  onToggleIgnore?: (courseId: string) => void;
  onToggleIgnoreMultiple?: (courseIds: string[], shouldIgnore: boolean) => void;
  onToggleAttendance?: (courseId: string) => void;
  onToggleAttendanceMultiple?: (courseIds: string[], shouldEnable: boolean) => void;
}

function calculateStats(courses: CourseWithStats[]): CategoryStats {
  return {
    totalStudents: courses.reduce((sum, c) => sum + (c.students_count || 0), 0),
    totalAtRisk: courses.reduce((sum, c) => sum + (c.at_risk_count || 0), 0),
    totalPending: courses.reduce((sum, c) => sum + (c.pending_tasks_count || 0), 0),
    coursesCount: courses.length,
    followingCount: courses.filter(c => c.is_following).length,
    ignoredCount: courses.filter(c => c.is_ignored).length,
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
      {stats.followingCount > 0 && (
        <span className="flex items-center gap-1 text-primary">
          ★ {stats.followingCount}
        </span>
      )}
      {stats.ignoredCount > 0 && (
        <span className="flex items-center gap-1 text-muted-foreground/50">
          <EyeOff className="h-3.5 w-3.5" />
          {stats.ignoredCount}
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
      {stats.totalPending > 0 && (
        <span className="flex items-center gap-1 text-status-pending">
          <ClipboardList className="h-3.5 w-3.5" />
          {stats.totalPending}
        </span>
      )}
    </div>
  );
}

function IgnoreAllButton({ 
  courses, 
  onToggleIgnoreMultiple,
  level 
}: { 
  courses: CourseWithStats[]; 
  onToggleIgnoreMultiple?: (courseIds: string[], shouldIgnore: boolean) => void;
  level: 'escola' | 'curso' | 'turma';
}) {
  if (!onToggleIgnoreMultiple) return null;
  const allIgnored = courses.every(c => c.is_ignored);
  const someIgnored = courses.some(c => c.is_ignored) && !allIgnored;
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const courseIds = courses.map(c => c.id);
    const shouldIgnore = !allIgnored;
    onToggleIgnoreMultiple(courseIds, shouldIgnore);
    
    const levelName = level === 'escola' ? 'escola' : level === 'curso' ? 'curso' : 'turma';
    if (shouldIgnore) {
      toast.success(`${levelName.charAt(0).toUpperCase() + levelName.slice(1)} marcada como ignorada`);
    } else {
      toast.success(`${levelName.charAt(0).toUpperCase() + levelName.slice(1)} desmarcada`);
    }
  };

  return (
    <Button 
      variant="ghost" 
      size="sm" 
      className="h-7 px-2 text-xs"
      onClick={handleClick}
    >
      {allIgnored ? (
        <>
          <Eye className="h-3.5 w-3.5 mr-1" />
          Desmarcar
        </>
      ) : (
        <>
          <EyeOff className="h-3.5 w-3.5 mr-1" />
          {someIgnored ? 'Ignorar restante' : 'Ignorar todos'}
        </>
      )}
    </Button>
  );
}

export function SchoolHierarchy({
  courses,
  onToggleFollow,
  onToggleIgnore,
  onToggleIgnoreMultiple,
  onToggleAttendance,
  onToggleAttendanceMultiple,
}: SchoolHierarchyProps) {
  const hierarchy = useMemo(() => {
    const tree: HierarchyTree = {};
    const uncategorized: CourseWithStats[] = [];

    courses.forEach(course => {
      if (!course.category) {
        uncategorized.push(course);
        return;
      }

      const parts = course.category.split(' > ').map(p => p.trim());
      
      const school = parts[1] || 'Sem escola';
      const courseName = parts[2] || 'Sem curso';
      const className = parts[3] || 'Sem turma';

      if (!tree[school]) {
        tree[school] = {
          name: school,
          courses: {},
          stats: { totalStudents: 0, totalAtRisk: 0, totalPending: 0, coursesCount: 0, followingCount: 0, ignoredCount: 0 },
        };
      }

      if (!tree[school].courses[courseName]) {
        tree[school].courses[courseName] = {
          name: courseName,
          classes: {},
          stats: { totalStudents: 0, totalAtRisk: 0, totalPending: 0, coursesCount: 0, followingCount: 0, ignoredCount: 0 },
        };
      }

      if (!tree[school].courses[courseName].classes[className]) {
        tree[school].courses[courseName].classes[className] = {
          name: className,
          courses: [],
          stats: { totalStudents: 0, totalAtRisk: 0, totalPending: 0, coursesCount: 0, followingCount: 0, ignoredCount: 0 },
        };
      }

      tree[school].courses[courseName].classes[className].courses.push(course);
    });

    Object.values(tree).forEach(school => {
      let schoolCourses: CourseWithStats[] = [];
      
      Object.values(school.courses).forEach(courseNode => {
        let courseCourses: CourseWithStats[] = [];
        
        Object.values(courseNode.classes).forEach(classNode => {
          classNode.stats = calculateStats(classNode.courses);
          courseCourses = [...courseCourses, ...classNode.courses];
        });
        
        courseNode.stats = calculateStats(courseCourses);
        schoolCourses = [...schoolCourses, ...courseCourses];
      });
      
      school.stats = calculateStats(schoolCourses);
    });

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
      <Accordion 
        type="multiple" 
        defaultValue={[]}
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
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
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
                  <div className="flex items-center gap-2">
                    <AttendanceBulkToggleButton
                      courses={schoolCourses}
                      onToggleAttendanceMultiple={onToggleAttendanceMultiple}
                      level="escola"
                    />
                    <IgnoreAllButton 
                      courses={schoolCourses} 
                      onToggleIgnoreMultiple={onToggleIgnoreMultiple}
                      level="escola"
                    />
                    <StatsDisplay stats={school.stats} />
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <Accordion 
                  type="multiple" 
                  defaultValue={[]}
                  className="space-y-3 pt-2"
                >
                  {courseKeys.map(courseKey => {
                    const courseNode = school.courses[courseKey];
                    const classKeys = Object.keys(courseNode.classes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
                    const courseCourses = getCourseNodeCourseIds(schoolKey, courseKey);

                    return (
                      <AccordionItem 
                        key={courseKey} 
                        value={courseKey}
                        className="border rounded-lg bg-muted/30 overflow-hidden"
                      >
                        <AccordionTrigger className="px-4 py-2.5 hover:no-underline hover:bg-muted/50">
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
                            <div className="flex items-center gap-2">
                              <AttendanceBulkToggleButton
                                courses={courseCourses}
                                onToggleAttendanceMultiple={onToggleAttendanceMultiple}
                                level="curso"
                              />
                              <IgnoreAllButton 
                                courses={courseCourses} 
                                onToggleIgnoreMultiple={onToggleIgnoreMultiple}
                                level="curso"
                              />
                              <StatsDisplay stats={courseNode.stats} />
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-3">
                          <Accordion 
                            type="multiple" 
                            defaultValue={[]}
                            className="space-y-2 pt-2"
                          >
                            {classKeys.map(classKey => {
                              const classNode = courseNode.classes[classKey];

                              return (
                                <AccordionItem 
                                  key={classKey} 
                                  value={classKey}
                                  className="border rounded-lg bg-background overflow-hidden"
                                >
                                  <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/30">
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
                                      <div className="flex items-center gap-2">
                                        <AttendanceBulkToggleButton
                                          courses={classNode.courses}
                                          onToggleAttendanceMultiple={onToggleAttendanceMultiple}
                                          level="turma"
                                        />
                                        <IgnoreAllButton 
                                          courses={classNode.courses} 
                                          onToggleIgnoreMultiple={onToggleIgnoreMultiple}
                                          level="turma"
                                        />
                                        <StatsDisplay stats={classNode.stats} showCourses />
                                      </div>
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="px-3 pb-3">
                                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pt-2">
                                      {classNode.courses.map(course => (
                                        <SchoolCourseCard 
                                          key={course.id} 
                                          course={course} 
                                          onToggleFollow={onToggleFollow}
                                          onToggleIgnore={onToggleIgnore}
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

      {hierarchy.uncategorized.length > 0 && (
        <Accordion type="multiple" defaultValue={[]} className="space-y-4">
          <AccordionItem 
            value="uncategorized"
            className="border rounded-lg bg-card overflow-hidden"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
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
                <div className="flex items-center gap-2">
                  <AttendanceBulkToggleButton
                    courses={hierarchy.uncategorized}
                    onToggleAttendanceMultiple={onToggleAttendanceMultiple}
                    level="escola"
                  />
                  <IgnoreAllButton 
                    courses={hierarchy.uncategorized} 
                    onToggleIgnoreMultiple={onToggleIgnoreMultiple}
                    level="escola"
                  />
                  <StatsDisplay stats={calculateStats(hierarchy.uncategorized)} />
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pt-2">
                {hierarchy.uncategorized.map(course => (
                  <SchoolCourseCard 
                    key={course.id} 
                    course={course} 
                    onToggleFollow={onToggleFollow}
                    onToggleIgnore={onToggleIgnore}
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
