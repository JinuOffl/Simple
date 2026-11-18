import { describe, it, expect } from "vitest";
import { getToolStatus, type ManifestV2Like } from "./toolStatus";

describe("getToolStatus", () => {
  it("returns Ready for null or undefined manifest", () => {
    expect(getToolStatus(null)).toBe("Ready");
    expect(getToolStatus(undefined)).toBe("Ready");
  });

  it("returns Ready for clean manifest with no requirements or permissions", () => {
    const manifest: ManifestV2Like = {
      permissions: [],
      tool: { size: "2x1", requires: [] },
    };
    expect(getToolStatus(manifest)).toBe("Ready");
  });

  it("returns Needs API key: <label> when tool requires is defined and options omitted", () => {
    const manifest: ManifestV2Like = {
      tool: {
        size: "2x1",
        requires: [{ key_id: "groq_api_key", label: "Groq API Key" }],
      },
    };
    expect(getToolStatus(manifest)).toBe("Needs API key: Groq API Key");
  });

  it("returns Needs API key: <label> when keysMissing matches a requirement", () => {
    const manifest: ManifestV2Like = {
      tool: {
        size: "2x1",
        requires: [
          { key_id: "resend", label: "Resend API Key" },
          { key_id: "weather", label: "OpenWeather API Key" },
        ],
      },
    };
    expect(getToolStatus(manifest, { keysMissing: ["weather"] })).toBe(
      "Needs API key: OpenWeather API Key"
    );
  });

  it("returns Needs API key: <key_id> when keysMissing does not match a declared label", () => {
    const manifest: ManifestV2Like = {
      tool: { size: "2x1", requires: [] },
    };
    expect(getToolStatus(manifest, { keysMissing: ["custom_key"] })).toBe(
      "Needs API key: custom_key"
    );
  });

  it("returns Needs device: <permission> when keys are satisfied or absent but permissions exist", () => {
    const manifestWithPerms: ManifestV2Like = {
      permissions: ["camera", "microphone"],
      tool: { size: "2x1", requires: [] },
    };
    expect(getToolStatus(manifestWithPerms)).toBe("Needs device: camera");

    // Keys satisfied via empty keysMissing
    const manifestWithBoth: ManifestV2Like = {
      permissions: ["geolocation"],
      tool: {
        size: "2x1",
        requires: [{ key_id: "groq", label: "Groq" }],
      },
    };
    expect(getToolStatus(manifestWithBoth, { keysMissing: [] })).toBe(
      "Needs device: geolocation"
    );
  });

  it("prioritizes missing API key over device permissions", () => {
    const manifest: ManifestV2Like = {
      permissions: ["camera"],
      tool: {
        size: "2x1",
        requires: [{ key_id: "openai", label: "OpenAI API Key" }],
      },
    };
    expect(getToolStatus(manifest)).toBe("Needs API key: OpenAI API Key");
  });

  it("returns Not supported in this browser when bluetooth permission is required but navigator.bluetooth is missing", () => {
    const bluetoothManifest: ManifestV2Like = {
      permissions: ["bluetooth"],
      tool: { size: "2x1", requires: [] },
    };
    expect(getToolStatus(bluetoothManifest)).toBe("Not supported in this browser");
  });

  it("never returns Connected", () => {
    const manifest: ManifestV2Like = {
      permissions: [],
      tool: { size: "2x1", requires: [] },
    };
    expect(getToolStatus(manifest)).not.toBe("Connected");
  });
});
