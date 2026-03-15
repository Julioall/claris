import { useState } from 'react';
import { Calendar, Filter, Loader2 } from 'lucide-react';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WeeklyIndicators } from '@/components/dashboard/WeeklyIndicators';
import { PriorityList } from '@/components/dashboard/PriorityList';
import { CourseOverview } from '@/components/dashboard/CourseOverview';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { ActivitiesToReview } from '@/components/dashboard/ActivitiesToReview';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useCoursesData } from '@/hooks/useCoursesData';

export default function Dashboard() {
  const [selectedWeek, setSelectedWeek] = useState<'current' | 'last'>('current');
  const [selectedCourse, setSelectedCourse] = useState('all');

  const { 
    summary, 
    overdueTasks, 
    upcomingTasks, 
    criticalStudents, 
    activitiesToReview,
    activityFeed,
    isLoading 
  } = useDashboardData(selectedWeek, selectedCourse);

  const { courses, isLoading: coursesLoading } = useCoursesData();

  const defaultSummary = {
    pending_tasks: 0,
    overdue_tasks: 0,
    activities_to_review: 0,
    missed_assignments: 0,
    pending_submission_assignments: 0,
    pending_correction_assignments: 0,
    students_at_risk: 0,
    new_at_risk_this_week: 0,
  };

  if (isLoading || coursesLoading) {
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
          <h1 className="text-2xl font-bold tracking-tight">Painel de monitoramento</h1>
          <p className="text-muted-foreground">
            Acompanhe risco, entregas e fila operacional dos cursos monitorados
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Select value={selectedWeek} onValueChange={(v) => setSelectedWeek(v as 'current' | 'last')}>
            <SelectTrigger className="w-[160px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Semana atual</SelectItem>
              <SelectItem value="last">Última semana</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedCourse} onValueChange={setSelectedCourse}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Todos os cursos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cursos</SelectItem>
              {courses.map(course => (
                <SelectItem key={course.id} value={course.id}>
                  {course.short_name || course.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Weekly Indicators */}
      <WeeklyIndicators summary={summary || defaultSummary} />

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PriorityList 
          overdueTasks={overdueTasks}
          upcomingTasks={upcomingTasks}
          criticalStudents={criticalStudents}
        />

        <ActivitiesToReview activities={activitiesToReview} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CourseOverview courses={courses} />

        <ActivityFeed items={activityFeed} />
      </div>
    </div>
  );
}
