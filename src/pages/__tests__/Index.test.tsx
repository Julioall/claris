import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Index from "@/pages/Index";

describe("Index page", () => {
  it("renders fallback welcome content", () => {
    render(<Index />);

    expect(screen.getByText(/welcome to your blank app/i)).toBeInTheDocument();
    expect(
      screen.getByText(/start building your amazing project here/i),
    ).toBeInTheDocument();
  });
});
