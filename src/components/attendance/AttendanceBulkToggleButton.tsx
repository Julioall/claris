import { CalendarCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface CourseWithAttendanceFlag {
  id: string;
  is_attendance_enabled?: boolean;
}

interface AttendanceBulkToggleButtonProps {
  courses: CourseWithAttendanceFlag[];
  level: 'escola' | 'curso' | 'turma';
  onToggleAttendanceMultiple?: (courseIds: string[], shouldEnable: boolean) => void;
}

export function AttendanceBulkToggleButton({
  courses,
  level,
  onToggleAttendanceMultiple,
}: AttendanceBulkToggleButtonProps) {
  if (!onToggleAttendanceMultiple) return null;

  const allEnabled = courses.length > 0 && courses.every((course) => !!course.is_attendance_enabled);
  const someEnabled = courses.some((course) => !!course.is_attendance_enabled) && !allEnabled;
  const shouldEnable = !allEnabled;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleAttendanceMultiple(courses.map((course) => course.id), shouldEnable);
    toast.success(
      shouldEnable
        ? `Presenca ativada para ${level}`
        : `Presenca desativada para ${level}`,
    );
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs"
      onClick={handleClick}
    >
      <CalendarCheck2 className="h-3.5 w-3.5 mr-1" />
      {allEnabled ? 'Desmarcar presenca' : someEnabled ? 'Marcar restante' : 'Marcar presenca'}
    </Button>
  );
}
