import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const onAuthStateChangeMock = vi.fn();
const getSessionMock = vi.fn();
const setSessionMock = vi.fn();
const signOutMock = vi.fn();
const invokeMock = vi.fn();
const toastMock = vi.fn();
const encryptSessionDataMock = vi.fn();
const decryptSessionDataMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (...args: unknown[]) => onAuthStateChangeMock(...args),
      getSession: (...args: unknown[]) => getSessionMock(...args),
      setSession: (...args: unknown[]) => setSessionMock(...args),
      signOut: (...args: unknown[]) => signOutMock(...args),
    },
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
      })),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })),
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

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRef = null;
    sessionStorage.clear();

    onAuthStateChangeMock.mockImplementation(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    }));
    getSessionMock.mockResolvedValue({ data: { session: null } });
    setSessionMock.mockResolvedValue({ error: null });
    signOutMock.mockResolvedValue({ error: null });
    encryptSessionDataMock.mockResolvedValue("encrypted-session");
    decryptSessionDataMock.mockResolvedValue(null);
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

    render(
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
    expect(invokeMock).toHaveBeenCalledWith("moodle-api", {
      body: {
        action: "login",
        moodleUrl: "https://moodle.local",
        username: "julio",
        password: "secret",
        service: "moodle_mobile_app",
      },
    });
    expect(encryptSessionDataMock).toHaveBeenCalled();
    expect(sessionStorage.getItem("actim_session")).toBe("encrypted-session");
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

    render(
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

  it("syncs courses and opens course selector, then allows logout", async () => {
    invokeMock
      .mockResolvedValueOnce({
        data: {
          user: { id: "u-1", full_name: "Julio Tutor", moodle_user_id: "10", last_sync: null },
          moodleToken: "token-1",
          moodleUserId: 10,
          session: { access_token: "access", refresh_token: "refresh" },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          courses: [{ id: "c-1", moodle_course_id: "101", short_name: "Matematica" }],
        },
        error: null,
      });

    render(
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

    await act(async () => {
      await authRef!.logout();
    });

    expect(signOutMock).toHaveBeenCalled();
    expect(authRef?.isAuthenticated).toBe(false);
    expect(sessionStorage.getItem("actim_session")).toBeNull();
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

    render(
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

    invokeMock.mockClear();

    await act(async () => {
      await authRef!.syncData();
    });

    expect(authRef?.showCourseSelector).toBe(true);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("runs syncSelectedCourses end-to-end and fills sync summary", async () => {
    invokeMock.mockImplementation((_fn: string, params: { body: Record<string, unknown> }) => {
      const action = params.body.action;

      if (action === "login") {
        return Promise.resolve({
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
      }

      if (action === "link_selected_courses") {
        return Promise.resolve({ data: { ok: true }, error: null });
      }

      if (action === "sync_courses") {
        return Promise.resolve({
          data: {
            courses: [
              {
                id: "c-1",
                moodle_course_id: "101",
                name: "Matematica",
                short_name: "MAT",
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-01T00:00:00.000Z",
              },
            ],
          },
          error: null,
        });
      }

      if (action === "sync_students") {
        return Promise.resolve({ data: { students: [{ id: 1 }, { id: 2 }] }, error: null });
      }

      if (action === "sync_activities") {
        return Promise.resolve({ data: { activitiesCount: 3 }, error: null });
      }

      if (action === "sync_grades") {
        return Promise.resolve({ data: { gradesCount: 4 }, error: null });
      }

      return Promise.resolve({ data: {}, error: null });
    });

    render(
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

    await act(async () => {
      await authRef!.syncSelectedCourses(["c-1"]);
    });

    await waitFor(() => {
      expect(authRef?.syncProgress.isComplete).toBe(true);
    });

    expect(authRef?.syncProgress.summary).toEqual({
      courses: 1,
      students: 2,
      activities: 3,
      grades: 4,
    });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/sincronizacao concluida/i) }),
    );
  });
});
