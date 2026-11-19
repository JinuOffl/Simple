import { describe, it, expect } from "vitest";
import { shouldCache } from "./swHelper";

describe("shouldCache (Service Worker request caching filter)", () => {
  const origin = "https://simple-app.pages.dev";

  it("allows same-origin GET requests for static assets and HTML shell", () => {
    expect(
      shouldCache({ method: "GET", url: "https://simple-app.pages.dev/assets/index.abc1234.js" }, origin)
    ).toBe(true);
    expect(
      shouldCache({ method: "GET", url: "https://simple-app.pages.dev/assets/style.def5678.css" }, origin)
    ).toBe(true);
    expect(
      shouldCache({ method: "GET", url: "https://simple-app.pages.dev/favicon.svg" }, origin)
    ).toBe(true);
    expect(
      shouldCache({ method: "GET", url: "https://simple-app.pages.dev/" }, origin)
    ).toBe(true);
    expect(
      shouldCache({ method: "GET", url: "/assets/test.js" }, origin)
    ).toBe(true);
  });

  it("rejects non-GET HTTP methods", () => {
    expect(
      shouldCache({ method: "POST", url: "https://simple-app.pages.dev/api/data" }, origin)
    ).toBe(false);
    expect(
      shouldCache({ method: "PUT", url: "https://simple-app.pages.dev/api/data" }, origin)
    ).toBe(false);
    expect(
      shouldCache({ method: "DELETE", url: "https://simple-app.pages.dev/api/data" }, origin)
    ).toBe(false);
    expect(
      shouldCache({ method: "PATCH", url: "https://simple-app.pages.dev/api/data" }, origin)
    ).toBe(false);
  });

  it("never caches Supabase endpoints across all subdomains", () => {
    expect(
      shouldCache({ method: "GET", url: "https://abcdefghijk.supabase.co/rest/v1/apps" }, origin)
    ).toBe(false);
    expect(
      shouldCache({ method: "GET", url: "https://xyz.supabase.in/auth/v1/user" }, origin)
    ).toBe(false);
    expect(
      shouldCache({ method: "GET", url: "https://test.supabase.net/storage/v1/object" }, origin)
    ).toBe(false);
  });

  it("never caches edge functions or /functions/ paths", () => {
    expect(
      shouldCache({ method: "GET", url: "https://simple-app.pages.dev/functions/v1/generate-app" }, origin)
    ).toBe(false);
    expect(
      shouldCache({ method: "GET", url: "https://simple-app.pages.dev/functions/run-api-fetch" }, origin)
    ).toBe(false);
    expect(
      shouldCache({ method: "GET", url: "/functions/v1/test" }, origin)
    ).toBe(false);
  });

  it("rejects cross-origin requests", () => {
    expect(
      shouldCache({ method: "GET", url: "https://fonts.googleapis.com/css2?family=Doto" }, origin)
    ).toBe(false);
    expect(
      shouldCache({ method: "GET", url: "https://api.weatherapi.com/v1/current.json" }, origin)
    ).toBe(false);
  });

  it("rejects non-http protocols and invalid inputs", () => {
    expect(
      shouldCache({ method: "GET", url: "data:image/svg+xml;base64,PHN2Zz..." }, origin)
    ).toBe(false);
    expect(
      shouldCache({ method: "GET", url: "blob:https://simple-app.pages.dev/123-456" }, origin)
    ).toBe(false);
    expect(shouldCache({ method: "GET", url: "" }, origin)).toBe(false);
    expect(shouldCache(null as unknown as { method: string; url: string }, origin)).toBe(false);
    expect(shouldCache({} as { method: string; url: string }, origin)).toBe(false);
  });
});
