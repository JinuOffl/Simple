import { describe, it, expect } from "vitest";
import { formatActionError } from "./actionError";

describe("formatActionError", () => {
  it("formats 402 as 'You are out of credits'", async () => {
    const errorWithContext = {
      context: {
        status: 402,
        clone: () => ({
          json: async () => ({ error: "insufficient_credits" }),
        }),
      },
    };
    expect(await formatActionError(errorWithContext, "default")).toBe("You are out of credits");

    const directStatus = { status: 402 };
    expect(await formatActionError(directStatus, "default")).toBe("You are out of credits");
  });

  it("formats 424 as 'Add your API key in the tool settings'", async () => {
    const errorWithContext = {
      context: {
        status: 424,
        clone: () => ({
          json: async () => ({ error: "missing_key", key_id: "openweather" }),
        }),
      },
    };
    expect(await formatActionError(errorWithContext, "default")).toBe(
      "Add your API key in the tool settings"
    );

    const directStatus = { status: 424 };
    expect(await formatActionError(directStatus, "default")).toBe(
      "Add your API key in the tool settings"
    );
  });

  it("formats 429 as 'Too many requests, wait a minute'", async () => {
    const errorWithContext = {
      context: {
        status: 429,
        clone: () => ({
          json: async () => ({ error: "rate_limit_exceeded" }),
        }),
      },
    };
    expect(await formatActionError(errorWithContext, "default")).toBe(
      "Too many requests, wait a minute"
    );

    const directStatus = { status: 429 };
    expect(await formatActionError(directStatus, "default")).toBe(
      "Too many requests, wait a minute"
    );
  });

  it("falls back to defaultMessage for other errors", async () => {
    expect(await formatActionError(new Error("Network failed"), "Default error")).toBe("Default error");
  });
});
