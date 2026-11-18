// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { UpsertConnectionInput, MaskedConnection } from "@/lib/connectionsApi";

const { mockSave } = vi.hoisted(() => ({
  mockSave: vi.fn<(input: UpsertConnectionInput) => Promise<MaskedConnection>>(),
}));

vi.mock("@/lib/connectionsApi", () => ({
  saveConnection: (input: UpsertConnectionInput) => mockSave(input),
}));

import { NeedsKeyCard } from "./NeedsKeyCard";

describe("NeedsKeyCard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders key label, encrypted notice, and help URL link", () => {
    render(
      <NeedsKeyCard
        keyId="openweather"
        label="OpenWeather API"
        helpUrl="https://home.openweathermap.org/users/sign_up"
      />
    );

    expect(screen.getByText(/API Key Required: OpenWeather API/i)).toBeTruthy();
    expect(
      screen.getByText(/Encrypted server-side in connection secrets/i)
    ).toBeTruthy();

    const link = screen.getByRole("link", { name: /Get OpenWeather API key/i });
    expect(link.getAttribute("href")).toBe("https://home.openweathermap.org/users/sign_up");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("saves key via saveConnection and calls onSaved callback", async () => {
    const onSaved = vi.fn();
    mockSave.mockResolvedValueOnce({
      id: "conn-123",
      connector_id: "key:openweather",
      label: "OpenWeather API",
      server_url: "https://api.openweathermap.org",
      allowed_tools: [],
      status: "active",
      has_token: true,
      auth_header_name: "Authorization",
    });

    render(
      <NeedsKeyCard
        keyId="openweather"
        label="OpenWeather API"
        onSaved={onSaved}
      />
    );

    const input = screen.getByPlaceholderText(/Enter OpenWeather API key.../i);
    const saveButton = screen.getByRole("button", { name: /Save Key/i });

    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "test-secret-key-123" } });
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    expect(mockSave).toHaveBeenCalledWith({
      connector_id: "key:openweather",
      label: "OpenWeather API",
      server_url: "https://api.openweathermap.org",
      allowed_tools: [],
      token: "test-secret-key-123",
    });

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith("openweather");
      expect(screen.getByText(/Saved ✓/i)).toBeTruthy();
    });
  });

  it("displays error message if saveConnection fails", async () => {
    mockSave.mockRejectedValueOnce(new Error("Network failed to persist secret"));

    render(
      <NeedsKeyCard
        keyId="nasa_api"
        label="NASA API"
      />
    );

    const input = screen.getByPlaceholderText(/Enter NASA API key.../i);
    const saveButton = screen.getByRole("button", { name: /Save Key/i });

    fireEvent.change(input, { target: { value: "bad-key" } });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText("Network failed to persist secret")).toBeTruthy();
    });
  });
});
