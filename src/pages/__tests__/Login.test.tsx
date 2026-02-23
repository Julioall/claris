import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "@/pages/Login";

const loginMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    login: loginMock,
    isLoading: false,
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe("Login page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loginMock.mockResolvedValue(true);
  });

  it("validates required credentials before attempting login", async () => {
    const user = userEvent.setup();
    render(<Login />);

    await user.click(screen.getByRole("button", { name: /entrar/i }));

    expect(screen.getByText(/preencha todos os campos/i)).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("toggles password visibility and advanced settings", async () => {
    const user = userEvent.setup();
    render(<Login />);

    const passwordInput = screen.getByLabelText(/senha/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "" }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /configur/i }));
    expect(screen.getByLabelText(/url do moodle/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nome do servi/i)).toBeInTheDocument();
  });

  it("navigates to dashboard when login succeeds", async () => {
    const user = userEvent.setup();
    render(<Login />);

    await user.type(screen.getByLabelText(/usu/i), "julio");
    await user.type(screen.getByLabelText(/senha/i), "123456");
    await user.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith(
        "julio",
        "123456",
        "https://ead.fieg.com.br",
        "moodle_mobile_app",
      );
    });
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("does not navigate when login fails", async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue(false);
    render(<Login />);

    await user.type(screen.getByLabelText(/usu/i), "julio");
    await user.type(screen.getByLabelText(/senha/i), "123456");
    await user.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1);
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
