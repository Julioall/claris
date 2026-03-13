import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

const useEmblaCarouselMock = vi.fn();

const emblaOnMock = vi.fn();
const emblaOffMock = vi.fn();
const emblaScrollPrevMock = vi.fn();
const emblaScrollNextMock = vi.fn();
const emblaCanScrollPrevMock = vi.fn();
const emblaCanScrollNextMock = vi.fn();

const emblaApiMock = {
  on: (...args: unknown[]) => emblaOnMock(...args),
  off: (...args: unknown[]) => emblaOffMock(...args),
  scrollPrev: () => emblaScrollPrevMock(),
  scrollNext: () => emblaScrollNextMock(),
  canScrollPrev: () => emblaCanScrollPrevMock(),
  canScrollNext: () => emblaCanScrollNextMock(),
};

vi.mock("embla-carousel-react", () => ({
  default: function TestWrapper(...args: unknown[]) { return useEmblaCarouselMock(...args); },
}));

describe("ui/carousel", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    emblaCanScrollPrevMock.mockReturnValue(false);
    emblaCanScrollNextMock.mockReturnValue(true);

    useEmblaCarouselMock.mockReturnValue([vi.fn(), emblaApiMock]);
  });

  it("throws when carousel subcomponents are used outside Carousel", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<CarouselContent />)).toThrow(/useCarousel must be used within a <Carousel \/>/i);

    consoleErrorSpy.mockRestore();
  });

  it("renders horizontal carousel and wires embla events", async () => {
    const user = userEvent.setup();
    const setApi = vi.fn();

    const { unmount } = render(
      <Carousel setApi={setApi}>
        <CarouselContent>
          <CarouselItem>Slide 1</CarouselItem>
          <CarouselItem>Slide 2</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    );

    expect(screen.getByRole("region", { name: "" })).toHaveAttribute("aria-roledescription", "carousel");
    const slides = screen.getAllByRole("group");
    expect(slides).toHaveLength(2);
    expect(slides[0]).toHaveAttribute("aria-roledescription", "slide");

    expect(setApi).toHaveBeenCalledWith(emblaApiMock);
    expect(emblaOnMock).toHaveBeenCalledWith("reInit", expect.any(Function));
    expect(emblaOnMock).toHaveBeenCalledWith("select", expect.any(Function));

    const previousButton = screen.getByRole("button", { name: /previous slide/i });
    const nextButton = screen.getByRole("button", { name: /next slide/i });

    expect(previousButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    await user.click(nextButton);
    expect(emblaScrollNextMock).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("region"), { key: "ArrowLeft" });
    fireEvent.keyDown(screen.getByRole("region"), { key: "ArrowRight" });
    expect(emblaScrollPrevMock).toHaveBeenCalledTimes(1);
    expect(emblaScrollNextMock).toHaveBeenCalledTimes(2);

    unmount();
    expect(emblaOffMock).toHaveBeenCalledWith("select", expect.any(Function));
  });

  it("applies vertical orientation classes", () => {
    render(
      <Carousel orientation="vertical">
        <CarouselContent data-testid="content">
          <CarouselItem data-testid="item">Slide V</CarouselItem>
        </CarouselContent>
        <CarouselPrevious data-testid="prev" />
        <CarouselNext data-testid="next" />
      </Carousel>,
    );

    expect(screen.getByTestId("content").className).toContain("-mt-4");
    expect(screen.getByTestId("item").className).toContain("pt-4");
    expect(screen.getByTestId("prev").className).toContain("rotate-90");
    expect(screen.getByTestId("next").className).toContain("rotate-90");
  });

  it("passes axis option to embla according to orientation", () => {
    render(
      <Carousel orientation="vertical" opts={{ loop: true }}>
        <CarouselContent>
          <CarouselItem>Slide</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    expect(useEmblaCarouselMock).toHaveBeenCalledWith(
      expect.objectContaining({ axis: "y", loop: true }),
      undefined,
    );
  });
});
