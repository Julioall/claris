import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  callMoodleApiPost,
  getCourseEnrolledUsers,
  getCourseSuspendedUserIds,
  getMoodleToken,
} from "../../../../supabase/functions/_shared/moodle/client.ts";

const fetchMock = vi.fn();

describe("moodle client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("aceita resposta JSON null em chamadas POST do Moodle sem quebrar a aprovacao", async () => {
    fetchMock.mockResolvedValueOnce(new Response("null", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    const result = await callMoodleApiPost(
      "https://moodle.local",
      "token-1",
      "mod_assign_save_grade",
      { assignmentid: 10, userid: 20, grade: 8 },
    );

    expect(result).toBeNull();
  });

  it("faz fallback quando o Moodle retorna erro de parametro com acentuacao em onlyactive", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        exception: "invalid_parameter_exception",
        message: "Valor inválido de parâmetro",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 10, fullname: "Aluno 1" },
      ]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));

    const result = await getCourseEnrolledUsers(
      "https://moodle.local",
      "token-1",
      42,
    );

    expect(result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallbackRequest = fetchMock.mock.calls[1] ?? [];
    expect(String(fallbackRequest[0])).toBe("https://moodle.local/webservice/rest/server.php");
    const fallbackBody = String((fallbackRequest[1] as RequestInit | undefined)?.body ?? "");
    expect(fallbackBody).toContain("wsfunction=core_enrol_get_enrolled_users");
    expect(fallbackBody).toContain("options%5B0%5D%5Bname%5D=onlyactive");
  });

  it("envia credenciais ao endpoint de token apenas no corpo POST", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ token: "token-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(getMoodleToken(
      "https://moodle.local",
      "usuario",
      "senha-secreta",
    )).resolves.toEqual({ token: "token-1" });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://moodle.local/login/token.php");
    expect(request.method).toBe("POST");
    expect(String(request.body)).toContain("username=usuario");
    expect(String(request.body)).toContain("password=senha-secreta");
    expect(url).not.toContain("senha-secreta");
  });

  it("consulta suspensos diretamente pelo contrato options suportado", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ id: 20 }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(getCourseSuspendedUserIds(
      "https://moodle.local",
      "token-1",
      42,
    )).resolves.toEqual(new Set([20]));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "");
    expect(body).toContain("options%5B0%5D%5Bname%5D=onlysuspended");
    expect(body).toContain("options%5B0%5D%5Bvalue%5D=1");
  });
});
