import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CourseCard } from "@/components/courses/CourseCard";

describe("CourseCard", () => {
  it("renders course information and panel link", () => {
    render(
      <MemoryRouter>
        <CourseCard
          course={{
            id: "c-1",
            name: "Curso de Matematica",
            students_count: 30,
            at_risk_count: 4,
            start_date: "2026-01-10T00:00:00.000Z",
            end_date: "2026-12-20T00:00:00.000Z",
            last_sync: "2026-02-20T12:00:00.000Z",
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Curso de Matematica")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByText("6")).not.toBeInTheDocument();
    expect(screen.getByText(/sincronizado/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver painel do curso/i })).toHaveAttribute(
      "href",
      "/cursos/c-1",
    );
  });

  it("shows fallbacks for missing dates", () => {
    const { container } = render(
      <MemoryRouter>
        <CourseCard
          course={{
            id: "c-2",
            name: "Curso sem datas",
            students_count: 0,
            at_risk_count: 0,
            start_date: undefined,
            end_date: undefined,
            last_sync: undefined,
          }}
        />
      </MemoryRouter>,
    );

    const spanTexts = Array.from(container.querySelectorAll("span"))
      .map((element) => element.textContent ?? "")
      .map((text) => text.trim());

    expect(spanTexts.some((text) => /^In.+:\s-$/.test(text))).toBe(true);
    expect(spanTexts).toContain("Fim: -");
    expect(screen.getByText(/nunca/i)).toBeInTheDocument();
  });

  it("prefers the effective end date when it is available", () => {
    render(
      <MemoryRouter>
        <CourseCard
          course={{
            id: "c-3",
            name: "Curso com termino inferido",
            students_count: 0,
            at_risk_count: 0,
            start_date: "2026-01-10T00:00:00.000Z",
            end_date: "2026-12-20T00:00:00.000Z",
            effective_end_date: "2026-03-15T12:00:00.000Z",
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/fim: 15\/03\/2026/i)).toBeInTheDocument();
  });
});
