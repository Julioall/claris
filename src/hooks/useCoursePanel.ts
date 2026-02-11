import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Course, Student } from '@/types';
import { toast } from '@/hooks/use-toast';

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
  const { moodleSession } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [activities, setActivities] = useState<StudentActivity[]>([]);
  const [stats, setStats] = useState<CourseStats>(defaultStats);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
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
      // Fetch course
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (courseError) throw courseError;
      setCourse(courseData);

      // Fetch students in this course (with enrollment status and course-specific last access)
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

      // Separate active and all students
      const allStudentCourses = studentCoursesData || [];
      const activeStudentCourses = allStudentCourses.filter(sc => sc.enrollment_status !== 'suspenso');
      
      const studentsData = activeStudentCourses
        ?.map(sc => {
          if (!sc.students) return null;
          return {
            ...(sc.students as any),
            // Override last_access with course-specific last access if available
            last_access: sc.last_access || (sc.students as any).last_access,
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null) || [];
      
      setStudents(studentsData as Student[]);

      // Fetch activities for this course
      const { data: activitiesData, error: activitiesError } = await supabase
        .from('student_activities')
        .select('*')
        .eq('course_id', courseId)
        .order('activity_name');

      if (activitiesError) throw activitiesError;

      // Get unique activities (group by moodle_activity_id)
      const uniqueActivities = activitiesData?.reduce((acc, activity) => {
        if (!acc.find(a => a.moodle_activity_id === activity.moodle_activity_id)) {
          acc.push(activity);
        }
        return acc;
      }, [] as StudentActivity[]) || [];

      setActivities(uniqueActivities);

      // Calculate stats
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

      // Only count visible activities for metrics
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

  const syncCourse = useCallback(async () => {
    if (!course || !moodleSession) {
      toast({
        title: "Erro",
        description: "Sessão expirada. Faça login novamente.",
        variant: "destructive",
      });
      return;
    }

    setIsSyncing(true);

    try {
      // Sync students
      toast({
        title: "Sincronizando alunos...",
        description: `Buscando alunos do curso ${course.name}`,
      });

      const { data: studentsData, error: studentsError } = await supabase.functions.invoke('moodle-api', {
        body: {
          action: 'sync_students',
          moodleUrl: moodleSession.moodleUrl,
          token: moodleSession.moodleToken,
          courseId: parseInt(course.moodle_course_id, 10),
        },
      });

      if (studentsError) throw studentsError;

      // Sync activities
      toast({
        title: "Sincronizando atividades...",
        description: `Buscando atividades do curso ${course.name}`,
      });

      const { data: activitiesData, error: activitiesError } = await supabase.functions.invoke('moodle-api', {
        body: {
          action: 'sync_activities',
          moodleUrl: moodleSession.moodleUrl,
          token: moodleSession.moodleToken,
          courseId: parseInt(course.moodle_course_id, 10),
        },
      });

      if (activitiesError) throw activitiesError;

      // Recalculate risk for all students in this course
      toast({
        title: "Recalculando riscos...",
        description: `Atualizando níveis de risco dos alunos`,
      });

      const { data: riskUpdateResult, error: riskError } = await supabase
        .rpc('update_course_students_risk', { p_course_id: course.id });

      if (riskError) {
        console.error('Error updating risk:', riskError);
        // Don't throw - risk calculation is not critical
      }

      // Update course last_sync
      await supabase
        .from('courses')
        .update({ last_sync: new Date().toISOString() })
        .eq('id', course.id);

      toast({
        title: "Sincronização concluída",
        description: `${studentsData?.students?.length || 0} alunos e ${activitiesData?.activitiesCount || 0} atividades sincronizadas. Riscos recalculados.`,
      });

      // Refresh data
      await fetchCourseData();

    } catch (err) {
      console.error('Sync error:', err);
      toast({
        title: "Erro na sincronização",
        description: err instanceof Error ? err.message : "Não foi possível sincronizar o curso.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  }, [course, moodleSession, fetchCourseData]);

  const toggleActivityVisibility = useCallback(async (moodleActivityId: string, hidden: boolean) => {
    if (!courseId) return;

    try {
      // Update all student_activities with this moodle_activity_id in this course
      const { error: updateError } = await supabase
        .from('student_activities')
        .update({ hidden })
        .eq('course_id', courseId)
        .eq('moodle_activity_id', moodleActivityId);

      if (updateError) throw updateError;

      // Update local state
      setActivities(prev => 
        prev.map(a => 
          a.moodle_activity_id === moodleActivityId 
            ? { ...a, hidden } 
            : a
        )
      );

      toast({
        title: hidden ? "Atividade oculta" : "Atividade visível",
        description: hidden 
          ? "Esta atividade não será contabilizada nas métricas." 
          : "Esta atividade será contabilizada nas métricas.",
      });

      // Refresh data to update stats
      await fetchCourseData();

    } catch (err) {
      console.error('Error toggling activity visibility:', err);
      toast({
        title: "Erro",
        description: "Não foi possível alterar a visibilidade da atividade.",
        variant: "destructive",
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
    stats,
    isLoading,
    isSyncing,
    error,
    syncCourse,
    refetch: fetchCourseData,
    toggleActivityVisibility,
  };
}
