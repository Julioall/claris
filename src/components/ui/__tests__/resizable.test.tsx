import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

describe("ui/resizable", () => {
  it("renders panel group and panels", () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={50}>Painel A</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50}>Painel B</ResizablePanel>
      </ResizablePanelGroup>,
    );

    expect(screen.getByText("Painel A")).toBeInTheDocument();
    expect(screen.getByText("Painel B")).toBeInTheDocument();
  });

  it("renders handle grip when withHandle is true", () => {
    const { container } = render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={50}>A</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50}>B</ResizablePanel>
      </ResizablePanelGroup>,
    );

    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
