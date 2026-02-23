import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";

vi.mock("input-otp", async () => {
  const ReactModule = await import("react");
  const OTPInputContext = ReactModule.createContext({
    slots: [
      { char: "1", hasFakeCaret: false, isActive: false },
      { char: "2", hasFakeCaret: true, isActive: true },
    ],
  });

  const OTPInput = ReactModule.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { containerClassName?: string }
  >(({ children, containerClassName: _containerClassName, ...props }, ref) => (
      <div ref={ref} data-testid="otp-input" {...props}>
        {children}
      </div>
    ));

  return { OTPInput, OTPInputContext };
});

describe("ui/input-otp", () => {
  it("renders OTP input root and group/separator", () => {
    render(
      <div>
        <InputOTP maxLength={6}><InputOTPGroup><InputOTPSlot index={0} /></InputOTPGroup></InputOTP>
        <InputOTPGroup data-testid="otp-group">grupo</InputOTPGroup>
        <InputOTPSeparator />
      </div>,
    );

    expect(screen.getByTestId("otp-input")).toBeInTheDocument();
    expect(screen.getByTestId("otp-group")).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("renders slot char and active caret from context", () => {
    render(
      <InputOTPGroup>
        <InputOTPSlot index={1} />
      </InputOTPGroup>,
    );

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(document.querySelector(".animate-caret-blink")).toBeInTheDocument();
  });
});
