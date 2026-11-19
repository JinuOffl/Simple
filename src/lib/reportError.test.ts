// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reportError } from "./reportError";

describe("reportError", () => {
  const originalEnv = { ...import.meta.env };
  let sendBeaconSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendBeaconSpy = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: sendBeaconSpy,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv);
    vi.restoreAllMocks();
  });

  it("logs to console.error in development environment", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    import.meta.env.DEV = true;

    const testError = new Error("Test dev failure");
    reportError(testError);

    expect(consoleSpy).toHaveBeenCalledWith("[reportError]", testError);
    expect(sendBeaconSpy).not.toHaveBeenCalled();
  });

  it("sends sanitized beacon in production if VITE_ERROR_ENDPOINT is configured", async () => {
    import.meta.env.DEV = false;
    import.meta.env.VITE_ERROR_ENDPOINT = "https://telemetry.example.com/beacon";

    const testError = new Error("Production crash");
    testError.stack = "Error: Production crash\n    at Object.test (app.js:10:5)";

    reportError(testError);

    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    const [endpoint, blob] = sendBeaconSpy.mock.calls[0] as [string, Blob];
    expect(endpoint).toBe("https://telemetry.example.com/beacon");
    expect(blob).toBeInstanceOf(Blob);

    const text = await blob.text();
    const payload = JSON.parse(text) as Record<string, string>;
    expect(payload.message).toBe("Production crash");
    expect(payload.stack).toContain("Production crash");
    expect(payload.version).toBe("0.0.0");
    expect(payload.timestamp).toBeDefined();
    // Verify no secret or prompt leaks
    expect(payload.prompt).toBeUndefined();
    expect(payload.apiKey).toBeUndefined();
  });

  it("is a no-op in production if VITE_ERROR_ENDPOINT is unset", () => {
    import.meta.env.DEV = false;
    delete (import.meta.env as Record<string, unknown>).VITE_ERROR_ENDPOINT;

    reportError(new Error("Ignored error"));

    expect(sendBeaconSpy).not.toHaveBeenCalled();
  });
});
