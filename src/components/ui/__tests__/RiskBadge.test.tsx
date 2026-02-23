import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RiskBadge } from "@/components/ui/RiskBadge";

describe("RiskBadge", () => {
  it("renders label for normal risk level", () => {
    render(<RiskBadge level="normal" />);
    expect(screen.getByText(/normal/i)).toBeInTheDocument();
  });

  it("renders label for atencao risk level", () => {
    render(<RiskBadge level="atencao" />);
    expect(screen.getByText(/aten/i)).toBeInTheDocument();
  });

  it("renders label for risco risk level", () => {
    render(<RiskBadge level="risco" />);
    expect(screen.getByText(/^risco$/i)).toBeInTheDocument();
  });

  it("renders label for critico risk level", () => {
    render(<RiskBadge level="critico" />);
    expect(screen.getByText(/cr.tico/i)).toBeInTheDocument();
  });

  it("applies custom class and hides dot when requested", () => {
    const { container } = render(
      <RiskBadge level="normal" className="custom" showDot={false} size="sm" />,
    );

    expect(container.firstChild).toHaveClass("custom", "text-xs", "px-1.5", "py-0.5");
    expect(container.querySelector(".rounded-full")).not.toBeInTheDocument();
  });
});
