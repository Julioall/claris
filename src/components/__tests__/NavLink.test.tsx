import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NavLink } from "@/components/NavLink";

describe("NavLink", () => {
  it("applies activeClassName for active route", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <NavLink
          to="/dashboard"
          className="base"
          activeClassName="active"
        >
          Dashboard
        </NavLink>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass(
      "base",
      "active",
    );
  });

  it("does not apply activeClassName for inactive route", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <NavLink
          to="/students"
          className="base"
          activeClassName="active"
        >
          Students
        </NavLink>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Students" })).toHaveClass("base");
    expect(screen.getByRole("link", { name: "Students" })).not.toHaveClass("active");
  });
});
