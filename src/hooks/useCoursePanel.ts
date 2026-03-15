import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Course, Student } from '@/types';
import { toast } from '@/hooks/use-toast';
import { withEffectiveCourseDates } from '@/lib/course-dates';

interface StudentActivity {
  id: string;
  student_id: string;
  course_id: string;
  moodle_activity_id: string;
  activity_name: string;
  activity_type: string | null;
  grade: number | null;
  grade_max: number | null;
  percentage: number | null;
  status: string | null;
  completed_at: string | null;
  submitted_at?: string | null;
  graded_at?: string | null;
  due_date: string | null;
  hidden: boolean;
}

interface CourseStats {
  totalStudents: number;
  atRiskStudents: number;
  totalActivities: number;
  completionRate: number;
  riskDistribution: {
    normal: number;
    atencao: number;
    risco: number;
    critico: number;
  };
}

const defaultStats: CourseStats = {
  totalStudents: 0,
  atRiskStudents: 0,
  totalActivities: 0,
  completionRate: 0,
  riskDistribution: {
    normal: 0,
    atencao: 0,
    risco: 0,
    critico: 0,
  },
};

export function useCoursePanel(courseId: string | undefined) {
  const [course, setCourse] = useState<Course | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [activities, setActivities] = useState<StudentActivity[]>([]);
  const [activitySubmissions, setActivitySubmissions] = useState<StudentActivity[]>([]);
  const [stats, setStats] = useState<CourseStats>(defaultStats);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCourseData = useCallback(async () => {
    if (!courseId) {
      setError('ID do curso não fornecido');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (courseError) throw courseError;

      let normalizedCourseData = courseData as Course;
      const { data: courseDateRows, error: courseDateRowsError } = await supabase
        .from('courses')
        .select('id, category, start_date, end_date');

      if (!courseDateRowsError && courseDateRows) {
        const matchedCourseDates = withEffectiveCourseDates(courseDateRows).find(course => course.id === courseId);
        if (matchedCourseDates) {
          normalizedCourseData = {
            ...courseData,
            effective_end_date: matchedCourseDates.effective_end_date,
          };
        }
      }

      setCourse(normalizedCourseData);

      const { data: studentCoursesData, error: studentsError } = await supabase
        .from('student_courses')
        .select(`
          student_id,
          enrollment_status,
          last_access,
          students (*)
        `)
        .eq('course_id', courseId);

      if (studentsError) throw studentsError;

      const allStudentCourses = studentCoursesData || [];
      const activeStudentCourses = allStudentCourses.filter(sc => sc.enrollment_status !== 'suspenso');

      const studentsData = activeStudentCourses
        ?.map(sc => {
          if (!sc.students) return null;
          const student = sc.students as unknown as Student;
          return {
            ...student,
            last_access: sc.last_access || student.last_access,
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null) || [];

      setStudents(studentsData as Student[]);

      const { data: activitiesData, error: activitiesError } = await supabase
        .from('student_activities')
        .select('*')
        .eq('course_id', courseId)
        .neq('activity_type', 'scorm')
        .order('activity_name');

      if (activitiesError) throw activitiesError;

      const activityRecords = (activitiesData as StudentActivity[]) || [];
      setActivitySubmissions(activityRecords);

      const uniqueActivities = activityRecords.reduce((acc, activity) => {
        if (!acc.find(a => a.moodle_activity_id === activity.moodle_activity_id)) {
          acc.push(activity);
        }
        return acc;
      }, [] as StudentActivity[]) || [];

      setActivities(uniqueActivities);

      const riskDistribution = {
        normal: 0,
        atencao: 0,
        risco: 0,
        critico: 0,
      };

      studentsData.forEach((student: Student) => {
        const level = student.current_risk_level || 'normal';
        if (level in riskDistribution) {
          riskDistribution[level as keyof typeof riskDistribution]++;
        }
      });

      const visibleActivities = activitiesData?.filter(a => !a.hidden) || [];
      const completedActivities = visibleActivities.filter(a => a.status === 'completed').length;
      const totalActivityRecords = visibleActivities.length;

      setStats({
        totalStudents: studentsData.length,
        atRiskStudents: riskDistribution.risco + riskDistribution.critico,
        totalActivities: uniqueActivities.filter(a => !a.hidden).length,
        completionRate: totalActivityRecords > 0
          ? Math.round((completedActivities / totalActivityRecords) * 100)
          : 0,
        riskDistribution,
      });
    } catch (err) {
      console.error('Error fetching course data:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados do curso');
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

  const toggleActivityVisibility = useCallback(async (moodleActivityId: string, hidden: boolean) => {
    if (!courseId) return;

    try {
      const { error: updateError } = await supabase
        .from('student_activities')
        .update({ hidden })
        .eq('course_id', courseId)
        .eq('moodle_activity_id', moodleActivityId)
        .neq('activity_type', 'scorm');

      if (updateError) throw updateError;

      setActivities(prev =>
        prev.map(a =>
          a.moodle_activity_id === moodleActivityId
            ? { ...a, hidden }
            : a
        )
      );

      toast({
        title: hidden ? 'Atividade oculta' : 'Atividade visível',
        description: hidden
          ? 'Esta atividade não será contabilizada nas métricas.'
          : 'Esta atividade será contabilizada nas métricas.',
      });

      await fetchCourseData();
    } catch (err) {
      console.error('Error toggling activity visibility:', err);
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar a visibilidade da atividade.',
        variant: 'destructive',
      });
    }
  }, [courseId, fetchCourseData]);


  useEffect(() => {
    fetchCourseData();
  }, [fetchCourseData]);

  return {
    course,
    students,
    activities,
    activitySubmissions,
    stats,
    isLoading,
    error,
    refetch: fetchCourseData,
    toggleActivityVisibility,
  };
}
