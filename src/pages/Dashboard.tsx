import { useState } from 'react';
import { Calendar, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { 
  mockWeeklySummary, 
  mockCourses, 
  mockStudents, 
  mockPendingTasks,
  mockActivityFeed 
} from '@/lib/mock-data';
import { isPast, isToday, addDays } from 'date-fns';

export default function Dashboard() {
  const [selectedWeek, setSelectedWeek] = useState('current');
  const [selectedCourse, setSelectedCourse] = useState('all');

  // Filter data based on selections
  const overdueActions = mockPendingTasks.filter(task => {
    if (!task.due_date) return false;
    return isPast(new Date(task.due_date)) && task.status !== 'resolvida';
  });

  const upcomingTasks = mockPendingTasks.filter(task => {
    if (!task.due_date) return false;
    const dueDate = new Date(task.due_date);
    const threeDaysFromNow = addDays(new Date(), 3);
    return dueDate <= threeDaysFromNow && !isPast(dueDate) && task.status !== 'resolvida';
  });

  const criticalStudents = mockStudents.filter(
    student => ['risco', 'critico'].includes(student.current_risk_level)
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resumo da Semana</h1>
          <p className="text-muted-foreground">
            Acompanhe o progresso e prioridades dos seus alunos
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
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
              {mockCourses.map(course => (
                <SelectItem key={course.id} value={course.id}>
                  {course.short_name || course.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Weekly Indicators */}
      <WeeklyIndicators summary={mockWeeklySummary} />

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Priority List */}
        <PriorityList 
          overdueActions={overdueActions}
          upcomingTasks={upcomingTasks}
          criticalStudents={criticalStudents}
        />

        {/* Course Overview */}
        <CourseOverview courses={mockCourses} />
      </div>

      {/* Activity Feed */}
      <ActivityFeed items={mockActivityFeed} />
    </div>
  );
}
