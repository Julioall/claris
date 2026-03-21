import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

import type {
  BulkMessageJobPreview,
  BulkMessageRecipientInput,
  BulkSendAudienceData,
  GradeLookup,
  PendingLookup,
  StudentOption,
} from '../types';

interface UserCourseRow {
  course_id: string;
  courses: {
    id: string;
    name: string;
    category?: string | null;
    start_date?: string | null;
  } | null;
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
  student_id: string;
  course_id: string;
  submitted_at: string | null;
  completed_at: string | null;
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
  | { kind: 'duplicate'; jobId: string }
  | { kind: 'started'; jobId: string };

function emptyAudienceData(): BulkSendAudienceData {
  return {
    students: [],
    gradeLookup: {},
    pendingLookup: {},
  };
}

function resolveEnrollmentStatus(statusEntry?: { validStatuses: Set<string>; allStatuses: Set<string> }) {
  if (!statusEntry) return 'inativo';

  const { validStatuses, allStatuses } = statusEntry;

  if (validStatuses.size > 0) {
    if (validStatuses.has('suspenso')) return 'suspenso';
    if (validStatuses.has('concluido')) return 'concluido';
    if (validStatuses.has('ativo')) return 'ativo';
    return 'inativo';
  }

  if (allStatuses.has('concluido')) return 'concluido';
  if (allStatuses.has('ativo')) return 'ativo';
  if (allStatuses.has('suspenso')) return 'suspenso';
  return 'inativo';
}

export function buildStudentCourseKey(studentId: string, courseId: string) {
  return `${studentId}:${courseId}`;
}

export async function listBulkSendAudienceForUser(userId: string): Promise<BulkSendAudienceData> {
  const { data: userCourses, error: userCoursesError } = await supabase
    .from('user_courses')
    .select('course_id, courses(id, name, category, start_date)')
    .eq('user_id', userId)
    .eq('role', 'tutor');

  if (userCoursesError) throw userCoursesError;

  if (!userCourses?.length) {
    return emptyAudienceData();
  }

  const courseMap = new Map<string, { id: string; name: string; category?: string; start_date?: string | null }>();

  (userCourses as UserCourseRow[]).forEach((userCourse) => {
    const course = userCourse.courses;
    if (!course) return;

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

  const { data: studentCourses, error: studentCoursesError } = await supabase
    .from('student_courses')
    .select(
      'student_id, course_id, enrollment_status, last_access, students(id, full_name, email, moodle_user_id, current_risk_level, last_access)',
    )
    .in('course_id', courseIds);

  if (studentCoursesError) throw studentCoursesError;

  if (!studentCourses?.length) {
    return emptyAudienceData();
  }

  const now = new Date();
  const studentMap = new Map<string, StudentOption>();
  const statusMap = new Map<string, { validStatuses: Set<string>; allStatuses: Set<string> }>();

  (studentCourses as StudentCourseRow[]).forEach((studentCourse) => {
    const student = studentCourse.students;
    if (!student) return;

    const course = courseMap.get(studentCourse.course_id);
    const enrollmentStatus = (studentCourse.enrollment_status || 'ativo').toLowerCase();
    const isValidCourse = !course?.start_date || new Date(course.start_date) <= now;

    const currentStatus = statusMap.get(student.id);
    if (!currentStatus) {
      statusMap.set(student.id, {
        validStatuses: isValidCourse ? new Set([enrollmentStatus]) : new Set<string>(),
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
        moodle_user_id: student.moodle_user_id,
        current_risk_level: student.current_risk_level,
        last_access: student.last_access,
        enrollment_status: 'ativo',
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
        enrollment_status,
      });
    }
  });

  const students = Array.from(studentMap.values())
    .map((student) => ({
      ...student,
      enrollment_status: resolveEnrollmentStatus(statusMap.get(student.id)),
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'));

  const studentIds = Array.from(
    new Set((studentCourses as StudentCourseRow[]).map((studentCourse) => studentCourse.student_id)),
  );

  const [{ data: grades, error: gradesError }, { data: pendingActivities, error: pendingActivitiesError }] =
    await Promise.all([
      supabase
        .from('student_course_grades')
        .select('student_id, course_id, grade_formatted, grade_percentage')
        .in('course_id', courseIds)
        .in('student_id', studentIds),
      supabase
        .from('student_activities')
        .select('student_id, course_id, submitted_at, completed_at, status, hidden')
        .in('course_id', courseIds)
        .in('student_id', studentIds)
        .eq('hidden', false),
    ]);

  if (gradesError) throw gradesError;
  if (pendingActivitiesError) throw pendingActivitiesError;

  const gradeLookup: GradeLookup = {};
  (grades as StudentCourseGradeRow[] | null)?.forEach((grade) => {
    gradeLookup[buildStudentCourseKey(grade.student_id, grade.course_id)] = {
      gradeFormatted: grade.grade_formatted,
      gradePercentage: grade.grade_percentage,
    };
  });

  const pendingLookup: PendingLookup = {};
  (pendingActivities as StudentActivityRow[] | null)?.forEach((activity) => {
    const isSubmitted = Boolean(activity.submitted_at);
    const isCompleted =
      Boolean(activity.completed_at) ||
      ['completed', 'concluida', 'finalizada'].includes(String(activity.status || '').toLowerCase());

    if (isSubmitted || isCompleted) return;

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
    .from('bulk_message_jobs')
    .select('id, message_content, total_recipients, sent_count, failed_count, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []) as BulkMessageJobPreview[];
}

export async function startBulkMessageSend(
  input: StartBulkMessageSendInput,
): Promise<StartBulkMessageSendResult> {
  if (input.recipients.length === 0) {
    throw new Error('Nenhum destinatario informado para o envio em massa');
  }

  const normalizedMessage = input.messageContent.trim();

  const { data: existingJob, error: existingJobError } = await supabase
    .from('bulk_message_jobs')
    .select('id')
    .eq('user_id', input.userId)
    .eq('message_content', normalizedMessage)
    .eq('total_recipients', input.recipients.length)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingJobError) throw existingJobError;

  if (existingJob) {
    return {
      kind: 'duplicate',
      jobId: existingJob.id,
    };
  }

  const jobInsert: TablesInsert<'bulk_message_jobs'> = {
    user_id: input.userId,
    message_content: normalizedMessage,
    total_recipients: input.recipients.length,
    status: 'pending',
  };

  const { data: job, error: jobError } = await supabase
    .from('bulk_message_jobs')
    .insert(jobInsert)
    .select('id')
    .single();

  if (jobError || !job) {
    throw jobError || new Error('Falha ao criar job de envio em massa');
  }

  const recipientsInsert: TablesInsert<'bulk_message_recipients'>[] = input.recipients.map((recipient) => ({
    job_id: job.id,
    student_id: recipient.studentId,
    moodle_user_id: recipient.moodleUserId,
    student_name: recipient.studentName,
    personalized_message: recipient.personalizedMessage,
    status: 'pending',
  }));

  const { error: recipientsError } = await supabase.from('bulk_message_recipients').insert(recipientsInsert);

  if (recipientsError) throw recipientsError;

  const { error: invokeError } = await supabase.functions.invoke('bulk-message-send', {
    body: {
      job_id: job.id,
      moodleUrl: input.moodleUrl,
      token: input.moodleToken,
    },
  });

  if (invokeError) {
    const failedUpdate: TablesUpdate<'bulk_message_jobs'> = {
      status: 'failed',
      error_message: `Falha ao iniciar processamento: ${invokeError.message}`,
      completed_at: new Date().toISOString(),
    };

    await supabase
      .from('bulk_message_jobs')
      .update(failedUpdate)
      .eq('id', job.id)
      .eq('user_id', input.userId);

    throw invokeError;
  }

  return {
    kind: 'started',
    jobId: job.id,
  };
}
