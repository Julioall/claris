import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BackgroundActivityProvider } from "@/contexts/BackgroundActivityContext";
import CoursePanel from "@/features/courses/pages/CoursePanelPage";

const useCoursePanelMock = vi.fn();
const useAuthMock = vi.fn();
const usePermissionsMock = vi.fn();
const toggleActivityVisibilityMock = vi.fn();
const generateActivityGradeSuggestionsMock = vi.fn();
const findLatestRelevantActivityGradeSuggestionJobMock = vi.fn();
const getActivityGradeSuggestionJobMock = vi.fn();
const resumeActivityGradeSuggestionJobMock = vi.fn();
const approveStudentGradeSuggestionMock = vi.fn();
const useMoodleSessionMock = vi.fn();
const syncCourseIncrementalMock = vi.fn();
const refetchCoursePanelMock = vi.fn();

vi.mock("@/features/courses/hooks/useCoursePanel", () => ({
  useCoursePanel: (...args: unknown[]) => adaptCoursePanelMock(useCoursePanelMock(...args)),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => usePermissionsMock(),
}));

vi.mock("@/features/auth/context/MoodleSessionContext", () => ({
  useMoodleSession: () => useMoodleSessionMock(),
}));

vi.mock("@/features/students/api/gradeSuggestions", () => ({
  generateActivityGradeSuggestions: (...args: unknown[]) => generateActivityGradeSuggestionsMock(...args),
  findLatestRelevantActivityGradeSuggestionJob: (...args: unknown[]) => findLatestRelevantActivityGradeSuggestionJobMock(...args),
  getActivityGradeSuggestionJob: (...args: unknown[]) => getActivityGradeSuggestionJobMock(...args),
  resumeActivityGradeSuggestionJob: (...args: unknown[]) => resumeActivityGradeSuggestionJobMock(...args),
  approveStudentGradeSuggestion: (...args: unknown[]) => approveStudentGradeSuggestionMock(...args),
}));

vi.mock("@/components/attendance/CourseAttendanceTab", () => ({
  CourseAttendanceTab: ({ canManage, courseId }: { canManage: boolean; courseId: string }) => (
    <div data-can-manage={String(canManage)} data-testid="attendance-tab">{courseId}</div>
  ),
}));

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function adaptSubmission(value: unknown) {
  const submission = asRecord(value) ?? {};
  if (typeof submission.workflowStatus === "string") return submission;

  const normalizedStatus = typeof submission.status === "string"
    ? submission.status.toLowerCase()
    : "";
  const workflowStatus = (
    typeof submission.grade === "number"
    || Boolean(submission.graded_at)
    || normalizedStatus === "graded"
  )
    ? "corrected"
    : Boolean(submission.submitted_at) || normalizedStatus === "submitted"
      ? "pendingCorrection"
      : Boolean(submission.completed_at) || normalizedStatus === "completed"
        ? "completed"
        : "pendingSubmission";

  return {
    completedAt: submission.completedAt ?? submission.completed_at ?? null,
    grade: submission.grade ?? null,
    gradedAt: submission.gradedAt ?? submission.graded_at ?? null,
    gradeMax: submission.gradeMax ?? submission.grade_max ?? null,
    id: submission.id,
    moodleActivityId: submission.moodleActivityId ?? submission.moodle_activity_id ?? "",
    percentage: submission.percentage ?? null,
    studentId: submission.studentId ?? submission.student_id,
    submittedAt: submission.submittedAt ?? submission.submitted_at ?? null,
    workflowStatus,
  };
}

function buildSubmissionCounts(submissions: Array<Record<string, unknown>>) {
  const counts = {
    completed: 0,
    corrected: 0,
    pendingCorrection: 0,
    pendingSubmission: 0,
    total: submissions.length,
  };

  submissions.forEach((submission) => {
    switch (submission.workflowStatus) {
      case "corrected":
        counts.corrected += 1;
        break;
      case "pendingCorrection":
        counts.pendingCorrection += 1;
        break;
      case "completed":
        counts.completed += 1;
        break;
      default:
        counts.pendingSubmission += 1;
    }
  });

  return counts;
}

// Keep the large UI scenarios readable while translating their historical
// fixtures to the versioned camelCase DTO now returned by the hook.
function adaptCoursePanelMock(value: unknown) {
  const result = asRecord(value);
  if (!result) return value;

  const rawCourse = asRecord(result.course);
  const course = rawCourse
    ? {
        ...rawCourse,
        effectiveEndsAt: rawCourse.effectiveEndsAt ?? rawCourse.effective_end_date ?? null,
        endsAt: rawCourse.endsAt ?? rawCourse.end_date ?? null,
        lastSyncedAt: rawCourse.lastSyncedAt ?? rawCourse.last_sync ?? null,
        lifecycle: rawCourse.lifecycle ?? "inProgress",
        moodleCourseId: rawCourse.moodleCourseId ?? rawCourse.moodle_course_id ?? "",
        shortName: rawCourse.shortName ?? rawCourse.short_name ?? null,
        startsAt: rawCourse.startsAt ?? rawCourse.start_date ?? null,
      }
    : result.course;

  const students = (Array.isArray(result.students) ? result.students : []).map((value) => {
    const student = asRecord(value) ?? {};
    if (typeof student.name === "string" && typeof student.riskLevel === "string") {
      return student;
    }
    return {
      avatarUrl: student.avatarUrl ?? student.avatar_url ?? null,
      email: student.email ?? null,
      enrollmentStatus: student.enrollmentStatus ?? null,
      id: student.id,
      lastAccessAt: student.lastAccessAt ?? student.last_access ?? null,
      name: student.name ?? student.full_name ?? "",
      riskLevel: student.riskLevel ?? student.current_risk_level ?? "normal",
    };
  });
  const studentIds = new Set(
    students
      .map((student) => student.id)
      .filter((studentId): studentId is string => typeof studentId === "string"),
  );
  const legacySubmissions = (Array.isArray(result.activitySubmissions)
    ? result.activitySubmissions
    : [])
    .map(adaptSubmission)
    .filter((submission) => studentIds.has(String(submission.studentId)));

  const activities = (Array.isArray(result.activities) ? result.activities : []).map((value) => {
    const activity = asRecord(value) ?? {};
    const moodleActivityId = String(
      activity.moodleActivityId ?? activity.moodle_activity_id ?? "",
    );
    const ownSubmissions = Array.isArray(activity.submissions)
      ? activity.submissions.map(adaptSubmission)
      : legacySubmissions.filter((submission) => (
          String(submission.moodleActivityId) === moodleActivityId
          && String(submission.studentId).length > 0
        ));
    const type = activity.type ?? activity.activity_type ?? null;
    return {
      courseId: activity.courseId ?? activity.course_id ?? "",
      dueAt: activity.dueAt ?? activity.due_date ?? null,
      hidden: activity.hidden === true,
      id: activity.id,
      isAssignment: activity.isAssignment ?? (type === "assign" || type === "assignment"),
      moodleActivityId,
      name: activity.name ?? activity.activity_name ?? "",
      submissionCounts: activity.submissionCounts ?? buildSubmissionCounts(ownSubmissions),
      submissions: ownSubmissions,
      type,
    };
  });

  return { ...result, activities, course, students };
}

function renderPage() {
  return render(
    <BackgroundActivityProvider>
      <MemoryRouter initialEntries={["/cursos/c-1"]}>
        <Routes>
          <Route path="/cursos/:id" element={<CoursePanel />} />
        </Routes>
      </MemoryRouter>
    </BackgroundActivityProvider>,
  );
}

describe("CoursePanel page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    useMoodleSessionMock.mockReturnValue({
      moodleToken: "token-1",
      moodleUrl: "https://moodle.example.com",
      moodleUserId: 12,
    });
    generateActivityGradeSuggestionsMock.mockResolvedValue({
      data: {
        success: true,
        jobId: "job-1",
        status: "processing",
        totalItems: 1,
        processedItems: 0,
        successCount: 0,
        errorCount: 0,
        message: "Job iniciado para 1 entrega.",
        items: [],
      },
      error: null,
    });
    findLatestRelevantActivityGradeSuggestionJobMock.mockResolvedValue(null);
    getActivityGradeSuggestionJobMock.mockResolvedValue({
      data: {
        success: true,
        jobId: "job-1",
        status: "completed",
        totalItems: 1,
        processedItems: 1,
        successCount: 1,
        errorCount: 0,
        message: "1 sugestao gerada com sucesso.",
        items: [
          {
            id: "item-2",
            studentId: "s-2",
            studentActivityId: "sub-2",
            studentName: "Bruno Souza",
            status: "completed",
            auditId: "audit-2",
            result: {
              status: "success",
              suggestedGrade: 8.5,
              suggestedFeedback: "A resposta apresenta boa cobertura dos pontos solicitados.",
              confidence: "high",
              sourcesUsed: [],
              warnings: [],
              evaluationStatus: "avaliacao_valida",
            },
          },
        ],
      },
      error: null,
    });
    resumeActivityGradeSuggestionJobMock.mockResolvedValue({
      data: {
        success: true,
        jobId: "job-1",
        status: "processing",
        totalItems: 1,
        processedItems: 0,
        successCount: 0,
        errorCount: 0,
        items: [],
      },
      error: null,
    });
    approveStudentGradeSuggestionMock.mockResolvedValue({
      data: {
        success: true,
        approvedGrade: 9.5,
        approvedFeedback: "A resposta apresenta dominio consistente do conteudo.",
      },
      error: null,
    });
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      isEditMode: false,
      syncCourseIncremental: syncCourseIncrementalMock,
      isSyncing: false,
      isOfflineMode: false,
    });
    usePermissionsMock.mockReturnValue({ can: () => true });
    syncCourseIncrementalMock.mockResolvedValue(undefined);
    refetchCoursePanelMock.mockResolvedValue(undefined);

    useCoursePanelMock.mockReturnValue({
      course: {
        id: "c-1",
        name: "Curso de Matematica",
        category: "Exatas",
        last_sync: "2026-02-20T00:00:00.000Z",
        start_date: "2026-01-01T00:00:00.000Z",
        end_date: "2026-12-31T00:00:00.000Z",
        effective_end_date: "2026-03-15T12:00:00.000Z",
        moodle_course_id: "123",
      },
      students: [
        {
          id: "s-1",
          full_name: "Ana Silva",
          email: "ana@example.com",
          current_risk_level: "atencao",
          last_access: "2026-02-19T00:00:00.000Z",
          avatar_url: null,
        },
      ],
      activities: [
        {
          id: "act-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assignment",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: null,
          status: "pending",
        },
      ],
      activitySubmissions: [
        {
          id: "sub-1",
          student_id: "s-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: 9.5,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-09T00:00:00.000Z",
          submitted_at: "2026-03-09T00:00:00.000Z",
        },
        {
          id: "sub-2",
          student_id: "s-2",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-10T00:00:00.000Z",
          submitted_at: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "sub-3",
          student_id: "s-3",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "pending",
          completed_at: null,
          submitted_at: null,
        },
      ],
      stats: {
        totalStudents: 1,
        atRiskStudents: 1,
        totalActivities: 1,
        completionRate: 50,
        riskDistribution: {
          normal: 0,
          atencao: 1,
          risco: 0,
          critico: 0,
        },
      },
      isLoading: false,
      error: null,
      refetch: refetchCoursePanelMock,
      toggleActivityVisibility: toggleActivityVisibilityMock,
      isAttendanceEnabled: false,
      isLoadingAttendanceFlag: false,
      toggleAttendance: vi.fn(),
    });
  });

  it("shows loading state", () => {
    useCoursePanelMock.mockReturnValue({
      course: null,
      students: [],
      activities: [],
      stats: {
        totalStudents: 0,
        atRiskStudents: 0,
        totalActivities: 0,
        completionRate: 0,
        riskDistribution: { normal: 0, atencao: 0, risco: 0, critico: 0 },
      },
      isLoading: true,
      error: null,
      refetch: vi.fn(),
      toggleActivityVisibility: toggleActivityVisibilityMock,
      isAttendanceEnabled: false,
      isLoadingAttendanceFlag: false,
      toggleAttendance: vi.fn(),
    });

    const { container } = renderPage();
    expect(container.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
  });

  it("shows not found state when course is missing", () => {
    useCoursePanelMock.mockReturnValue({
      course: null,
      students: [],
      activities: [],
      stats: {
        totalStudents: 0,
        atRiskStudents: 0,
        totalActivities: 0,
        completionRate: 0,
        riskDistribution: { normal: 0, atencao: 0, risco: 0, critico: 0 },
      },
      isLoading: false,
      error: "Curso nao encontrado",
      refetch: vi.fn(),
      toggleActivityVisibility: toggleActivityVisibilityMock,
      isAttendanceEnabled: false,
      isLoadingAttendanceFlag: false,
      toggleAttendance: vi.fn(),
    });

    renderPage();
    expect(
      screen.getByRole("heading", { level: 2, name: /curso n/i }),
    ).toBeInTheDocument();
  });

  it("renders course overview and stats", () => {
    renderPage();

    expect(screen.getByText("Curso de Matematica")).toBeInTheDocument();
    expect(screen.getByText(/alunos matriculados/i)).toBeInTheDocument();
    expect(screen.getByText(/distribui/i)).toBeInTheDocument();
    expect(screen.getByText("15/03/2026")).toBeInTheDocument();
  });

  it("keeps course commands read-only without their explicit permissions", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({
      user: { id: "u-1" },
      isEditMode: true,
      syncCourseIncremental: syncCourseIncrementalMock,
      isSyncing: false,
      isOfflineMode: false,
    });
    usePermissionsMock.mockReturnValue({ can: () => false });
    useCoursePanelMock.mockReturnValue({
      course: {
        category: "Exatas",
        effectiveEndsAt: "2026-12-31T00:00:00.000Z",
        endsAt: "2026-12-31T00:00:00.000Z",
        id: "c-1",
        lastSyncedAt: "2026-02-20T00:00:00.000Z",
        lifecycle: "inProgress",
        moodleCourseId: "123",
        name: "Curso de Matematica",
        shortName: "MAT",
        startsAt: "2026-01-01T00:00:00.000Z",
      },
      students: [],
      activities: [{
        courseId: "c-1",
        dueAt: null,
        hidden: false,
        id: "act-1",
        isAssignment: false,
        moodleActivityId: "321",
        name: "Atividade 1",
        submissionCounts: {
          completed: 0,
          corrected: 0,
          pendingCorrection: 0,
          pendingSubmission: 0,
          total: 0,
        },
        submissions: [],
        type: "quiz",
      }],
      stats: {
        totalStudents: 0,
        atRiskStudents: 0,
        totalActivities: 1,
        completionRate: 0,
        riskDistribution: { normal: 0, atencao: 0, risco: 0, critico: 0 },
      },
      isLoading: false,
      error: null,
      refetch: refetchCoursePanelMock,
      toggleActivityVisibility: toggleActivityVisibilityMock,
      isAttendanceEnabled: true,
      isLoadingAttendanceFlag: false,
      toggleAttendance: vi.fn(),
    });

    renderPage();

    expect(screen.queryByText("Controle de presença")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /atividades \(1\)/i }));
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /presenças/i }));
    expect(screen.getByTestId("attendance-tab")).toHaveAttribute("data-can-manage", "false");
  });

  it("starts a silent course refresh when opening the course", async () => {
    renderPage();

    await waitFor(() => {
      expect(syncCourseIncrementalMock).toHaveBeenCalledWith(
        "c-1",
        ["students", "activities", "grades"],
        expect.objectContaining({ silent: true }),
      );
    });
    await waitFor(() => {
      expect(refetchCoursePanelMock).toHaveBeenCalled();
    });
  });

  it("expands assignment activity with per-student statuses", async () => {
    const user = userEvent.setup();

    useCoursePanelMock.mockReturnValue({
      course: {
        id: "c-1",
        name: "Curso de Matematica",
        category: "Exatas",
        last_sync: "2026-02-20T00:00:00.000Z",
        start_date: "2026-01-01T00:00:00.000Z",
        end_date: "2026-12-31T00:00:00.000Z",
        effective_end_date: "2026-03-15T12:00:00.000Z",
        moodle_course_id: "123",
      },
      students: [
        {
          id: "s-1",
          full_name: "Ana Silva",
          email: "ana@example.com",
          current_risk_level: "atencao",
          last_access: "2026-02-19T00:00:00.000Z",
          avatar_url: null,
        },
        {
          id: "s-2",
          full_name: "Bruno Souza",
          email: "bruno@example.com",
          current_risk_level: "normal",
          last_access: "2026-02-18T00:00:00.000Z",
          avatar_url: null,
        },
        {
          id: "s-3",
          full_name: "Carla Dias",
          email: "carla@example.com",
          current_risk_level: "risco",
          last_access: "2026-02-17T00:00:00.000Z",
          avatar_url: null,
        },
      ],
      activities: [
        {
          id: "act-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: null,
          status: "pending",
        },
      ],
      activitySubmissions: [
        {
          id: "sub-1",
          student_id: "s-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: 9.5,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-09T00:00:00.000Z",
          submitted_at: "2026-03-09T00:00:00.000Z",
        },
        {
          id: "sub-2",
          student_id: "s-2",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-10T00:00:00.000Z",
          submitted_at: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "sub-3",
          student_id: "s-3",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "pending",
          completed_at: null,
          submitted_at: null,
        },
      ],
      stats: {
        totalStudents: 3,
        atRiskStudents: 1,
        totalActivities: 1,
        completionRate: 50,
        riskDistribution: {
          normal: 1,
          atencao: 1,
          risco: 1,
          critico: 0,
        },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      toggleActivityVisibility: toggleActivityVisibilityMock,
      isAttendanceEnabled: false,
      isLoadingAttendanceFlag: false,
      toggleAttendance: vi.fn(),
    });

    renderPage();

    await user.click(screen.getByRole("tab", { name: /atividades \(1\)/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /expandir entregas/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /expandir entregas/i }));

    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText(/nota: 9.5 \/ 10/i)).toBeInTheDocument();
    expect(screen.getByText("Bruno Souza")).toBeInTheDocument();
    expect(screen.getByText("Carla Dias")).toBeInTheDocument();
    expect(screen.getAllByText(/Pendente de Cor/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Pendente de Envio")).toBeInTheDocument();
  });
  it("generates inline suggestions for pending corrections of an assignment activity", async () => {
    const user = userEvent.setup();

    useCoursePanelMock.mockReturnValue({
      course: {
        id: "c-1",
        name: "Curso de Matematica",
        category: "Exatas",
        last_sync: "2026-02-20T00:00:00.000Z",
        start_date: "2026-01-01T00:00:00.000Z",
        end_date: "2026-12-31T00:00:00.000Z",
        effective_end_date: "2026-03-15T12:00:00.000Z",
        moodle_course_id: "123",
      },
      students: [
        {
          id: "s-1",
          full_name: "Ana Silva",
          email: "ana@example.com",
          current_risk_level: "atencao",
          last_access: "2026-02-19T00:00:00.000Z",
          avatar_url: null,
        },
        {
          id: "s-2",
          full_name: "Bruno Souza",
          email: "bruno@example.com",
          current_risk_level: "normal",
          last_access: "2026-02-18T00:00:00.000Z",
          avatar_url: null,
        },
        {
          id: "s-3",
          full_name: "Carla Dias",
          email: "carla@example.com",
          current_risk_level: "risco",
          last_access: "2026-02-17T00:00:00.000Z",
          avatar_url: null,
        },
      ],
      activities: [
        {
          id: "act-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: null,
          status: "pending",
        },
      ],
      activitySubmissions: [
        {
          id: "sub-1",
          student_id: "s-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: 9.5,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-09T00:00:00.000Z",
          submitted_at: "2026-03-09T00:00:00.000Z",
        },
        {
          id: "sub-2",
          student_id: "s-2",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-10T00:00:00.000Z",
          submitted_at: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "sub-3",
          student_id: "s-3",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "pending",
          completed_at: null,
          submitted_at: null,
        },
      ],
      stats: {
        totalStudents: 3,
        atRiskStudents: 2,
        totalActivities: 1,
        completionRate: 67,
        riskDistribution: {
          normal: 1,
          atencao: 1,
          risco: 1,
          critico: 0,
        },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      toggleActivityVisibility: toggleActivityVisibilityMock,
      isAttendanceEnabled: false,
      isLoadingAttendanceFlag: false,
      toggleAttendance: vi.fn(),
    });

    renderPage();

    await user.click(screen.getByRole("tab", { name: /atividades \(1\)/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /corrigir/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /corrigir/i }));

    await waitFor(() => {
      expect(generateActivityGradeSuggestionsMock).toHaveBeenCalledWith({
        session: {
          moodleToken: "token-1",
          moodleUrl: "https://moodle.example.com",
          moodleUserId: 12,
        },
        courseId: "c-1",
        moodleActivityId: "321",
      });
    });

    await waitFor(() => {
      expect(getActivityGradeSuggestionJobMock).toHaveBeenCalledWith({
        session: {
          moodleToken: "token-1",
          moodleUrl: "https://moodle.example.com",
          moodleUserId: 12,
        },
        jobId: "job-1",
      });
    });

    expect(screen.getByLabelText("Nota sugerida para Bruno Souza")).toHaveValue("8.5");
    expect(screen.getByLabelText("Feedback sugerido para Bruno Souza")).toHaveValue("A resposta apresenta boa cobertura dos pontos solicitados.");
    expect(screen.queryByLabelText("Feedback sugerido para Ana Silva")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Feedback sugerido para Carla Dias")).not.toBeInTheDocument();
  });

  it("rehydrates an active batch correction job when the assignment is reopened", async () => {
    const user = userEvent.setup();

    useCoursePanelMock.mockReturnValue({
      course: {
        id: "c-1",
        name: "Curso de Matematica",
        category: "Exatas",
        last_sync: "2026-02-20T00:00:00.000Z",
        start_date: "2026-01-01T00:00:00.000Z",
        end_date: "2026-12-31T00:00:00.000Z",
        effective_end_date: "2026-03-15T12:00:00.000Z",
        moodle_course_id: "123",
      },
      students: [
        {
          id: "s-1",
          full_name: "Ana Silva",
          email: "ana@example.com",
          current_risk_level: "atencao",
          last_access: "2026-02-19T00:00:00.000Z",
          avatar_url: null,
        },
        {
          id: "s-2",
          full_name: "Bruno Souza",
          email: "bruno@example.com",
          current_risk_level: "normal",
          last_access: "2026-02-18T00:00:00.000Z",
          avatar_url: null,
        },
        {
          id: "s-3",
          full_name: "Carla Dias",
          email: "carla@example.com",
          current_risk_level: "risco",
          last_access: "2026-02-17T00:00:00.000Z",
          avatar_url: null,
        },
      ],
      activities: [
        {
          id: "act-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: null,
          status: "pending",
        },
      ],
      activitySubmissions: [
        {
          id: "sub-1",
          student_id: "s-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: 9.5,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-09T00:00:00.000Z",
          submitted_at: "2026-03-09T00:00:00.000Z",
        },
        {
          id: "sub-2",
          student_id: "s-2",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-10T00:00:00.000Z",
          submitted_at: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "sub-3",
          student_id: "s-3",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "pending",
          completed_at: null,
          submitted_at: null,
        },
      ],
      stats: {
        totalStudents: 3,
        atRiskStudents: 2,
        totalActivities: 1,
        completionRate: 67,
        riskDistribution: {
          normal: 1,
          atencao: 1,
          risco: 1,
          critico: 0,
        },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      toggleActivityVisibility: toggleActivityVisibilityMock,
      isAttendanceEnabled: false,
      isLoadingAttendanceFlag: false,
      toggleAttendance: vi.fn(),
    });

    findLatestRelevantActivityGradeSuggestionJobMock.mockResolvedValue({
      jobId: "job-77",
      activityName: "Atividade 1",
      courseId: "c-1",
      moodleActivityId: "321",
      status: "completed",
      totalItems: 1,
      processedItems: 1,
      successCount: 1,
      errorCount: 0,
      errorMessage: null,
      createdAt: "2026-03-27T10:30:00.000Z",
    });

    renderPage();

    await user.click(screen.getByRole("tab", { name: /atividades \(1\)/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /expandir entregas/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /expandir entregas/i }));

    await waitFor(() => {
      expect(findLatestRelevantActivityGradeSuggestionJobMock).toHaveBeenCalledWith({
        userId: "u-1",
        courseId: "c-1",
        moodleActivityId: "321",
      });
    });

    await waitFor(() => {
      expect(getActivityGradeSuggestionJobMock).toHaveBeenCalledWith({
        session: {
          moodleToken: "token-1",
          moodleUrl: "https://moodle.example.com",
          moodleUserId: 12,
        },
        jobId: "job-77",
      });
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("8.5")).toBeInTheDocument();
      expect(screen.getByDisplayValue("A resposta apresenta boa cobertura dos pontos solicitados.")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: /vis/i }));
    await user.click(screen.getByRole("tab", { name: /atividades \(1\)/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("8.5")).toBeInTheDocument();
      expect(screen.getByDisplayValue("A resposta apresenta boa cobertura dos pontos solicitados.")).toBeInTheDocument();
    });
  });

  it("closes the approved suggestion row after launching the grade", async () => {
    const user = userEvent.setup();

    useCoursePanelMock.mockReturnValue({
      course: {
        id: "c-1",
        name: "Curso de Matematica",
        category: "Exatas",
        last_sync: "2026-02-20T00:00:00.000Z",
        start_date: "2026-01-01T00:00:00.000Z",
        end_date: "2026-12-31T00:00:00.000Z",
        effective_end_date: "2026-03-15T12:00:00.000Z",
        moodle_course_id: "123",
      },
      students: [
        {
          id: "s-1",
          full_name: "Ana Silva",
          email: "ana@example.com",
          current_risk_level: "atencao",
          last_access: "2026-02-19T00:00:00.000Z",
          avatar_url: null,
        },
        {
          id: "s-2",
          full_name: "Bruno Souza",
          email: "bruno@example.com",
          current_risk_level: "normal",
          last_access: "2026-02-18T00:00:00.000Z",
          avatar_url: null,
        },
      ],
      activities: [
        {
          id: "act-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: null,
          status: "pending",
        },
      ],
      activitySubmissions: [
        {
          id: "sub-1",
          student_id: "s-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: 9.5,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-09T00:00:00.000Z",
          submitted_at: "2026-03-09T00:00:00.000Z",
        },
        {
          id: "sub-2",
          student_id: "s-2",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "completed",
          completed_at: "2026-03-10T00:00:00.000Z",
          submitted_at: "2026-03-10T00:00:00.000Z",
        },
      ],
      stats: {
        totalStudents: 2,
        atRiskStudents: 1,
        totalActivities: 1,
        completionRate: 100,
        riskDistribution: {
          normal: 1,
          atencao: 1,
          risco: 0,
          critico: 0,
        },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      toggleActivityVisibility: toggleActivityVisibilityMock,
      isAttendanceEnabled: false,
      isLoadingAttendanceFlag: false,
      toggleAttendance: vi.fn(),
    });

    renderPage();

    await user.click(screen.getByRole("tab", { name: /atividades \(1\)/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /corrigir/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /corrigir/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /lancar nota/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /lancar nota/i }));

    await waitFor(() => {
      expect(approveStudentGradeSuggestionMock).toHaveBeenCalledWith({
        session: {
          moodleToken: "token-1",
          moodleUrl: "https://moodle.example.com",
          moodleUserId: 12,
        },
        auditId: "audit-2",
        approvedGrade: 8.5,
        approvedFeedback: "A resposta apresenta boa cobertura dos pontos solicitados.",
      });
    });

    await waitFor(() => {
      expect(screen.queryByLabelText("Nota sugerida para Bruno Souza")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Feedback sugerido para Bruno Souza")).not.toBeInTheDocument();
    });
  });

  it("hides the Corrigir action when there is no pending correction", async () => {
    useCoursePanelMock.mockReturnValue({
      course: {
        id: "c-1",
        name: "Curso de Matematica",
        category: "Exatas",
        last_sync: "2026-02-20T00:00:00.000Z",
        start_date: "2026-01-01T00:00:00.000Z",
        end_date: "2026-12-31T00:00:00.000Z",
        effective_end_date: "2026-03-15T12:00:00.000Z",
        moodle_course_id: "123",
      },
      students: [
        {
          id: "s-1",
          full_name: "Ana Silva",
          email: "ana@example.com",
          current_risk_level: "atencao",
          last_access: "2026-02-19T00:00:00.000Z",
          avatar_url: null,
        },
        {
          id: "s-2",
          full_name: "Bruno Souza",
          email: "bruno@example.com",
          current_risk_level: "normal",
          last_access: "2026-02-18T00:00:00.000Z",
          avatar_url: null,
        },
      ],
      activities: [
        {
          id: "act-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: null,
          status: "pending",
        },
      ],
      activitySubmissions: [
        {
          id: "sub-1",
          student_id: "s-1",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: 9.5,
          grade_max: 10,
          status: "graded",
          completed_at: "2026-03-09T00:00:00.000Z",
          submitted_at: "2026-03-09T00:00:00.000Z",
          graded_at: "2026-03-11T00:00:00.000Z",
        },
        {
          id: "sub-2",
          student_id: "s-2",
          course_id: "c-1",
          moodle_activity_id: "321",
          activity_name: "Atividade 1",
          activity_type: "assign",
          due_date: "2026-03-10T00:00:00.000Z",
          hidden: false,
          grade: null,
          grade_max: 10,
          status: "pending",
          completed_at: null,
          submitted_at: null,
          graded_at: null,
        },
      ],
      stats: {
        totalStudents: 2,
        atRiskStudents: 1,
        totalActivities: 1,
        completionRate: 50,
        riskDistribution: {
          normal: 1,
          atencao: 1,
          risco: 0,
          critico: 0,
        },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      toggleActivityVisibility: toggleActivityVisibilityMock,
      isAttendanceEnabled: false,
      isLoadingAttendanceFlag: false,
      toggleAttendance: vi.fn(),
    });

    renderPage();

    await userEvent.click(screen.getByRole("tab", { name: /atividades \(1\)/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /expandir entregas/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /corrigir/i })).not.toBeInTheDocument();
  });
});
