import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

describe("ui/pagination", () => {
  it("renders pagination nav and list structure", () => {
    render(
      <Pagination>
        <PaginationContent data-testid="pagination-content">
          <PaginationItem>
            <PaginationPrevious href="#prev" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#1" isActive>
              1
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#next" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    expect(screen.getByRole("navigation", { name: /pagination/i })).toBeInTheDocument();
    expect(screen.getByTestId("pagination-content").tagName).toBe("UL");
    expect(screen.getByRole("link", { name: /go to previous page/i })).toHaveAttribute("href", "#prev");
    expect(screen.getByRole("link", { name: /go to next page/i })).toHaveAttribute("href", "#next");
  });

  it("marks active link and renders ellipsis assistive text", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#2" isActive>
              2
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    expect(screen.getByRole("link", { name: "2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(/more pages/i)).toBeInTheDocument();
  });
});
