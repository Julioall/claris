import { supabase } from '@/integrations/supabase/client';
import { listAccessibleCourseIds } from '@/lib/course-access';

export interface TutorCourse {
  id: string;
  name: string;
  short_name: string | null;
  category: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface EnrollmentRow {
  student_id: string;
  course_id: string;
  enrollment_status: string | null;
  students: {
    full_name: string;
    last_access: string | null;
  } | null;
}

export interface ActivityGradeRow {
  student_id: string;
  course_id: string;
  activity_type: string | null;
  grade: number | null;
  grade_max: number | null;
  hidden: boolean;
  status: string | null;
  completed_at: string | null;
  graded_at: string | null;
  submitted_at: string | null;
}

export interface ActivityDetailRow extends ActivityGradeRow {
  moodle_activity_id: string;
  activity_name: string;
  activity_type: string | null;
  due_date: string | null;
  completed_at: string | null;
}

export interface CourseTotalRow {
  student_id: string;
  course_id: string;
  grade_raw: number | null;
  grade_percentage: number | null;
}

const PAGE_SIZE = 1000;

async function paginateRows<T>(fetchPage: (page: number) => Promise<{ data: T[] | null; error: Error | null }>) {
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

export async function fetchTutorCourses(userId: string): Promise<TutorCourse[]> {
  const accessibleCourseIds = await listAccessibleCourseIds(userId, 'tutor');

  if (accessibleCourseIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('courses')
    .select('id, name, short_name, category, start_date, end_date')
    .in('id', accessibleCourseIds);

  if (error) {
    throw error;
  }

  const normalizedCourses = (data ?? []).map((course) => ({
    id: course.id,
    name: course.name,
    short_name: course.short_name,
    category: course.category,
    start_date: course.start_date,
    end_date: course.end_date,
  }));

  const uniqueById = new Map<string, TutorCourse>();

  normalizedCourses.forEach((course) => {
    uniqueById.set(course.id, course);
  });

  return Array.from(uniqueById.values()).sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}

export async function fetchAllReportEnrollments(courseIds: string[]) {
  return paginateRows<EnrollmentRow>(async (page) => {
    const { data, error } = await supabase
      .from('student_courses')
      .select(`
        student_id,
        course_id,
        enrollment_status,
        students!inner(full_name, last_access)
      `)
      .in('course_id', courseIds)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    return { data: (data ?? []) as EnrollmentRow[], error };
  });
}

export async function fetchAllReportActivityGrades(courseIds: string[]) {
  return paginateRows<ActivityGradeRow>(async (page) => {
    const { data, error } = await supabase
      .from('student_activities')
      .select(`
        student_id,
        course_id,
        activity_type,
        grade,
        grade_max,
        hidden,
        status,
        completed_at,
        graded_at,
        submitted_at
      `)
      .in('course_id', courseIds)
      .neq('activity_type', 'scorm')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    return { data: (data ?? []) as ActivityGradeRow[], error };
  });
}

export async function fetchAllReportActivityDetails(courseIds: string[]) {
  return paginateRows<ActivityDetailRow>(async (page) => {
    const { data, error } = await supabase
      .from('student_activities')
      .select('student_id, course_id, moodle_activity_id, activity_name, activity_type, status, grade, grade_max, due_date, hidden, completed_at, graded_at, submitted_at')
      .in('course_id', courseIds)
      .neq('activity_type', 'scorm')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    return { data: (data ?? []) as ActivityDetailRow[], error };
  });
}

export async function fetchAllReportCourseTotals(courseIds: string[]) {
  return paginateRows<CourseTotalRow>(async (page) => {
    const { data, error } = await supabase
      .from('student_course_grades')
      .select('student_id, course_id, grade_raw, grade_percentage')
      .in('course_id', courseIds)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    return { data: (data ?? []) as CourseTotalRow[], error };
  });
}
