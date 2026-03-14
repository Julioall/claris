import { Badge } from '@/components/ui/badge';
import { CourseDateLike, CourseLifecycleStatus, getCourseLifecycleStatus } from '@/lib/course-dates';
import { cn } from '@/lib/utils';

const COURSE_LIFECYCLE_LABELS: Record<CourseLifecycleStatus, string> = {
  finalizada: 'Finalizada',
  em_andamento: 'Em andamento',
  nao_iniciada: 'Nao iniciada',
};

const COURSE_LIFECYCLE_STYLES: Record<CourseLifecycleStatus, string> = {
  finalizada: 'border-slate-300 bg-slate-100 text-slate-700',
  em_andamento: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  nao_iniciada: 'border-amber-200 bg-amber-50 text-amber-700',
};

interface CourseLifecycleBadgeProps {
  course: CourseDateLike;
  className?: string;
}

export function CourseLifecycleBadge({ course, className }: CourseLifecycleBadgeProps) {
  const status = getCourseLifecycleStatus(course);

  return (
    <Badge
      variant="outline"
      className={cn('w-fit', COURSE_LIFECYCLE_STYLES[status], className)}
    >
      {COURSE_LIFECYCLE_LABELS[status]}
    </Badge>
  );
}
