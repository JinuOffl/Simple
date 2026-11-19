import { describe, it, expect } from "vitest";
import { mapBuilderErrorMessage } from "./builderError";

describe("mapBuilderErrorMessage", () => {
  it("maps 402 HTTP status to friendly credit depleted message", () => {
    expect(mapBuilderErrorMessage({ status: 402 }, false)).toBe(
      "Credit balance depleted. Upgrade your plan to generate more tools."
    );
    expect(mapBuilderErrorMessage("402 Payment Required", false)).toBe(
      "Credit balance depleted. Upgrade your plan to generate more tools."
    );
    expect(mapBuilderErrorMessage({ code: "insufficient_credits" }, false)).toBe(
      "Credit balance depleted. Upgrade your plan to generate more tools."
    );
  });

  it("does NOT match 402 on substring 'credit' like credit_cost_class", () => {
    const errorWithCostClass = "Unexpected error in credit_cost_class: generation";
    // In production, must NOT match 402, but rather the fallback message
    const resultProd = mapBuilderErrorMessage(errorWithCostClass, false);
    expect(resultProd).not.toContain("Credit balance depleted");
    expect(resultProd).toBe("Failed to generate tool. Please try rephrasing.");
  });

  it("maps 429 status and rate limit codes to friendly rate limit message", () => {
    expect(mapBuilderErrorMessage({ status: 429 }, false)).toBe(
      "Rate limit reached. Please wait a minute before generating again."
    );
    expect(mapBuilderErrorMessage({ code: "rate_limit_exceeded" }, false)).toBe(
      "Rate limit reached. Please wait a minute before generating again."
    );
    expect(mapBuilderErrorMessage("Daily limit reached", false)).toBe(
      "Rate limit reached. Please wait a minute before generating again."
    );
  });

  it("maps 503 status and disabled/busy messages to friendly disabled message", () => {
    expect(mapBuilderErrorMessage({ status: 503 }, false)).toBe(
      "Generation is temporarily disabled. Please try again later."
    );
    expect(mapBuilderErrorMessage({ code: "generation_disabled" }, false)).toBe(
      "Generation is temporarily disabled. Please try again later."
    );
    expect(mapBuilderErrorMessage("Generation is temporarily busy", false)).toBe(
      "Generation is temporarily disabled. Please try again later."
    );
  });

  it("maps offline guest messages to friendly offline guest instructions", () => {
    expect(mapBuilderErrorMessage("Guest mode is offline. Sign in with email to build tools.", false)).toBe(
      "Guest mode is offline. Sign in with email to build tools."
    );
  });

  it("in production, unknown errors return 'Failed to generate tool. Please try rephrasing.'", () => {
    expect(mapBuilderErrorMessage("Internal server explosion at /app/routes", false)).toBe(
      "Failed to generate tool. Please try rephrasing."
    );
    expect(mapBuilderErrorMessage(new Error("Database connection dropped"), false)).toBe(
      "Failed to generate tool. Please try rephrasing."
    );
  });

  it("in DEV mode, includes raw detail for debugging", () => {
    const msg = mapBuilderErrorMessage({ status: 402, message: "Out of credits detail" }, true);
    expect(msg).toContain("Credit balance depleted");
    expect(msg).toContain("Out of credits detail");
  });
});
