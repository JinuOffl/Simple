// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ShareModal } from "./ShareModal";

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

describe("ShareModal", () => {
  const defaultMembers = [
    {
      id: "m-1",
      user_id: "owner123-user-1111",
      role: "owner",
      created_at: "2026-01-01T00:00:00Z",
      is_owner: true,
    },
    {
      id: "m-2",
      user_id: "editor12-user-2222",
      role: "editor",
      created_at: "2026-01-02T00:00:00Z",
      is_owner: false,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation((fn: string, options?: { body: { op: string } }) => {
      if (fn === "invites" && options?.body?.op === "list_members") {
        return Promise.resolve({ data: { members: defaultMembers }, error: null });
      }
      if (fn === "invites" && options?.body?.op === "create") {
        return Promise.resolve({
          data: {
            success: true,
            invite: {
              id: "inv-1",
              code: "ABC12345",
              role: "editor",
              max_uses: 10,
              uses: 0,
            },
          },
          error: null,
        });
      }
      if (fn === "invites" && options?.body?.op === "remove_member") {
        return Promise.resolve({ data: { success: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders owner view with invite creation controls and member list", async () => {
    const onClose = vi.fn();
    render(
      <ShareModal
        appId="app-123"
        appName="Test App"
        isOwner={true}
        onClose={onClose}
      />
    );

    expect(screen.getByText(/Collaborate · Test App/i)).toBeTruthy();
    expect(screen.getByText(/Generate Invite Link/i)).toBeTruthy();
    expect(screen.getByText(/Create Invite Link/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(/owner123/i)).toBeTruthy();
      expect(screen.getByText(/editor12/i)).toBeTruthy();
    });

    // Remove button should appear for non-owner member
    expect(screen.getByText(/Remove/i)).toBeTruthy();
  });

  it("generates an invite link and handles copying", async () => {
    // Mock navigator.clipboard
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    });

    render(
      <ShareModal
        appId="app-123"
        appName="Test App"
        isOwner={true}
        onClose={vi.fn()}
      />
    );

    const createBtn = screen.getByText(/Create Invite Link/i);
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText(/Copy Link/i)).toBeTruthy();
    });

    expect(mockInvoke).toHaveBeenCalledWith("invites", {
      body: {
        op: "create",
        app_id: "app-123",
        role: "editor",
        max_uses: 10,
      },
    });

    const copyBtn = screen.getByText(/Copy Link/i);
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalled();
      expect(screen.getByText(/Copied to Clipboard/i)).toBeTruthy();
    });
  });

  it("renders non-owner view without invite link generator or remove buttons", async () => {
    render(
      <ShareModal
        appId="app-123"
        appName="Test App"
        isOwner={false}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText(/Generate Invite Link/i)).toBeNull();
    expect(screen.queryByText(/Create Invite Link/i)).toBeNull();

    await waitFor(() => {
      expect(screen.getByText(/owner123/i)).toBeTruthy();
    });

    expect(screen.queryByText(/Remove/i)).toBeNull();
  });

  it("handles member removal by owner", async () => {
    render(
      <ShareModal
        appId="app-123"
        appName="Test App"
        isOwner={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Remove/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/Remove/i));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("invites", {
        body: {
          op: "remove_member",
          app_id: "app-123",
          user_id: "editor12-user-2222",
        },
      });
    });
  });
});
