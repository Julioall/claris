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

interface UserCourseRow {
  course_id: string;
  role: AssociationRole;
}

interface IgnoredCourseRow {
  course_id: string;
}

interface AttendanceCourseRow {
  course_id: string;
}

interface StudentIdRow {
  student_id: string;
}

interface StudentCourseRiskRow {
  students: {
    current_risk_level: string;
  } | null;
}

interface StudentCourseRow {
  student_id: string;
  enrollment_status: string | null;
  last_access: string | null;
  students: Student | null;
}

async function listCourseStudentIds(courseId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('student_courses')
    .select('student_id')
    .eq('course_id', courseId);

  if (error) throw error;

  return ((data || []) as StudentIdRow[]).map((entry) => entry.student_id);
}

async function countAtRiskStudents(courseId: string): Promise<number> {
  const { data, error } = await supabase
    .from('student_courses')
    .select(`
      student_id,
      students!inner (current_risk_level)
    `)
    .eq('course_id', courseId);

  if (error) throw error;

  return ((data || []) as StudentCourseRiskRow[]).filter(
    (entry) => entry.students && ['risco', 'critico'].includes(entry.students.current_risk_level),
  ).length;
}

export async function listCatalogCoursesForUser(userId: string): Promise<CourseWithStats[]> {
  const { data: userCourses, error: userCoursesError } = await supabase
    .from('user_courses')
    .select('course_id, role')
    .eq('user_id', userId);

  if (userCoursesError) throw userCoursesError;

  const { data: allCourses, error: coursesError } = await supabase
    .from('courses')
    .select('*')
    .order('name');

  if (coursesError) throw coursesError;

  if (!allCourses || allCourses.length === 0) {
    return [];
  }

  const { data: ignoredCourses, error: ignoredCoursesError } = await supabase
    .from('user_ignored_courses')
    .select('course_id')
    .eq('user_id', userId);

  if (ignoredCoursesError) throw ignoredCoursesError;

  const { data: attendanceCourses, error: attendanceCoursesError } = await (supabase as SupabaseClient)
    .from('attendance_course_settings')
    .select('course_id')
    .eq('user_id', userId);

  if (attendanceCoursesError) throw attendanceCoursesError;

  const followedCourseIds = new Set(
    ((userCourses || []) as UserCourseRow[])
      .filter((entry) => entry.role === 'tutor')
      .map((entry) => entry.course_id),
  );
  const ignoredCourseIds = new Set(((ignoredCourses || []) as IgnoredCourseRow[]).map((entry) => entry.course_id));
  const attendanceCourseIds = new Set(
    ((attendanceCourses || []) as AttendanceCourseRow[]).map((entry) => entry.course_id),
  );

  const datedCourses = withEffectiveCourseDates(allCourses as Course[]);

  return Promise.all(
    datedCourses.map(async (course) => {
      const studentIds = await listCourseStudentIds(course.id);
      const isCourseInProgress = getCourseLifecycleStatus(course) === 'em_andamento';
      const atRiskCount = isCourseInProgress ? await countAtRiskStudents(course.id) : 0;

      return {
        ...course,
        students_count: studentIds.length,
        at_risk_count: atRiskCount,
        is_following: followedCourseIds.has(course.id),
        is_ignored: ignoredCourseIds.has(course.id),
        is_attendance_enabled: attendanceCourseIds.has(course.id),
        student_ids: studentIds,
      } as CourseWithStats;
    }),
  );
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
