import { supabase } from "@/integrations/supabase/client";
import {
  isStudentActivityPendingSubmission,
  isStudentActivityWeightedInGradebook,
} from "@/lib/student-activity-status";
import { listAccessibleCourseIds } from "@/lib/course-access";

import type {
  BulkMessageJobPreview,
  BulkMessageRecipientInput,
  BulkSendAudienceData,
  GradeLookup,
  PendingLookup,
  StudentOption,
} from "../types";

interface AccessibleCourseRow {
  id: string;
  name: string;
  category?: string | null;
  start_date?: string | null;
}

interface StudentCourseRow {
  student_id: string;
  course_id: string;
  enrollment_status: string | null;
  last_access: string | null;
  students: {
    id: string;
    full_name: string;
    email?: string | null;
    avatar_url?: string | null;
    moodle_user_id: string;
    current_risk_level?: string | null;
    last_access?: string | null;
  } | null;
}

interface StudentCourseGradeRow {
  student_id: string;
  course_id: string;
  grade_formatted: string | null;
  grade_percentage: number | null;
}

interface StudentActivityRow {
  activity_type: string | null;
  grade: number | null;
  grade_max: number | null;
  percentage: number | null;
  student_id: string;
  course_id: string;
  submitted_at: string | null;
  completed_at: string | null;
  graded_at: string | null;
  status: string | null;
}

interface StartBulkMessageSendInput {
  userId: string;
  messageContent: string;
  moodleUrl: string;
  moodleToken: string;
  recipients: BulkMessageRecipientInput[];
}

export type StartBulkMessageSendResult =
  | { kind: "duplicate"; jobId: string }
  | { kind: "started"; jobId: string };

interface StartBulkMessageSendFunctionResult {
  jobId?: string;
  kind?: string;
}

const BULK_AUDIENCE_IN_BATCH_SIZE = 50;

function emptyAudienceData(): BulkSendAudienceData {
  return {
    students: [],
    gradeLookup: {},
    pendingLookup: {},
  };
}

function chunkValues<T>(
  values: T[],
  size = BULK_AUDIENCE_IN_BATCH_SIZE,
): T[][] {
  const uniqueValues = Array.from(new Set(values));
  const chunks: T[][] = [];

  for (let index = 0; index < uniqueValues.length; index += size) {
    chunks.push(uniqueValues.slice(index, index + size));
  }

  return chunks;
}

async function listCoursesByIds(
  courseIds: string[],
): Promise<AccessibleCourseRow[]> {
  const results = await Promise.all(
    chunkValues(courseIds).map(async (courseIdBatch) => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, name, category, start_date")
        .in("id", courseIdBatch);

      if (error) throw error;
      return (data || []) as AccessibleCourseRow[];
    }),
  );

  return results.flat();
}

async function listStudentCoursesByCourseIds(
  courseIds: string[],
): Promise<StudentCourseRow[]> {
  const results = await Promise.all(
    chunkValues(courseIds).map(async (courseIdBatch) => {
      const { data, error } = await supabase
        .from("student_courses")
        .select(
          "student_id, course_id, enrollment_status, last_access, students(id, full_name, email, avatar_url, moodle_user_id, current_risk_level, last_access)",
        )
        .in("course_id", courseIdBatch);

      if (error) throw error;
      return (data || []) as StudentCourseRow[];
    }),
  );

  return results.flat();
}

async function listStudentCourseGradesByCourseIds(
  courseIds: string[],
): Promise<StudentCourseGradeRow[]> {
  const results = await Promise.all(
    chunkValues(courseIds).map(async (courseIdBatch) => {
      const { data, error } = await supabase
        .from("student_course_grades")
        .select("student_id, course_id, grade_formatted, grade_percentage")
        .in("course_id", courseIdBatch);

      if (error) throw error;
      return (data || []) as StudentCourseGradeRow[];
    }),
  );

  return results.flat();
}

async function listPendingActivitiesByCourseIds(
  courseIds: string[],
): Promise<StudentActivityRow[]> {
  const results = await Promise.all(
    chunkValues(courseIds).map(async (courseIdBatch) => {
      const { data, error } = await supabase
        .from("student_activities")
        .select(
          "student_id, course_id, activity_type, grade, grade_max, percentage, submitted_at, completed_at, graded_at, status, hidden",
        )
        .eq("hidden", false)
        .in("course_id", courseIdBatch);

      if (error) throw error;
      return (data || []) as StudentActivityRow[];
    }),
  );

  return results.flat();
}

function resolveEnrollmentStatus(statusEntry?: {
  validStatuses: Set<string>;
  allStatuses: Set<string>;
}) {
  if (!statusEntry) return "inativo";

  const { validStatuses, allStatuses } = statusEntry;

  if (validStatuses.size > 0) {
    if (validStatuses.has("suspenso")) return "suspenso";
    if (validStatuses.has("concluido")) return "concluido";
    if (validStatuses.has("ativo")) return "ativo";
    return "inativo";
  }

  if (allStatuses.has("concluido")) return "concluido";
  if (allStatuses.has("ativo")) return "ativo";
  if (allStatuses.has("suspenso")) return "suspenso";
  return "inativo";
}

export function buildStudentCourseKey(studentId: string, courseId: string) {
  return `${studentId}:${courseId}`;
}

export async function listBulkSendAudienceForUser(
  userId: string,
): Promise<BulkSendAudienceData> {
  const accessibleCourseIds = await listAccessibleCourseIds(userId, "tutor");

  if (accessibleCourseIds.length === 0) {
    return emptyAudienceData();
  }

  const courseMap = new Map<
    string,
    { id: string; name: string; category?: string; start_date?: string | null }
  >();

  (await listCoursesByIds(accessibleCourseIds)).forEach((course) => {
    courseMap.set(course.id, {
      id: course.id,
      name: course.name,
      category: course.category || undefined,
      start_date: course.start_date,
    });
  });

  const courseIds = Array.from(courseMap.keys());

  if (courseIds.length === 0) {
    return emptyAudienceData();
  }

  const studentCourses = await listStudentCoursesByCourseIds(courseIds);

  if (!studentCourses?.length) {
    return emptyAudienceData();
  }

  const now = new Date();
  const studentMap = new Map<string, StudentOption>();
  const statusMap = new Map<
    string,
    { validStatuses: Set<string>; allStatuses: Set<string> }
  >();

  (studentCourses as StudentCourseRow[]).forEach((studentCourse) => {
    const student = studentCourse.students;
    if (!student) return;

    const course = courseMap.get(studentCourse.course_id);
    const enrollmentStatus = (
      studentCourse.enrollment_status || "ativo"
    ).toLowerCase();
    const isValidCourse =
      !course?.start_date || new Date(course.start_date) <= now;

    const currentStatus = statusMap.get(student.id);
    if (!currentStatus) {
      statusMap.set(student.id, {
        validStatuses: isValidCourse
          ? new Set([enrollmentStatus])
          : new Set<string>(),
        allStatuses: new Set([enrollmentStatus]),
      });
    } else {
      currentStatus.allStatuses.add(enrollmentStatus);
      if (isValidCourse) {
        currentStatus.validStatuses.add(enrollmentStatus);
      }
    }

    if (!studentMap.has(student.id)) {
      studentMap.set(student.id, {
        id: student.id,
        full_name: student.full_name,
        email: student.email,
        avatar_url: student.avatar_url,
        moodle_user_id: student.moodle_user_id,
        current_risk_level: student.current_risk_level,
        last_access: student.last_access,
        enrollment_status: "ativo",
        courses: [],
      });
    }

    if (course) {
      studentMap.get(student.id)?.courses.push({
        course_id: course.id,
        course_name: course.name,
        category: course.category,
        last_access: studentCourse.last_access,
        start_date: course.start_date,
        enrollment_status: enrollmentStatus,
      });
    }
  });

  const students = Array.from(studentMap.values())
    .map((student) => ({
      ...student,
      enrollment_status: resolveEnrollmentStatus(statusMap.get(student.id)),
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));

  const knownStudentIds = new Set(studentMap.keys());

  const [grades, pendingActivities] = await Promise.all([
    listStudentCourseGradesByCourseIds(courseIds),
    listPendingActivitiesByCourseIds(courseIds),
  ]);

  const gradeLookup: GradeLookup = {};
  grades.forEach((grade) => {
    if (!knownStudentIds.has(grade.student_id)) return;

    gradeLookup[buildStudentCourseKey(grade.student_id, grade.course_id)] = {
      gradeFormatted: grade.grade_formatted,
      gradePercentage: grade.grade_percentage,
    };
  });

  const pendingLookup: PendingLookup = {};
  pendingActivities.forEach((activity) => {
    if (!knownStudentIds.has(activity.student_id)) return;
    if (!isStudentActivityWeightedInGradebook(activity)) return;
    if (!isStudentActivityPendingSubmission(activity)) return;

    const key = buildStudentCourseKey(activity.student_id, activity.course_id);
    pendingLookup[key] = (pendingLookup[key] || 0) + 1;
  });

  return {
    students,
    gradeLookup,
    pendingLookup,
  };
}

export async function listRecentBulkMessageJobsForUser(
  userId: string,
  limit = 5,
): Promise<BulkMessageJobPreview[]> {
  const { data, error } = await supabase
    .from("bulk_message_jobs")
    .select(
      "id, message_content, total_recipients, sent_count, failed_count, status, created_at, origin",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []) as BulkMessageJobPreview[];
}

export async function listActiveBulkMessageJobsForUser(
  userId: string,
): Promise<BulkMessageJobPreview[]> {
  const { data, error } = await supabase
    .from("bulk_message_jobs")
    .select(
      "id, message_content, total_recipients, sent_count, failed_count, status, created_at, origin",
    )
    .eq("user_id", userId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []) as BulkMessageJobPreview[];
}

export async function startBulkMessageSend(
  input: StartBulkMessageSendInput,
): Promise<StartBulkMessageSendResult> {
  if (input.recipients.length === 0) {
    throw new Error("Nenhum destinatario informado para o envio em massa");
  }

  const normalizedMessage = input.messageContent.trim();

  const { data, error } = await supabase.functions.invoke("bulk-message-send", {
    body: {
      message_content: normalizedMessage,
      moodleUrl: input.moodleUrl,
      origin: "manual",
      recipients: input.recipients.map((recipient) => ({
        moodle_user_id: recipient.moodleUserId,
        personalized_message: recipient.personalizedMessage,
        student_id: recipient.studentId,
        student_name: recipient.studentName,
      })),
      token: input.moodleToken,
    },
  });

  if (error) throw error;

  const result = (data || {}) as StartBulkMessageSendFunctionResult;

  if (result.kind === "duplicate" && typeof result.jobId === "string") {
    return {
      kind: "duplicate",
      jobId: result.jobId,
    };
  }

  if (result.kind === "started" && typeof result.jobId === "string") {
    return {
      kind: "started",
      jobId: result.jobId,
    };
  }

  throw new Error("Resposta invalida da edge function bulk-message-send");
}
