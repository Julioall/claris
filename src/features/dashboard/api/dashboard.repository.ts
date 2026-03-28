import { endOfDay, startOfDay, startOfWeek, subWeeks } from 'date-fns';

import { supabase } from '@/integrations/supabase/client';
import {
  isStudentActivityPendingCorrection,
  isStudentActivityPendingSubmission,
  isStudentActivityWeightedInGradebook,
} from '@/lib/student-activity-status';
import { listAccessibleCourseIds } from '@/lib/course-access';
import type { RiskLevel, Student } from '@/features/students/types';

import type {
  ActivityFeedItem,
  DashboardData,
  DashboardReviewActivity,
  DashboardWeekFilter,
  WeeklySummary,
} from '../types';

type FeedStudentSummary = {
  id: string;
  full_name: string;
};

type AtRiskStudentRow = {
  id: string;
  moodle_user_id: string;
  full_name: string;
  email?: string | null;
  avatar_url?: string | null;
  current_risk_level: RiskLevel;
  risk_reasons?: string[] | null;
  tags?: string[] | null;
  last_access?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ReviewActivityStudentSummary = {
  id: string;
  full_name: string;
  current_risk_level: RiskLevel | null;
};

type ReviewActivityCourseSummary = {
  id: string;
  name: string;
  short_name?: string | null;
};

type ReviewActivityRow = {
  id: string;
  student_id: string;
  course_id: string;
  activity_name: string;
  activity_type: string | null;
  grade: number | null;
  grade_max: number | null;
  due_date: string | null;
  completed_at: string | null;
  graded_at: string | null;
  percentage: number | null;
  status: string | null;
  submitted_at: string | null;
  students: ReviewActivityStudentSummary | null;
  courses: ReviewActivityCourseSummary | null;
};

type PendingAssignmentRow = {
  id: string;
  activity_type: string | null;
  grade: number | null;
  grade_max: number | null;
  status: string | null;
  completed_at: string | null;
  percentage: number | null;
  submitted_at: string | null;
  graded_at: string | null;
};

type DashboardCourseActivityAggregateRow = {
  course_id: string;
  pending_submission_assignments: number;
  pending_correction_assignments: number;
};

type StudentCourseRow = {
  student_id: string;
  enrollment_status: string | null;
};

interface DashboardDataQueryInput {
  userId: string;
  selectedWeek?: DashboardWeekFilter;
  courseFilter?: string;
}

const PAGE_SIZE = 1000;
const DASHBOARD_BATCH_SIZE = 120;

const EMPTY_SUMMARY: WeeklySummary = {
  today_events: 0,
  today_tasks: 0,
  activities_to_review: 0,
  active_normal_students: 0,
  pending_submission_assignments: 0,
  pending_correction_assignments: 0,
  students_at_risk: 0,
  new_at_risk_this_week: 0,
};

const EMPTY_DASHBOARD_DATA: DashboardData = {
  summary: { ...EMPTY_SUMMARY },
  criticalStudents: [],
  activitiesToReview: [],
  activityFeed: [],
};

function normalizeEnrollmentStatus(status: string | null | undefined) {
  return (status || '').trim().toLowerCase();
}

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

async function fetchAllDashboardStudentCourses(courseIds: string[]) {
  const results = await Promise.all(
    chunkValues(courseIds).map((courseIdBatch) => paginateRows<StudentCourseRow>(async (page) => {
      const { data, error } = await supabase
        .from('student_courses')
        .select('student_id, enrollment_status')
        .in('course_id', courseIdBatch)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      return { data: (data ?? []) as StudentCourseRow[], error };
    })),
  );

  return results.flat();
}

async function listStudentsAtRisk(studentIds: string[]) {
  const results = await Promise.all(
    chunkValues(studentIds).map(async (studentIdBatch) => {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .in('id', studentIdBatch)
        .in('current_risk_level', ['risco', 'critico']);

      if (error) throw error;
      return (data ?? []) as AtRiskStudentRow[];
    }),
  );

  return results.flat();
}

async function countActiveNormalStudents(studentIds: string[]) {
  const counts = await Promise.all(
    chunkValues(studentIds).map(async (studentIdBatch) => {
      const { count, error } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .in('id', studentIdBatch)
        .eq('current_risk_level', 'normal');

      if (error) throw error;
      return count ?? 0;
    }),
  );

  return counts.reduce((total, count) => total + count, 0);
}

async function countNewAtRiskStudents(studentIds: string[], weekStartIso: string) {
  const counts = await Promise.all(
    chunkValues(studentIds).map(async (studentIdBatch) => {
      const { count, error } = await supabase
        .from('risk_history')
        .select('*', { count: 'exact', head: true })
        .in('student_id', studentIdBatch)
        .in('new_level', ['risco', 'critico'])
        .gte('created_at', weekStartIso);

      if (error) throw error;
      return count ?? 0;
    }),
  );

  return counts.reduce((total, count) => total + count, 0);
}

async function listActivityFeedItems(userId: string, studentIds: string[], courseFilter?: string) {
  const ownFeedQuery = supabase
    .from('activity_feed')
    .select(`
      *,
      students (id, full_name)
    `)
    .eq('user_id', userId);

  const { data: ownFeed, error: ownFeedError } = await (courseFilter
    ? ownFeedQuery.eq('course_id', courseFilter)
    : ownFeedQuery)
    .order('created_at', { ascending: false })
    .limit(20);

  if (ownFeedError) throw ownFeedError;

  const studentFeedResults = await Promise.all(
    chunkValues(studentIds).map(async (studentIdBatch) => {
      const studentFeedQuery = supabase
        .from('activity_feed')
        .select(`
          *,
          students (id, full_name)
        `)
        .in('student_id', studentIdBatch);

      const { data, error } = await (courseFilter
        ? studentFeedQuery.eq('course_id', courseFilter)
        : studentFeedQuery)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    }),
  );

  const merged = [...((ownFeed ?? []) as Array<Record<string, unknown>>), ...studentFeedResults.flat()];
  const uniqueById = new Map<string, Record<string, unknown>>();

  merged.forEach((item) => {
    const itemId = typeof item.id === 'string' ? item.id : null;
    if (!itemId || uniqueById.has(itemId)) return;
    uniqueById.set(itemId, item);
  });

  return Array.from(uniqueById.values())
    .sort((left, right) => {
      const leftDate = new Date(String(left.created_at ?? '')).getTime();
      const rightDate = new Date(String(right.created_at ?? '')).getTime();
      return rightDate - leftDate;
    })
    .slice(0, 20);
}

async function listPendingAssignments(courseIds: string[]) {
  const results = await Promise.all(
    chunkValues(courseIds).map((courseIdBatch) => paginateRows<PendingAssignmentRow>(async (page) => {
      const { data, error } = await supabase
        .from('student_activities')
        .select('id, student_id, activity_type, grade, grade_max, percentage, status, completed_at, submitted_at, graded_at')
        .in('course_id', courseIdBatch)
        .eq('activity_type', 'assign')
        .not('due_date', 'is', null)
        .lt('due_date', new Date().toISOString())
        .eq('hidden', false)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      return { data: (data ?? []) as PendingAssignmentRow[], error };
    })),
  );

  return results.flat();
}

async function listUncorrectedActivities(courseIds: string[]) {
  const results = await Promise.all(
    chunkValues(courseIds).map((courseIdBatch) => paginateRows<ReviewActivityRow>(async (page) => {
      const { data, error } = await supabase
        .from('student_activities')
        .select(`
          id,
          student_id,
          course_id,
          activity_name,
          activity_type,
          grade,
          grade_max,
          due_date,
          completed_at,
          graded_at,
          percentage,
          status,
          submitted_at,
          students!inner (id, full_name, current_risk_level),
          courses!inner (id, name, short_name)
        `)
        .in('course_id', courseIdBatch)
        .eq('activity_type', 'assign')
        .eq('hidden', false)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      return { data: (data ?? []) as ReviewActivityRow[], error };
    })),
  );

  return results.flat();
}

async function listDashboardAggregates(courseIds: string[]) {
  const results = await Promise.all(
    chunkValues(courseIds).map(async (courseIdBatch) => {
      const { data, error } = await supabase
        .from('dashboard_course_activity_aggregates')
        .select('course_id, pending_submission_assignments, pending_correction_assignments')
        .in('course_id', courseIdBatch);

      if (error) throw error;
      return (data ?? []) as DashboardCourseActivityAggregateRow[];
    }),
  );

  return results.flat();
}

function mapActivityFeedItems(items: Array<Record<string, unknown>>): ActivityFeedItem[] {
  return items.map((item) => {
    const feedStudent = item.students as FeedStudentSummary | null;

    return {
      id: item.id as string,
      user_id: (item.user_id as string) || undefined,
      student_id: (item.student_id as string) || undefined,
      course_id: (item.course_id as string) || undefined,
      event_type: item.event_type as string,
      title: item.title as string,
      description: (item.description as string) || undefined,
      metadata: item.metadata as Record<string, unknown> | undefined,
      created_at: (item.created_at as string) || new Date().toISOString(),
      student: feedStudent
        ? {
            id: feedStudent.id,
            moodle_user_id: '',
            full_name: feedStudent.full_name,
            current_risk_level: 'normal' as RiskLevel,
            created_at: '',
            updated_at: '',
          }
        : undefined,
    };
  });
}

function mapCriticalStudents(items: AtRiskStudentRow[]): Student[] {
  return items
    .map((student) => ({
      id: student.id,
      moodle_user_id: student.moodle_user_id,
      full_name: student.full_name,
      email: student.email || undefined,
      avatar_url: student.avatar_url || undefined,
      current_risk_level: student.current_risk_level,
      risk_reasons: student.risk_reasons || undefined,
      tags: student.tags || undefined,
      last_access: student.last_access || undefined,
      created_at: student.created_at || new Date().toISOString(),
      updated_at: student.updated_at || new Date().toISOString(),
    }))
    .sort((studentA, studentB) => {
      const riskOrder: Record<RiskLevel, number> = {
        critico: 0,
        risco: 1,
        atencao: 2,
        normal: 3,
        inativo: 4,
      };

      return riskOrder[studentA.current_risk_level] - riskOrder[studentB.current_risk_level];
    });
}

function mapActivitiesToReview(items: ReviewActivityRow[]): DashboardReviewActivity[] {
  return items
    .map((activity) => {
      const relatedStudent = activity.students;
      const relatedCourse = activity.courses;

      return {
        id: activity.id,
        activity_name: activity.activity_name,
        student_id: activity.student_id,
        course_id: activity.course_id,
        due_date: activity.due_date || undefined,
        submitted_at: activity.submitted_at || undefined,
        student: {
          id: relatedStudent?.id || activity.student_id,
          full_name: relatedStudent?.full_name || 'Aluno sem nome',
          current_risk_level: (relatedStudent?.current_risk_level || 'normal') as RiskLevel,
        },
        course: {
          id: relatedCourse?.id || activity.course_id,
          name: relatedCourse?.name || 'Curso',
          short_name: relatedCourse?.short_name || undefined,
        },
      };
    })
    .sort((activityA, activityB) => {
      const dueDateA = activityA.due_date
        ? new Date(activityA.due_date).getTime()
        : Number.POSITIVE_INFINITY;
      const dueDateB = activityB.due_date
        ? new Date(activityB.due_date).getTime()
        : Number.POSITIVE_INFINITY;

      if (dueDateA !== dueDateB) {
        return dueDateA - dueDateB;
      }

      const submittedAtA = activityA.submitted_at
        ? new Date(activityA.submitted_at).getTime()
        : Number.POSITIVE_INFINITY;
      const submittedAtB = activityB.submitted_at
        ? new Date(activityB.submitted_at).getTime()
        : Number.POSITIVE_INFINITY;

      return submittedAtA - submittedAtB;
    });
}

export const dashboardRepository = {
  async getDashboardData({
    userId,
    selectedWeek = 'current',
    courseFilter,
  }: DashboardDataQueryInput): Promise<DashboardData> {
    const normalizedCourseFilter = courseFilter && courseFilter !== 'all'
      ? courseFilter
      : undefined;

    const now = new Date();
    const weekStart = selectedWeek === 'current'
      ? startOfWeek(now, { weekStartsOn: 1 })
      : startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

    const userCourseIds = await listAccessibleCourseIds(userId, 'tutor');

    const courseIds = normalizedCourseFilter
      ? [normalizedCourseFilter]
      : userCourseIds;

    if (courseIds.length === 0) {
      return {
        ...EMPTY_DASHBOARD_DATA,
        summary: { ...EMPTY_SUMMARY },
      };
    }

    const studentCourses = await fetchAllDashboardStudentCourses(courseIds);

    const suspendedStudentIds = new Set(
      (studentCourses || [])
        .filter((studentCourse) => normalizeEnrollmentStatus(studentCourse.enrollment_status) === 'suspenso')
        .map((studentCourse) => studentCourse.student_id),
    );

    const studentIds = [
      ...new Set(
        (studentCourses || [])
          .filter((studentCourse) => !suspendedStudentIds.has(studentCourse.student_id))
          .map((studentCourse) => studentCourse.student_id),
      ),
    ];

    const activeStudentIds = [
      ...new Set(
        (studentCourses || [])
          .filter((studentCourse) => normalizeEnrollmentStatus(studentCourse.enrollment_status) === 'ativo')
          .map((studentCourse) => studentCourse.student_id),
      ),
    ];

    if (studentIds.length === 0) {
      const feedData = await listActivityFeedItems(userId, [], normalizedCourseFilter);

      return {
        ...EMPTY_DASHBOARD_DATA,
        summary: { ...EMPTY_SUMMARY },
        activityFeed: mapActivityFeedItems((feedData || []) as Array<Record<string, unknown>>),
      };
    }

    const nowIso = now.toISOString();
    const todayStart = startOfDay(now).toISOString();
    const todayEnd = endOfDay(now).toISOString();
    const activeStudentIdSet = new Set(activeStudentIds);
    const studentIdSet = new Set(studentIds);

    const [
      todayEventsResponse,
      todayTasksResponse,
      atRiskStudents,
      activeNormalStudentsCount,
      newAtRisk,
      feedData,
      missedAssignments,
      dashboardAggregates,
      uncorrectedActivities,
    ] = await Promise.all([
      (supabase.from('calendar_events' as never) as ReturnType<typeof supabase.from>)
        .select('id', { count: 'exact', head: true })
        .eq('owner', userId)
        .gte('start_at', todayStart)
        .lte('start_at', todayEnd),
      (supabase.from('tasks' as never) as ReturnType<typeof supabase.from>)
        .select('id', { count: 'exact', head: true })
        .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
        .gte('due_date', todayStart)
        .lte('due_date', todayEnd)
        .neq('status', 'done'),
      listStudentsAtRisk(studentIds),
      activeStudentIds.length > 0 ? countActiveNormalStudents(activeStudentIds) : Promise.resolve(0),
      countNewAtRiskStudents(studentIds, weekStart.toISOString()),
      listActivityFeedItems(userId, studentIds, normalizedCourseFilter),
      listPendingAssignments(courseIds),
      listDashboardAggregates(courseIds),
      listUncorrectedActivities(courseIds),
    ]);

    const { count: todayEventsCount, error: todayEventsError } = todayEventsResponse as {
      count: number | null;
      error: Error | null;
    };
    const { count: todayTasksCount, error: todayTasksError } = todayTasksResponse as {
      count: number | null;
      error: Error | null;
    };
    if (todayEventsError) throw todayEventsError;
    if (todayTasksError) throw todayTasksError;

    const pendingSubmissionAssignments = (missedAssignments as (PendingAssignmentRow & { student_id?: string })[])
      .filter((activity) => activity.student_id && activeStudentIdSet.has(activity.student_id))
      .filter((activity) => isStudentActivityWeightedInGradebook(activity))
      .filter((activity) => isStudentActivityPendingSubmission(activity));
    const pendingCorrectionActivities = (uncorrectedActivities as ReviewActivityRow[])
      .filter((activity) => studentIdSet.has(activity.student_id))
      .filter((activity) => isStudentActivityWeightedInGradebook(activity))
      .filter((activity) => isStudentActivityPendingCorrection(activity));
    const aggregateRows = dashboardAggregates as DashboardCourseActivityAggregateRow[];
    const aggregateCourseIds = new Set(aggregateRows.map((aggregate) => aggregate.course_id));
    const hasAggregateForEveryCourse = courseIds.every((courseId) => aggregateCourseIds.has(courseId));
    const pendingCorrectionAssignmentsCount = hasAggregateForEveryCourse
      ? aggregateRows.reduce((total, aggregate) => total + (aggregate.pending_correction_assignments || 0), 0)
      : pendingCorrectionActivities.length;

    return {
      summary: {
        today_events: todayEventsCount || 0,
        today_tasks: todayTasksCount || 0,
        activities_to_review: pendingCorrectionAssignmentsCount,
        active_normal_students: activeNormalStudentsCount || 0,
        pending_submission_assignments: pendingSubmissionAssignments.length,
        pending_correction_assignments: pendingCorrectionAssignmentsCount,
        students_at_risk: atRiskStudents.length || 0,
        new_at_risk_this_week: newAtRisk || 0,
      },
      criticalStudents: mapCriticalStudents(atRiskStudents),
      activitiesToReview: mapActivitiesToReview(pendingCorrectionActivities),
      activityFeed: mapActivityFeedItems(feedData),
    };
  },
};
