import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';
import { getCourseLifecycleStatus, withEffectiveCourseDates } from '@/lib/course-dates';
import type { Student } from '@/features/students/types';

import {
  EMPTY_COURSE_PANEL_STATS,
  type Course,
  type CoursePanelData,
  type CourseWithStats,
  type StudentActivity,
} from '../types';

type AssociationRole = 'tutor' | 'viewer';

interface StudentCourseRow {
  student_id: string;
  enrollment_status: string | null;
  last_access: string | null;
  students: Student | null;
}

interface CatalogRpcRow {
  id: string;
  moodle_course_id: string;
  name: string;
  short_name: string | null;
  category: string | null;
  start_date: string | null;
  end_date: string | null;
  last_sync: string | null;
  created_at: string | null;
  updated_at: string | null;
  student_count: number;
  at_risk_count: number;
  is_following: boolean;
  is_ignored: boolean;
  is_attendance_enabled: boolean;
  student_ids: string[];
}

export async function listCatalogCoursesForUser(userId: string): Promise<CourseWithStats[]> {
  const { data, error } = await (supabase as SupabaseClient).rpc(
    'get_user_courses_catalog_with_stats',
    { p_user_id: userId },
  );

  if (error) throw error;
  if (!data || (data as CatalogRpcRow[]).length === 0) return [];

  const courses: Course[] = (data as CatalogRpcRow[]).map((row) => ({
    id: row.id,
    moodle_course_id: row.moodle_course_id,
    name: row.name,
    short_name: row.short_name,
    category: row.category,
    start_date: row.start_date,
    end_date: row.end_date,
    last_sync: row.last_sync,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const datedCourses = withEffectiveCourseDates(courses);

  return datedCourses.map((course, index) => {
    const row = (data as CatalogRpcRow[])[index];
    return {
      ...course,
      students_count: row.student_count,
      at_risk_count: row.at_risk_count,
      is_following: row.is_following,
      is_ignored: row.is_ignored,
      is_attendance_enabled: row.is_attendance_enabled,
      student_ids: row.student_ids ?? [],
    } as CourseWithStats;
  });
}

export async function setCourseAssociationRole(userId: string, courseId: string, role: AssociationRole) {
  const { error: deleteError } = await supabase
    .from('user_courses')
    .delete()
    .eq('user_id', userId)
    .eq('course_id', courseId);

  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase
    .from('user_courses')
    .insert({
      user_id: userId,
      course_id: courseId,
      role,
    });

  if (insertError) throw insertError;
}

export async function setCoursesAssociationRole(
  userId: string,
  courseIds: string[],
  role: AssociationRole,
) {
  if (courseIds.length === 0) return;

  const { error: deleteError } = await supabase
    .from('user_courses')
    .delete()
    .eq('user_id', userId)
    .in('course_id', courseIds);

  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase
    .from('user_courses')
    .insert(
      courseIds.map((courseId) => ({
        user_id: userId,
        course_id: courseId,
        role,
      })),
    );

  if (insertError) throw insertError;
}

export async function ignoreCourses(userId: string, courseIds: string[]) {
  if (courseIds.length === 0) return;

  const { error } = await supabase
    .from('user_ignored_courses')
    .insert(courseIds.map((courseId) => ({ user_id: userId, course_id: courseId })));

  if (error) throw error;
}

export async function unignoreCourses(userId: string, courseIds: string[]) {
  if (courseIds.length === 0) return;

  const { error } = await supabase
    .from('user_ignored_courses')
    .delete()
    .eq('user_id', userId)
    .in('course_id', courseIds);

  if (error) throw error;
}

export async function enableAttendanceForCourses(userId: string, courseIds: string[]) {
  if (courseIds.length === 0) return;

  const { error } = await (supabase as SupabaseClient)
    .from('attendance_course_settings')
    .insert(courseIds.map((courseId) => ({ user_id: userId, course_id: courseId })));

  if (error) throw error;
}

export async function disableAttendanceForCourses(userId: string, courseIds: string[]) {
  if (courseIds.length === 0) return;

  const { error } = await (supabase as SupabaseClient)
    .from('attendance_course_settings')
    .delete()
    .eq('user_id', userId)
    .in('course_id', courseIds);

  if (error) throw error;
}

export async function getCourseAttendanceEnabled(userId: string, courseId: string): Promise<boolean> {
  const { data, error } = await (supabase as SupabaseClient)
    .from('attendance_course_settings')
    .select('id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (error) throw error;

  return !!data;
}

export async function setCourseActivityVisibility(
  courseId: string,
  moodleActivityId: string,
  hidden: boolean,
) {
  const { error } = await supabase
    .from('student_activities')
    .update({ hidden })
    .eq('course_id', courseId)
    .eq('moodle_activity_id', moodleActivityId)
    .neq('activity_type', 'scorm');

  if (error) throw error;
}

export async function getCoursePanel(courseId: string): Promise<CoursePanelData> {
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
    const matchedCourseDates = withEffectiveCourseDates(courseDateRows as Course[]).find(
      (course) => course.id === courseId,
    );

    if (matchedCourseDates) {
      normalizedCourseData = {
        ...normalizedCourseData,
        effective_end_date: matchedCourseDates.effective_end_date,
      };
    }
  }

  const { data: studentCourseRows, error: studentsError } = await supabase
    .from('student_courses')
    .select(`
      student_id,
      enrollment_status,
      last_access,
      students (*)
    `)
    .eq('course_id', courseId);

  if (studentsError) throw studentsError;

  const students = ((studentCourseRows || []) as StudentCourseRow[])
    .map((entry) => {
      if (!entry.students) return null;

      return {
        ...entry.students,
        last_access: entry.last_access || entry.students.last_access,
      };
    })
    .filter((entry): entry is Student => entry !== null);

  const { data: activitiesData, error: activitiesError } = await supabase
    .from('student_activities')
    .select('*')
    .eq('course_id', courseId)
    .neq('activity_type', 'scorm')
    .order('activity_name');

  if (activitiesError) throw activitiesError;

  const activityRecords = (activitiesData || []) as StudentActivity[];
  const hasAnyGradebookData = activityRecords.some(
    (record) => record.grade_max !== null || record.percentage !== null || record.grade !== null,
  );

  const hasWeightByActivityId = new Map<string, boolean>();
  activityRecords.forEach((record) => {
    const contributesToGradebook = (record.grade_max ?? 0) > 0;
    const previous = hasWeightByActivityId.get(record.moodle_activity_id) ?? false;
    hasWeightByActivityId.set(record.moodle_activity_id, previous || contributesToGradebook);
  });

  const activities = activityRecords.reduce<StudentActivity[]>((accumulator, activity) => {
    if (accumulator.find((entry) => entry.moodle_activity_id === activity.moodle_activity_id)) {
      return accumulator;
    }

    const contributesToGradebook = hasWeightByActivityId.get(activity.moodle_activity_id) ?? false;
    accumulator.push({
      ...activity,
      hidden: hasAnyGradebookData ? !contributesToGradebook : activity.hidden,
    });

    return accumulator;
  }, []);

  const isCourseInProgress = getCourseLifecycleStatus(normalizedCourseData) === 'em_andamento';
  const riskDistribution = {
    normal: 0,
    atencao: 0,
    risco: 0,
    critico: 0,
  };

  if (isCourseInProgress) {
    students.forEach((student) => {
      const level = student.current_risk_level || 'normal';
      if (level in riskDistribution) {
        riskDistribution[level as keyof typeof riskDistribution] += 1;
      }
    });
  }

  const visibleActivityIds = new Set(
    activities
      .filter((activity) => !activity.hidden)
      .map((activity) => activity.moodle_activity_id),
  );
  const visibleActivityRecords = activityRecords.filter((activity) =>
    visibleActivityIds.has(activity.moodle_activity_id),
  );
  const completedActivities = visibleActivityRecords.filter(
    (activity) => activity.status === 'completed',
  ).length;

  return {
    course: normalizedCourseData,
    students,
    activities,
    activitySubmissions: activityRecords,
    stats: {
      ...EMPTY_COURSE_PANEL_STATS,
      totalStudents: students.length,
      atRiskStudents: riskDistribution.risco + riskDistribution.critico,
      totalActivities: activities.filter((activity) => !activity.hidden).length,
      completionRate: visibleActivityRecords.length > 0
        ? Math.round((completedActivities / visibleActivityRecords.length) * 100)
        : 0,
      riskDistribution,
    },
  };
}
