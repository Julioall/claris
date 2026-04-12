import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getStudentActivityWorkflowStatus, isStudentActivityWeightedInGradebook } from '@/lib/student-activity-status';
import type { Course } from '@/features/courses/types';
import type { RiskLevel } from '@/features/students/types';

import {
  dashboardManagerialRepository,
  type DashboardManagerialRawData,
} from '../api/dashboard-managerial.repository';

interface ManagerialCourseView {
  courseId: string;
  courseName: string;
  studentCount: number;
  averageGrade: number;
  medianGrade: number;
  gradeStdDev: number;
  approvalRate: number;
  dropoutRate: number;
  riskRate: number;
  pendingCorrections: number;
  pendingSubmissions: number;
}

interface ManagerialActorView {
  userId: string;
  name: string;
  role: string;
  courseCount: number;
  studentCount: number;
  averageGrade: number;
  riskStudents: number;
  interventions: number;
  pendingQueue: number;
}

interface ManagerialDisciplineView {
  discipline: string;
  courseCount: number;
  studentCount: number;
  averageGrade: number;
  approvalRate: number;
  riskRate: number;
}

interface ManagerialTemporalPoint {
  period: string;
  averageGrade: number;
  riskChanges: number;
  interventions: number;
}

interface ManagerialEquityView {
  segment: string;
  studentCount: number;
  averageGrade: number;
  approvalRate: number;
  riskRate: number;
}

interface ManagerialInterventionSummary {
  totalInterventions: number;
  contactedStudents: number;
  improvedRiskAfterAction: number;
  worsenedRiskAfterAction: number;
  effectivenessRate: number;
}

interface ManagerialFunnel {
  identifiedAtRisk: number;
  contacted: number;
  withAction: number;
  improved: number;
  stabilized: number;
}

interface ManagerialExecutiveSummary {
  activeStudents: number;
  globalAverageGrade: number;
  approvalRate: number;
  riskRate: number;
  pendingCorrections: number;
  pendingSubmissions: number;
}

interface ManagerialPriority {
  label: string;
  value: number;
  note: string;
}

export interface DashboardManagerialInsights {
  courses: ManagerialCourseView[];
  monitors: ManagerialActorView[];
  professors: ManagerialActorView[];
  disciplines: ManagerialDisciplineView[];
  riskDistribution: Record<RiskLevel, number>;
  temporal: ManagerialTemporalPoint[];
  equity: ManagerialEquityView[];
  interventions: ManagerialInterventionSummary;
  funnel: ManagerialFunnel;
  executive: ManagerialExecutiveSummary;
  priorities: ManagerialPriority[];
}

const EMPTY_RISK_DISTRIBUTION: Record<RiskLevel, number> = {
  normal: 0,
  atencao: 0,
  risco: 0,
  critico: 0,
  inativo: 0,
};

const EMPTY_INSIGHTS: DashboardManagerialInsights = {
  courses: [],
  monitors: [],
  professors: [],
  disciplines: [],
  riskDistribution: { ...EMPTY_RISK_DISTRIBUTION },
  temporal: [],
  equity: [],
  interventions: {
    totalInterventions: 0,
    contactedStudents: 0,
    improvedRiskAfterAction: 0,
    worsenedRiskAfterAction: 0,
    effectivenessRate: 0,
  },
  funnel: {
    identifiedAtRisk: 0,
    contacted: 0,
    withAction: 0,
    improved: 0,
    stabilized: 0,
  },
  executive: {
    activeStudents: 0,
    globalAverageGrade: 0,
    approvalRate: 0,
    riskRate: 0,
    pendingCorrections: 0,
    pendingSubmissions: 0,
  },
  priorities: [],
};

function normalizeRole(role: string | null | undefined) {
  return (role || '').trim().toLowerCase();
}

function normalizeEnrollmentStatus(status: string | null | undefined) {
  return (status || '').trim().toLowerCase();
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }

  return sorted[midpoint];
}

function stdDev(values: number[]) {
  if (values.length === 0) return 0;
  const average = mean(values);
  const variance = values.reduce((acc, value) => acc + ((value - average) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function toMonthLabel(dateValue: string | null | undefined) {
  if (!dateValue) return 'Sem periodo';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Sem periodo';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function riskSeverity(level: RiskLevel | null | undefined) {
  switch (level) {
    case 'normal': return 0;
    case 'atencao': return 1;
    case 'risco': return 2;
    case 'critico': return 3;
    case 'inativo': return 4;
    default: return 0;
  }
}

function isRiskLevel(level: RiskLevel) {
  return level === 'risco' || level === 'critico';
}

function computeInsights(rawData: DashboardManagerialRawData, courses: Course[]): DashboardManagerialInsights {
  if (courses.length === 0) return { ...EMPTY_INSIGHTS };

  const courseById = new Map(courses.map((course) => [course.id, course]));
  const enrollmentsByCourse = new Map<string, DashboardManagerialRawData['enrollments']>();
  const gradesByCourse = new Map<string, DashboardManagerialRawData['courseGrades']>();
  const activitiesByCourse = new Map<string, DashboardManagerialRawData['activities']>();
  const riskByStudent = new Map(rawData.studentsRisk.map((student) => [student.id, student.current_risk_level]));

  rawData.enrollments.forEach((row) => {
    const list = enrollmentsByCourse.get(row.course_id) ?? [];
    list.push(row);
    enrollmentsByCourse.set(row.course_id, list);
  });

  rawData.courseGrades.forEach((row) => {
    const list = gradesByCourse.get(row.course_id) ?? [];
    list.push(row);
    gradesByCourse.set(row.course_id, list);
  });

  rawData.activities.forEach((row) => {
    const list = activitiesByCourse.get(row.course_id) ?? [];
    list.push(row);
    activitiesByCourse.set(row.course_id, list);
  });

  const activeEnrollmentRows = rawData.enrollments.filter(
    (enrollment) => normalizeEnrollmentStatus(enrollment.enrollment_status) === 'ativo',
  );
  const activeStudentIds = new Set(activeEnrollmentRows.map((row) => row.student_id));
  const totalActiveStudents = activeStudentIds.size;

  const allValidGrades = rawData.courseGrades
    .map((grade) => grade.grade_percentage)
    .filter((grade): grade is number => typeof grade === 'number');

  const allWeightedActivities = rawData.activities.filter((activity) => (
    !activity.hidden && isStudentActivityWeightedInGradebook(activity)
  ));

  const pendingCorrectionsGlobal = allWeightedActivities
    .filter((activity) => getStudentActivityWorkflowStatus(activity) === 'pending_correction').length;
  const pendingSubmissionsGlobal = allWeightedActivities
    .filter((activity) => getStudentActivityWorkflowStatus(activity) === 'pending_submission').length;

  const coursesView: ManagerialCourseView[] = courses.map((course) => {
    const enrollmentRows = enrollmentsByCourse.get(course.id) ?? [];
    const activeRows = enrollmentRows.filter((row) => normalizeEnrollmentStatus(row.enrollment_status) === 'ativo');
    const studentIds = new Set(activeRows.map((row) => row.student_id));
    const gradeRows = (gradesByCourse.get(course.id) ?? [])
      .filter((row) => studentIds.has(row.student_id));
    const gradePercentages = gradeRows
      .map((row) => row.grade_percentage)
      .filter((grade): grade is number => typeof grade === 'number');

    const courseActivities = (activitiesByCourse.get(course.id) ?? [])
      .filter((activity) => !activity.hidden && isStudentActivityWeightedInGradebook(activity));

    const pendingCorrections = courseActivities
      .filter((activity) => getStudentActivityWorkflowStatus(activity) === 'pending_correction').length;
    const pendingSubmissions = courseActivities
      .filter((activity) => getStudentActivityWorkflowStatus(activity) === 'pending_submission').length;

    const riskStudents = Array.from(studentIds)
      .filter((studentId) => isRiskLevel(riskByStudent.get(studentId) ?? 'normal')).length;

    const suspendedCount = enrollmentRows
      .filter((row) => normalizeEnrollmentStatus(row.enrollment_status) === 'suspenso').length;

    const approvalCount = gradePercentages.filter((grade) => grade >= 60).length;

    return {
      courseId: course.id,
      courseName: course.short_name || course.name,
      studentCount: studentIds.size,
      averageGrade: mean(gradePercentages),
      medianGrade: median(gradePercentages),
      gradeStdDev: stdDev(gradePercentages),
      approvalRate: gradePercentages.length > 0 ? (approvalCount / gradePercentages.length) * 100 : 0,
      dropoutRate: enrollmentRows.length > 0 ? (suspendedCount / enrollmentRows.length) * 100 : 0,
      riskRate: studentIds.size > 0 ? (riskStudents / studentIds.size) * 100 : 0,
      pendingCorrections,
      pendingSubmissions,
    };
  }).sort((left, right) => right.riskRate - left.riskRate);

  const actorMap = new Map<string, ManagerialActorView>();
  const courseStudentsMap = new Map<string, Set<string>>();
  activeEnrollmentRows.forEach((row) => {
    if (!courseStudentsMap.has(row.course_id)) {
      courseStudentsMap.set(row.course_id, new Set());
    }

    courseStudentsMap.get(row.course_id)!.add(row.student_id);
  });

  rawData.userCourses.forEach((association) => {
    const key = `${association.user_id}::${normalizeRole(association.role)}`;
    const actor = actorMap.get(key) ?? {
      userId: association.user_id,
      name: association.users?.full_name || 'Usuario sem nome',
      role: normalizeRole(association.role) || 'nao_definido',
      courseCount: 0,
      studentCount: 0,
      averageGrade: 0,
      riskStudents: 0,
      interventions: 0,
      pendingQueue: 0,
    };

    actor.courseCount += 1;

    const relatedStudents = courseStudentsMap.get(association.course_id) ?? new Set();
    const relatedStudentIds = Array.from(relatedStudents);
    actor.studentCount += relatedStudentIds.length;

    const relatedGrades = (gradesByCourse.get(association.course_id) ?? [])
      .filter((grade) => relatedStudents.has(grade.student_id))
      .map((grade) => grade.grade_percentage)
      .filter((grade): grade is number => typeof grade === 'number');

    if (relatedGrades.length > 0) {
      const rollingGrades = actor.averageGrade === 0
        ? []
        : [actor.averageGrade];
      actor.averageGrade = mean([...rollingGrades, mean(relatedGrades)]);
    }

    actor.riskStudents += relatedStudentIds.filter((studentId) => {
      const level = riskByStudent.get(studentId) ?? 'normal';
      return isRiskLevel(level);
    }).length;

    const relatedActivities = (activitiesByCourse.get(association.course_id) ?? [])
      .filter((activity) => !activity.hidden && isStudentActivityWeightedInGradebook(activity));

    actor.pendingQueue += relatedActivities.filter((activity) => {
      const status = getStudentActivityWorkflowStatus(activity);
      return status === 'pending_correction' || status === 'pending_submission';
    }).length;

    actorMap.set(key, actor);
  });

  rawData.activityFeed.forEach((event) => {
    if (!event.user_id) return;

    const actorKeys = Array.from(actorMap.keys()).filter((key) => key.startsWith(`${event.user_id}::`));
    actorKeys.forEach((key) => {
      const actor = actorMap.get(key);
      if (!actor) return;
      actor.interventions += 1;
      actorMap.set(key, actor);
    });
  });

  const actors = Array.from(actorMap.values()).sort((left, right) => right.interventions - left.interventions);
  const monitors = actors.filter((actor) => actor.role === 'tutor');
  const professors = actors.filter((actor) => actor.role !== 'tutor');

  const disciplineMap = new Map<string, {
    courseCount: number;
    students: Set<string>;
    grades: number[];
    riskStudents: number;
  }>();

  courses.forEach((course) => {
    const discipline = course.category?.trim() || 'Sem categoria';
    const bucket = disciplineMap.get(discipline) ?? {
      courseCount: 0,
      students: new Set<string>(),
      grades: [],
      riskStudents: 0,
    };

    bucket.courseCount += 1;

    const activeRows = (enrollmentsByCourse.get(course.id) ?? [])
      .filter((row) => normalizeEnrollmentStatus(row.enrollment_status) === 'ativo');

    activeRows.forEach((row) => {
      bucket.students.add(row.student_id);
      const level = riskByStudent.get(row.student_id) ?? 'normal';
      if (isRiskLevel(level)) {
        bucket.riskStudents += 1;
      }
    });

    (gradesByCourse.get(course.id) ?? []).forEach((grade) => {
      if (typeof grade.grade_percentage === 'number') {
        bucket.grades.push(grade.grade_percentage);
      }
    });

    disciplineMap.set(discipline, bucket);
  });

  const disciplines = Array.from(disciplineMap.entries()).map(([discipline, data]) => {
    const approved = data.grades.filter((grade) => grade >= 60).length;

    return {
      discipline,
      courseCount: data.courseCount,
      studentCount: data.students.size,
      averageGrade: mean(data.grades),
      approvalRate: data.grades.length > 0 ? (approved / data.grades.length) * 100 : 0,
      riskRate: data.students.size > 0 ? (data.riskStudents / data.students.size) * 100 : 0,
    };
  }).sort((left, right) => right.riskRate - left.riskRate);

  const riskDistribution = { ...EMPTY_RISK_DISTRIBUTION };
  rawData.studentsRisk.forEach((student) => {
    riskDistribution[student.current_risk_level] += 1;
  });

  const temporalMap = new Map<string, { grades: number[]; riskChanges: number; interventions: number }>();

  rawData.courseGrades.forEach((grade) => {
    const period = toMonthLabel(grade.updated_at);
    const bucket = temporalMap.get(period) ?? { grades: [], riskChanges: 0, interventions: 0 };
    if (typeof grade.grade_percentage === 'number') {
      bucket.grades.push(grade.grade_percentage);
    }
    temporalMap.set(period, bucket);
  });

  rawData.riskHistory.forEach((entry) => {
    const period = toMonthLabel(entry.created_at);
    const bucket = temporalMap.get(period) ?? { grades: [], riskChanges: 0, interventions: 0 };
    bucket.riskChanges += 1;
    temporalMap.set(period, bucket);
  });

  rawData.activityFeed.forEach((entry) => {
    const period = toMonthLabel(entry.created_at);
    const bucket = temporalMap.get(period) ?? { grades: [], riskChanges: 0, interventions: 0 };
    bucket.interventions += 1;
    temporalMap.set(period, bucket);
  });

  const temporal = Array.from(temporalMap.entries())
    .map(([period, data]) => ({
      period,
      averageGrade: mean(data.grades),
      riskChanges: data.riskChanges,
      interventions: data.interventions,
    }))
    .sort((left, right) => left.period.localeCompare(right.period, 'pt-BR'));

  const equity = disciplines.map((discipline) => ({
    segment: discipline.discipline,
    studentCount: discipline.studentCount,
    averageGrade: discipline.averageGrade,
    approvalRate: discipline.approvalRate,
    riskRate: discipline.riskRate,
  }));

  const firstInterventionByStudent = new Map<string, Date>();
  rawData.activityFeed.forEach((event) => {
    if (!event.student_id || !event.created_at) return;

    const eventDate = new Date(event.created_at);
    if (Number.isNaN(eventDate.getTime())) return;

    const currentFirst = firstInterventionByStudent.get(event.student_id);
    if (!currentFirst || eventDate < currentFirst) {
      firstInterventionByStudent.set(event.student_id, eventDate);
    }
  });

  let improvedRiskAfterAction = 0;
  let worsenedRiskAfterAction = 0;
  let stabilizedAfterAction = 0;

  rawData.riskHistory.forEach((entry) => {
    if (!entry.created_at) return;

    const interventionDate = firstInterventionByStudent.get(entry.student_id);
    if (!interventionDate) return;

    const historyDate = new Date(entry.created_at);
    if (Number.isNaN(historyDate.getTime()) || historyDate < interventionDate) return;

    const severityBefore = riskSeverity(entry.previous_level);
    const severityAfter = riskSeverity(entry.new_level);

    if (severityAfter < severityBefore) {
      improvedRiskAfterAction += 1;
    } else if (severityAfter > severityBefore) {
      worsenedRiskAfterAction += 1;
    } else {
      stabilizedAfterAction += 1;
    }
  });

  const totalInterventions = rawData.activityFeed.length;
  const contactedStudents = firstInterventionByStudent.size;
  const effectivenessBase = improvedRiskAfterAction + worsenedRiskAfterAction + stabilizedAfterAction;

  const interventions: ManagerialInterventionSummary = {
    totalInterventions,
    contactedStudents,
    improvedRiskAfterAction,
    worsenedRiskAfterAction,
    effectivenessRate: effectivenessBase > 0 ? (improvedRiskAfterAction / effectivenessBase) * 100 : 0,
  };

  const identifiedAtRisk = riskDistribution.risco + riskDistribution.critico;
  const withAction = rawData.activityFeed.filter((event) => {
    const text = `${event.event_type} ${event.description || ''}`.toLowerCase();
    return text.includes('acao') || text.includes('contato') || text.includes('interv');
  }).length;

  const funnel: ManagerialFunnel = {
    identifiedAtRisk,
    contacted: contactedStudents,
    withAction,
    improved: improvedRiskAfterAction,
    stabilized: stabilizedAfterAction,
  };

  const approvedGlobal = allValidGrades.filter((grade) => grade >= 60).length;
  const executive: ManagerialExecutiveSummary = {
    activeStudents: totalActiveStudents,
    globalAverageGrade: mean(allValidGrades),
    approvalRate: allValidGrades.length > 0 ? (approvedGlobal / allValidGrades.length) * 100 : 0,
    riskRate: totalActiveStudents > 0 ? (identifiedAtRisk / totalActiveStudents) * 100 : 0,
    pendingCorrections: pendingCorrectionsGlobal,
    pendingSubmissions: pendingSubmissionsGlobal,
  };

  const priorities: ManagerialPriority[] = [
    {
      label: 'Alunos em risco alto',
      value: identifiedAtRisk,
      note: 'Total de alunos em risco e critico nas UCs filtradas.',
    },
    {
      label: 'Fila de correcoes',
      value: pendingCorrectionsGlobal,
      note: 'Atividades enviadas aguardando avaliacao.',
    },
    {
      label: 'Fila de envios pendentes',
      value: pendingSubmissionsGlobal,
      note: 'Atividades ainda nao enviadas pelos alunos.',
    },
    {
      label: 'Intervencoes registradas',
      value: totalInterventions,
      note: 'Registros de acoes no feed de atividade.',
    },
  ];

  return {
    courses: coursesView,
    monitors,
    professors,
    disciplines,
    riskDistribution,
    temporal,
    equity,
    interventions,
    funnel,
    executive,
    priorities,
  };
}

export function useDashboardManagerialData(courses: Course[]) {
  const courseIds = useMemo(() => courses.map((course) => course.id), [courses]);

  const query = useQuery({
    queryKey: ['dashboard', 'managerial-views', courseIds],
    queryFn: () => dashboardManagerialRepository.getManagerialRawData({ courseIds }),
    enabled: courseIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const insights = useMemo(() => {
    if (!query.data) return { ...EMPTY_INSIGHTS };
    return computeInsights(query.data, courses);
  }, [courses, query.data]);

  return {
    insights,
    isLoading: courseIds.length > 0 && query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}
