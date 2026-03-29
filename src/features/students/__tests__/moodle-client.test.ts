import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  callMoodleApiPost,
  getCourseEnrolledUsers,
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
    const fallbackUrl = String(fetchMock.mock.calls[1]?.[0] ?? "");
    expect(fallbackUrl).toContain("core_enrol_get_enrolled_users");
    expect(
      fallbackUrl.includes("onlyactive=0") ||
        fallbackUrl.includes("options%5B0%5D%5Bname%5D=onlyactive"),
    ).toBe(true);
  });
});
