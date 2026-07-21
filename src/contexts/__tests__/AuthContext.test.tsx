import { act } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { BackgroundActivityProvider } from "@/contexts/BackgroundActivityContext";

const onAuthStateChangeMock = vi.fn();
const getSessionMock = vi.fn();
const refreshSessionMock = vi.fn();
const setSessionMock = vi.fn();
const signOutMock = vi.fn();
const invokeMock = vi.fn();
const toastMock = vi.fn();
const encryptSessionDataMock = vi.fn();
const decryptSessionDataMock = vi.fn();
const trackUsageMock = vi.fn();
const telemetryLogErrorMock = vi.fn();
const listActiveMoodleSyncJobsMock = vi.fn();
const listAvailableMoodleCoursesMock = vi.fn();
const startInitialMoodleSyncMock = vi.fn();
const startCourseMoodleSyncMock = vi.fn();
const waitForMoodleSyncJobMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (...args: unknown[]) => onAuthStateChangeMock(...args),
      getSession: (...args: unknown[]) => getSessionMock(...args),
      refreshSession: (...args: unknown[]) => refreshSessionMock(...args),
      setSession: (...args: unknown[]) => setSessionMock(...args),
      signOut: (...args: unknown[]) => signOutMock(...args),
    },
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock("@/features/auth/api/moodle-sync-jobs", () => ({
  listActiveMoodleSyncJobs: (...args: unknown[]) => listActiveMoodleSyncJobsMock(...args),
  listAvailableMoodleCourses: (...args: unknown[]) => listAvailableMoodleCoursesMock(...args),
  startInitialMoodleSync: (...args: unknown[]) => startInitialMoodleSyncMock(...args),
  startCourseMoodleSync: (...args: unknown[]) => startCourseMoodleSyncMock(...args),
  waitForMoodleSyncJob: (...args: unknown[]) => waitForMoodleSyncJobMock(...args),
}));

vi.mock("@/integrations/telemetry/telemetry-client", () => ({
  telemetryClient: {
    trackUsage: (...args: unknown[]) => trackUsageMock(...args),
    logError: (...args: unknown[]) => telemetryLogErrorMock(...args),
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

vi.mock("@/lib/session-crypto", () => ({
  encryptSessionData: (...args: unknown[]) => encryptSessionDataMock(...args),
  decryptSessionData: (...args: unknown[]) => decryptSessionDataMock(...args),
}));

let authRef: ReturnType<typeof useAuth> | null = null;

function Probe() {
  authRef = useAuth();
  return null;
}

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <BackgroundActivityProvider>
      {ui}
    </BackgroundActivityProvider>,
  );
}

describe("AuthContext", () => {
  let currentSession: {
    access_token: string;
    refresh_token: string;
    user: { id: string; email: string };
  } | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    authRef = null;
    sessionStorage.clear();
    currentSession = null;

    onAuthStateChangeMock.mockImplementation(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    }));
    getSessionMock.mockImplementation(async () => ({ data: { session: currentSession } }));
    refreshSessionMock.mockImplementation(async () => ({ data: { session: currentSession }, error: null }));
    setSessionMock.mockImplementation(async (session: { access_token: string; refresh_token: string }) => {
      currentSession = {
        ...session,
        user: { id: "u-1", email: "user@example.test" },
      };
      return { error: null };
    });
    signOutMock.mockImplementation(async () => {
      currentSession = null;
      return { error: null };
    });
    encryptSessionDataMock.mockResolvedValue("encrypted-session");
    decryptSessionDataMock.mockResolvedValue(null);
    trackUsageMock.mockResolvedValue(undefined);
    telemetryLogErrorMock.mockResolvedValue(undefined);
    listActiveMoodleSyncJobsMock.mockResolvedValue([]);
    listAvailableMoodleCoursesMock.mockResolvedValue([]);
    waitForMoodleSyncJobMock.mockImplementation(async (
      job: unknown,
      onProgress?: (value: unknown) => void,
    ) => {
      onProgress?.(job);
      return job;
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("throws when useAuth is used outside provider", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const Broken = () => {
      useAuth();
      return null;
    };

    expect(() => render(<Broken />)).toThrow(/useAuth must be used within an AuthProvider/i);
    consoleErrorSpy.mockRestore();
  });

  it("logs in successfully and persists session", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        user: { id: "u-1", full_name: "Julio Tutor", moodle_user_id: "10", last_sync: null },
        moodleToken: "token-1",
        moodleUserId: 10,
        session: { access_token: "access", refresh_token: "refresh" },
      },
      error: null,
    });

    renderWithProviders(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(authRef?.isLoading).toBe(false);
    });

    let loginResult = false;
    await act(async () => {
      loginResult = (await authRef!.login("julio", "secret", "https://moodle.local/")) as boolean;
    });

    expect(loginResult).toBe(true);
    expect(setSessionMock).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
    expect(invokeMock).toHaveBeenCalledWith("moodle-auth", expect.objectContaining({
      body: {
        moodleUrl: "https://moodle.local",
        username: "julio",
        password: "secret",
        service: "moodle_mobile_app",
      },
      headers: expect.objectContaining({
        "x-claris-api-version": "1",
        "x-correlation-id": expect.any(String),
      }),
      signal: expect.any(AbortSignal),
    }));
    expect(encryptSessionDataMock).toHaveBeenCalled();
    expect(sessionStorage.getItem("session")).toBe("encrypted-session");
    expect(authRef?.isAuthenticated).toBe(true);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/login realizado com sucesso/i) }),
    );
  });

  it("shows destructive toast when moodle returns invalid credentials", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { error: "invalid login", errorcode: "invalidlogin" },
      error: null,
    });

    renderWithProviders(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(authRef?.isLoading).toBe(false);
    });

    let loginResult = true;
    await act(async () => {
      loginResult = (await authRef!.login("julio", "wrong", "https://moodle.local")) as boolean;
    });

    expect(loginResult).toBe(false);
    expect(authRef?.isAuthenticated).toBe(false);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/erro de autenticacao/i),
        description: expect.stringMatching(/usuario ou senha invalidos/i),
        variant: "destructive",
      }),
    );
  });

  it("shows a helpful toast when the function invocation fails due to DNS resolution", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "{\"message\":\"name resolution failed\"}" },
    });

    renderWithProviders(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(authRef?.isLoading).toBe(false);
    });

    let loginResult = true;
    await act(async () => {
      loginResult = (await authRef!.login("julio", "secret", "https://moodle.local")) as boolean;
    });

    expect(loginResult).toBe(false);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/erro de autenticacao/i),
        description: expect.stringMatching(/localizar o endereco do moodle/i),
        variant: "destructive",
      }),
    );
  });

  it("shows a helpful toast when Moodle returns a network error", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        error: "Erro de conexao: name resolution failed",
        errorcode: "network_error",
      },
      error: null,
    });

    renderWithProviders(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(authRef?.isLoading).toBe(false);
    });

    let loginResult = true;
    await act(async () => {
      loginResult = (await authRef!.login("julio", "secret", "https://moodle.local")) as boolean;
    });

    expect(loginResult).toBe(false);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/erro de autenticacao/i),
        description: expect.stringMatching(/localizar o endereco do moodle/i),
        variant: "destructive",
      }),
    );
  });

  it("syncs courses and opens course selector, then allows logout", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        user: { id: "u-1", full_name: "Julio Tutor", moodle_user_id: "10", last_sync: null },
        moodleToken: "token-1",
        moodleUserId: 10,
        session: { access_token: "access", refresh_token: "refresh" },
      },
      error: null,
    });
    listAvailableMoodleCoursesMock.mockResolvedValueOnce([
      {
        id: "c-1",
        moodle_course_id: "101",
        name: "Matematica",
        short_name: "MAT",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);

    renderWithProviders(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(authRef?.isLoading).toBe(false);
    });

    await act(async () => {
      await authRef!.login("julio", "secret", "https://moodle.local");
    });

    await act(async () => {
      await authRef!.syncData();
    });

    expect(authRef?.courses).toHaveLength(1);
    expect(authRef?.showCourseSelector).toBe(true);
    expect(listAvailableMoodleCoursesMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await authRef!.logout();
    });

    expect(signOutMock).toHaveBeenCalled();
    expect(authRef?.isAuthenticated).toBe(false);
    expect(sessionStorage.getItem("session")).toBeNull();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/logout realizado/i) }),
    );
  });

  it("opens selector immediately in syncData when courses are already cached", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        user: {
          id: "u-1",
          full_name: "Julio Tutor",
          moodle_user_id: "10",
          moodle_username: "julio",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        moodleToken: "token-1",
        moodleUserId: 10,
        session: { access_token: "access", refresh_token: "refresh" },
      },
      error: null,
    });

    renderWithProviders(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(authRef?.isLoading).toBe(false);
    });

    await act(async () => {
      await authRef!.login("julio", "secret", "https://moodle.local");
    });

    await act(async () => {
      authRef!.setCourses([
        {
          id: "c-1",
          moodle_course_id: "101",
          name: "Matematica",
          short_name: "MAT",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ]);
    });

    listAvailableMoodleCoursesMock.mockClear();

    await act(async () => {
      await authRef!.syncData();
    });

    expect(authRef?.showCourseSelector).toBe(true);
    expect(listAvailableMoodleCoursesMock).not.toHaveBeenCalled();
  });

  it("runs syncSelectedCourses end-to-end", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        user: {
          id: "u-1",
          full_name: "Julio Tutor",
          moodle_user_id: "10",
          moodle_username: "julio",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        moodleToken: "token-1",
        moodleUserId: 10,
        session: { access_token: "access", refresh_token: "refresh" },
      },
      error: null,
    });

    const completedJob = {
      completedAt: "2026-01-01T00:05:00.000Z",
      courseIds: ["c-1"],
      createdAt: "2026-01-01T00:00:00.000Z",
      entities: ["students", "activities", "grades"],
      errorCount: 0,
      errorMessage: null,
      id: "job-1",
      kind: "initial",
      processedItems: 12,
      startedAt: "2026-01-01T00:00:01.000Z",
      status: "completed",
      steps: [
        { entity: "courses", errorMessage: null, processedItems: 1, recordCount: 1, status: "completed", totalItems: 1 },
        { entity: "students", errorMessage: null, processedItems: 2, recordCount: 2, status: "completed", totalItems: 2 },
        { entity: "activities", errorMessage: null, processedItems: 3, recordCount: 3, status: "completed", totalItems: 3 },
        { entity: "grades", errorMessage: null, processedItems: 4, recordCount: 4, status: "completed", totalItems: 4 },
        { entity: "risk", errorMessage: null, processedItems: 2, recordCount: 2, status: "completed", totalItems: 2 },
      ],
      successCount: 5,
      totalItems: 12,
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    startInitialMoodleSyncMock.mockResolvedValueOnce({
      contractVersion: 1,
      duplicate: false,
      job: completedJob,
    });

    renderWithProviders(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(authRef?.isLoading).toBe(false);
    });

    await act(async () => {
      await authRef!.login("julio", "secret", "https://moodle.local");
    });

    await act(async () => {
      authRef!.setCourses([
        {
          id: "c-1",
          moodle_course_id: "101",
          name: "Matematica",
          short_name: "MAT",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "c-2",
          moodle_course_id: "102",
          name: "Fisica",
          short_name: "FIS",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ]);
    });

    await act(async () => {
      await authRef!.syncSelectedCourses(["c-1"]);
    });

    await waitFor(() => {
      expect(authRef?.syncProgress.isComplete).toBe(true);
    });

    expect(authRef?.courses.map((course) => course.id)).toEqual(["c-1", "c-2"]);

    expect(startInitialMoodleSyncMock).toHaveBeenCalledWith(["c-1"]);
    expect(waitForMoodleSyncJobMock).toHaveBeenCalledWith(completedJob, expect.any(Function));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/sincronizacao inicial concluida/i) }),
    );
  });

  it("clears claris chat history from localStorage on logout", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        user: { id: "u-logout", full_name: "Tutor", moodle_user_id: "20", last_sync: null },
        moodleToken: "token-x",
        moodleUserId: 20,
        session: { access_token: "access", refresh_token: "refresh" },
      },
      error: null,
    });

    renderWithProviders(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(authRef?.isLoading).toBe(false));

    await act(async () => {
      await authRef!.login("tutor", "pass", "https://moodle.local");
    });

    localStorage.setItem("claris_chat_history:u-logout", JSON.stringify([{ role: "user", content: "OlÃ¡" }]));

    await act(async () => {
      await authRef!.logout();
    });

    expect(localStorage.getItem("claris_chat_history:u-logout")).toBeNull();
  });
});
