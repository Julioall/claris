import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listBulkSendAudienceForUser,
  startBulkMessageSend,
} from "@/features/messages/api/bulk-messaging.repository";

const invokeMock = vi.fn();
const fromMock = vi.fn();
const listAccessibleCourseIdsMock = vi.fn();

vi.mock("@/lib/course-access", () => ({
  listAccessibleCourseIds: (...args: unknown[]) =>
    listAccessibleCourseIdsMock(...args),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const input = {
  userId: "user-1",
  messageContent: "  Aviso importante  ",
  moodleUrl: "https://moodle.example.com",
  moodleToken: "token-123",
  recipients: [
    {
      studentId: "student-1",
      moodleUserId: "moodle-1",
      studentName: "Aluno 1",
      personalizedMessage: "Aviso importante",
    },
  ],
};

describe("startBulkMessageSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invoca a edge function e mapeia resposta de duplicidade", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { kind: "duplicate", jobId: "job-duplicate" },
      error: null,
    });

    await expect(startBulkMessageSend(input)).resolves.toEqual({
      kind: "duplicate",
      jobId: "job-duplicate",
    });

    expect(invokeMock).toHaveBeenCalledWith("bulk-message-send", {
      body: {
        message_content: "Aviso importante",
        moodleUrl: "https://moodle.example.com",
        origin: "manual",
        recipients: [
          {
            moodle_user_id: "moodle-1",
            personalized_message: "Aviso importante",
            student_id: "student-1",
            student_name: "Aluno 1",
          },
        ],
        token: "token-123",
      },
    });
  });

  it("retorna job iniciado quando a edge function aceita o envio", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { kind: "started", jobId: "job-started" },
      error: null,
    });

    await expect(startBulkMessageSend(input)).resolves.toEqual({
      kind: "started",
      jobId: "job-started",
    });
  });

  it("carrega audiencia em batches para evitar URIs gigantes no PostgREST", async () => {
    const courseIds = Array.from(
      { length: 120 },
      (_, index) => `course-${index + 1}`,
    );
    const batchCalls: Record<string, string[][]> = {
      courses: [],
      student_courses: [],
      student_course_grades: [],
      student_activities: [],
    };

    listAccessibleCourseIdsMock.mockResolvedValueOnce(courseIds);

    fromMock.mockImplementation((table: string) => ({
      select: () => {
        const query = {
          eq: () => query,
          in: (_column: string, values: string[]) => {
            if (table in batchCalls) {
              batchCalls[table].push(values);
            }

            if (table === "courses") {
              return Promise.resolve({
                data: values.map((id) => ({
                  id,
                  name: `Curso ${id}`,
                  category: "Escola / Curso / Turma / UC",
                  start_date: null,
                })),
                error: null,
              });
            }

            if (table === "student_courses") {
              return Promise.resolve({
                data: values.map((courseId) => ({
                  student_id: `student-${courseId}`,
                  course_id: courseId,
                  enrollment_status: "ativo",
                  last_access: null,
                  students: {
                    id: `student-${courseId}`,
                    full_name: `Aluno ${courseId}`,
                    email: `${courseId}@mail.test`,
                    moodle_user_id: `moodle-${courseId}`,
                    current_risk_level: "normal",
                    last_access: null,
                  },
                })),
                error: null,
              });
            }

            return Promise.resolve({ data: [], error: null });
          },
        };

        return query;
      },
    }));

    const result = await listBulkSendAudienceForUser("user-1");

    expect(result.students).toHaveLength(120);
    expect(batchCalls.courses).toHaveLength(3);
    expect(batchCalls.student_courses).toHaveLength(3);
    expect(batchCalls.student_course_grades).toHaveLength(3);
    expect(batchCalls.student_activities).toHaveLength(3);
    expect(batchCalls.courses.every((batch) => batch.length <= 50)).toBe(true);
    expect(
      batchCalls.student_courses.every((batch) => batch.length <= 50),
    ).toBe(true);
    expect(
      batchCalls.student_course_grades.every((batch) => batch.length <= 50),
    ).toBe(true);
    expect(
      batchCalls.student_activities.every((batch) => batch.length <= 50),
    ).toBe(true);
  });
});
