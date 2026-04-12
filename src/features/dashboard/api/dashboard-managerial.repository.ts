import { supabase } from '@/integrations/supabase/client';
import type { RiskLevel } from '@/features/students/types';

interface EnrollmentRow {
  student_id: string;
  course_id: string;
  enrollment_status: string | null;
}

interface CourseGradeRow {
  student_id: string;
  course_id: string;
  grade_percentage: number | null;
  grade_raw: number | null;
  updated_at: string;
}

interface ActivityRow {
  student_id: string;
  course_id: string;
  activity_type: string | null;
  status: string | null;
  grade: number | null;
  grade_max: number | null;
  percentage: number | null;
  completed_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  hidden: boolean;
}

interface UserCourseRow {
  user_id: string;
  course_id: string;
  role: string | null;
  users: {
    full_name: string;
  } | null;
}

interface ActivityFeedRow {
  id: string;
  student_id: string | null;
  course_id: string | null;
  user_id: string | null;
  event_type: string;
  description: string | null;
  created_at: string | null;
}

interface StudentRiskRow {
  id: string;
  current_risk_level: RiskLevel;
}

interface RiskHistoryRow {
  student_id: string;
  created_at: string | null;
  previous_level: RiskLevel | null;
  new_level: RiskLevel;
}

export interface DashboardManagerialRawData {
  enrollments: EnrollmentRow[];
  courseGrades: CourseGradeRow[];
  activities: ActivityRow[];
  userCourses: UserCourseRow[];
  activityFeed: ActivityFeedRow[];
  studentsRisk: StudentRiskRow[];
  riskHistory: RiskHistoryRow[];
}

interface DashboardManagerialQueryInput {
  courseIds: string[];
}

const PAGE_SIZE = 1000;
const DASHBOARD_BATCH_SIZE = 120;

const EMPTY_DATA: DashboardManagerialRawData = {
  enrollments: [],
  courseGrades: [],
  activities: [],
  userCourses: [],
  activityFeed: [],
  studentsRisk: [],
  riskHistory: [],
};

function chunkValues<T>(values: T[], size = DASHBOARD_BATCH_SIZE) {
  const uniqueValues = Array.from(new Set(values));
  const chunks: T[][] = [];

  for (let index = 0; index < uniqueValues.length; index += size) {
    chunks.push(uniqueValues.slice(index, index + size));
  }

  return chunks;
}

async function paginateRows<T>(
  fetchPage: (page: number) => Promise<{ data: T[] | null; error: Error | null }>,
) {
  const rows: T[] = [];
  let page = 0;

  while (true) {
    const { data, error } = await fetchPage(page);

    if (error) {
      throw error;
    }

    rows.push(...(data ?? []));

    if (!data || data.length < PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return rows;
}

async function fetchAllEnrollments(courseIds: string[]) {
  const results = await Promise.all(
    chunkValues(courseIds).map((courseIdBatch) => paginateRows<EnrollmentRow>(async (page) => {
      const { data, error } = await supabase
        .from('student_courses')
        .select('student_id, course_id, enrollment_status')
        .in('course_id', courseIdBatch)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      return { data: (data ?? []) as EnrollmentRow[], error };
    })),
  );

  return results.flat();
}

async function fetchAllCourseGrades(courseIds: string[]) {
  const results = await Promise.all(
    chunkValues(courseIds).map((courseIdBatch) => paginateRows<CourseGradeRow>(async (page) => {
      const { data, error } = await supabase
        .from('student_course_grades')
        .select('student_id, course_id, grade_percentage, grade_raw, updated_at')
        .in('course_id', courseIdBatch)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      return { data: (data ?? []) as CourseGradeRow[], error };
    })),
  );

  return results.flat();
}

async function fetchAllActivities(courseIds: string[]) {
  const results = await Promise.all(
    chunkValues(courseIds).map((courseIdBatch) => paginateRows<ActivityRow>(async (page) => {
      const { data, error } = await supabase
        .from('student_activities')
        .select('student_id, course_id, activity_type, status, grade, grade_max, percentage, completed_at, submitted_at, graded_at, hidden')
        .in('course_id', courseIdBatch)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      return { data: (data ?? []) as ActivityRow[], error };
    })),
  );

  return results.flat();
}

async function fetchAllUserCourses(courseIds: string[]) {
  const results = await Promise.all(
    chunkValues(courseIds).map(async (courseIdBatch) => {
      const { data, error } = await supabase
        .from('user_courses')
        .select('user_id, course_id, role, users!inner(full_name)')
        .in('course_id', courseIdBatch);

      if (error) throw error;

      return (data ?? []) as UserCourseRow[];
    }),
  );

  return results.flat();
}

async function fetchAllActivityFeed(courseIds: string[]) {
  const results = await Promise.all(
    chunkValues(courseIds).map((courseIdBatch) => paginateRows<ActivityFeedRow>(async (page) => {
      const { data, error } = await supabase
        .from('activity_feed')
        .select('id, student_id, course_id, user_id, event_type, description, created_at')
        .in('course_id', courseIdBatch)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      return { data: (data ?? []) as ActivityFeedRow[], error };
    })),
  );

  return results.flat();
}

async function fetchStudentsRisk(studentIds: string[]) {
  if (studentIds.length === 0) return [];

  const results = await Promise.all(
    chunkValues(studentIds).map(async (studentIdBatch) => {
      const { data, error } = await supabase
        .from('students')
        .select('id, current_risk_level')
        .in('id', studentIdBatch);

      if (error) throw error;

      return (data ?? []) as StudentRiskRow[];
    }),
  );

  return results.flat();
}

async function fetchRiskHistory(studentIds: string[]) {
  if (studentIds.length === 0) return [];

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const results = await Promise.all(
    chunkValues(studentIds).map((studentIdBatch) => paginateRows<RiskHistoryRow>(async (page) => {
      const { data, error } = await supabase
        .from('risk_history')
        .select('student_id, created_at, previous_level, new_level')
        .in('student_id', studentIdBatch)
        .gte('created_at', sixMonthsAgo.toISOString())
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      return { data: (data ?? []) as RiskHistoryRow[], error };
    })),
  );

  return results.flat();
}

export const dashboardManagerialRepository = {
  async getManagerialRawData({ courseIds }: DashboardManagerialQueryInput): Promise<DashboardManagerialRawData> {
    if (courseIds.length === 0) {
      return { ...EMPTY_DATA };
    }

    const [enrollments, courseGrades, activities, userCourses, activityFeed] = await Promise.all([
      fetchAllEnrollments(courseIds),
      fetchAllCourseGrades(courseIds),
      fetchAllActivities(courseIds),
      fetchAllUserCourses(courseIds),
      fetchAllActivityFeed(courseIds),
    ]);

    const studentIds = Array.from(new Set(enrollments.map((row) => row.student_id)));
    const [studentsRisk, riskHistory] = await Promise.all([
      fetchStudentsRisk(studentIds),
      fetchRiskHistory(studentIds),
    ]);

    return {
      enrollments,
      courseGrades,
      activities,
      userCourses,
      activityFeed,
      studentsRisk,
      riskHistory,
    };
  },
};
