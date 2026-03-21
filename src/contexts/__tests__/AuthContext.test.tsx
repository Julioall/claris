import { act } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const onAuthStateChangeMock = vi.fn();
const getSessionMock = vi.fn();
const setSessionMock = vi.fn();
const signOutMock = vi.fn();
const invokeMock = vi.fn();
const rpcMock = vi.fn();
const toastMock = vi.fn();
const encryptSessionDataMock = vi.fn();
const decryptSessionDataMock = vi.fn();
const fetchMock = vi.fn();
const fromMock = vi.fn();
const fromInsertMock = vi.fn();

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
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
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
    vi.stubGlobal("fetch", fetchMock);

    onAuthStateChangeMock.mockImplementation(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    }));
    getSessionMock.mockResolvedValue({ data: { session: null } });
    setSessionMock.mockResolvedValue({ error: null });
    signOutMock.mockResolvedValue({ error: null });
    rpcMock.mockResolvedValue({ data: 2, error: null });
    encryptSessionDataMock.mockResolvedValue("encrypted-session");
    decryptSessionDataMock.mockResolvedValue(null);
    fromInsertMock.mockResolvedValue({ error: null });
    fromMock.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
      })),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      insert: (...args: unknown[]) => fromInsertMock(...args),
    }));
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
    expect(invokeMock).toHaveBeenCalledWith("moodle-auth", {
      body: {
        moodleUrl: "https://moodle.local",
        username: "julio",
        password: "secret",
        service: "moodle_mobile_app",
      },
    });
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

  it("shows a helpful toast when the function invocation fails due to DNS resolution", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "{\"message\":\"name resolution failed\"}" },
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

    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

      if (url.endsWith("/moodle-sync-courses") && body.action === "link_selected_courses") {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      if (url.endsWith("/moodle-sync-courses")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
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
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }

      if (url.endsWith("/moodle-sync-students")) {
        return Promise.resolve(
          new Response(JSON.stringify({ students: [{ id: 1 }, { id: 2 }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      if (url.endsWith("/moodle-sync-activities")) {
        return Promise.resolve(
          new Response(JSON.stringify({ activitiesCount: 3 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      if (url.endsWith("/moodle-sync-grades")) {
        return Promise.resolve(
          new Response(JSON.stringify({ gradesCount: 4 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      throw new Error(`Unexpected fetch call: ${url}`);
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

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/moodle-sync-courses$/),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/moodle-sync-students$/),
      expect.anything(),
    );
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/sincronizacao inicial concluida/i) }),
    );

    await waitFor(() => {
      expect(fromMock).toHaveBeenCalledWith("activity_feed");
    });
    expect(fromInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "sync_finish",
        title: "Sincronizacao concluida",
      }),
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

    render(
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
