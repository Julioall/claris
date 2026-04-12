import { useMemo, useState } from 'react';
import { Calendar, Filter, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ClarisSuggestions } from '@/features/claris/components/ClarisSuggestions';
import { useCoursesData } from '@/features/courses/hooks/useCoursesData';
import type { WeeklySummary } from '@/features/dashboard/types';
import { getCourseLifecycleStatus } from '@/lib/course-dates';

import { ActivityFeed } from '../components/ActivityFeed';
import { ActivitiesToReview } from '../components/ActivitiesToReview';
import { CourseOverview } from '../components/CourseOverview';
import { ManagerialViews } from '../components/ManagerialViews';
import { PriorityList } from '../components/PriorityList';
import { WeeklyIndicators } from '../components/WeeklyIndicators';
import { useDashboardData } from '../hooks/useDashboardData';

const EMPTY_SUMMARY: WeeklySummary = {
  today_events: 0,
  today_tasks: 0,
  activities_to_review: 0,
  active_normal_students: 0,
  pending_submission_assignments: 0,
  pending_correction_assignments: 0,
  students_at_risk: 0,
  new_at_risk_this_week: 0,
};

export default function DashboardPage() {
  const [selectedWeek, setSelectedWeek] = useState<'current' | 'last'>('current');
  const [selectedCourse, setSelectedCourse] = useState('all');

  const {
    summary,
    criticalStudents,
    activitiesToReview,
    activityFeed,
    isLoading,
    refetch,
  } = useDashboardData(selectedWeek, selectedCourse);

  const { courses, isLoading: coursesLoading, refetch: refetchCourses } = useCoursesData();
  const ongoingCourses = useMemo(
    () => courses.filter((course) => getCourseLifecycleStatus(course) === 'em_andamento'),
    [courses],
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetch(), refetchCourses()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading || coursesLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel de monitoramento</h1>
          <p className="text-muted-foreground">
            Acompanhe risco, entregas e fila operacional dos cursos monitorados
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void handleManualRefresh();
            }}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Select value={selectedWeek} onValueChange={(value) => setSelectedWeek(value as 'current' | 'last')}>
            <SelectTrigger className="w-[160px]">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Semana atual</SelectItem>
              <SelectItem value="last">Última semana</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedCourse} onValueChange={setSelectedCourse}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Todos os cursos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cursos</SelectItem>
              {ongoingCourses.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.short_name || course.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Weekly Indicators */}
      <WeeklyIndicators summary={summary || EMPTY_SUMMARY} />

      {/* Claris IA proactive suggestions panel */}
      <ClarisSuggestions />

      {/* Managerial analytics views */}
      <ManagerialViews courses={ongoingCourses} />

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PriorityList criticalStudents={criticalStudents} />

        <ActivitiesToReview
          activities={activitiesToReview}
          totalCount={summary?.pending_correction_assignments ?? 0}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CourseOverview courses={courses} />

        <ActivityFeed items={activityFeed} />
      </div>
    </div>
  );
}
