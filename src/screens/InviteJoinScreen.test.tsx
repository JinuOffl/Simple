// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { InviteJoinScreen } from "./InviteJoinScreen";

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

describe("InviteJoinScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads invite info and displays app card with role badge", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        valid: true,
        app: {
          id: "app-shared-1",
          name: "Collaborative Tracker",
          icon: "📊",
          description: "A shared tracker for the team",
        },
        role: "editor",
      },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={["/join/INVITE12"]}>
        <Routes>
          <Route path="/join/:code" element={<InviteJoinScreen />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Collaborative Tracker")).toBeTruthy();
      expect(screen.getByText("📊")).toBeTruthy();
      expect(screen.getByText(/editor/i)).toBeTruthy();
      expect(screen.getByRole("button", { name: /Accept & Open App/i })).toBeTruthy();
    });
  });

  it("handles accepting an invite and navigating to the app", async () => {
    mockInvoke
      .mockResolvedValueOnce({
        data: {
          valid: true,
          app: {
            id: "app-shared-1",
            name: "Collaborative Tracker",
            icon: "📊",
          },
          role: "viewer",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          app_id: "app-shared-1",
          role: "viewer",
        },
        error: null,
      });

    render(
      <MemoryRouter initialEntries={["/join/INVITE12"]}>
        <Routes>
          <Route path="/join/:code" element={<InviteJoinScreen />} />
          <Route
            path="/app/:id"
            element={<div data-testid="target-app-runner">App Runner Active</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Accept & Open App/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Accept & Open App/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("invites", {
        body: { op: "accept", code: "INVITE12" },
      });
      expect(screen.getByTestId("target-app-runner")).toBeTruthy();
    });
  });

  it("displays expired notice when invite is expired", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        valid: false,
        expired: true,
      },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={["/join/EXPIRED1"]}>
        <Routes>
          <Route path="/join/:code" element={<InviteJoinScreen />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/This invite link has expired/i)).toBeTruthy();
    });
  });

  it("displays exhausted notice when invite has reached max uses", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        valid: false,
        exhausted: true,
      },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={["/join/EXHAUST1"]}>
        <Routes>
          <Route path="/join/:code" element={<InviteJoinScreen />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/reached its maximum uses/i)).toBeTruthy();
    });
  });
});
