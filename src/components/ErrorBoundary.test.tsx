// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

const originalConsoleError = console.error;

describe("ErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    console.error = originalConsoleError;
  });

  function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
    if (shouldThrow) {
      throw new Error("Simulated component explosion");
    }
    return <div data-testid="healthy-child">Healthy Child</div>;
  }

  it("catches errors in child and renders fallback with retry button", () => {
    console.error = vi.fn();

    render(
      <ErrorBoundary fallbackMessage="Something went wrong in this tool">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("error-boundary-fallback")).toBeTruthy();
    expect(screen.getByText("Something went wrong in this tool")).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });

  it("allows retrying after error", () => {
    console.error = vi.fn();

    let shouldThrow = true;
    function DynamicChild() {
      if (shouldThrow) throw new Error("Boom");
      return <div data-testid="recovered-child">Recovered!</div>;
    }

    render(
      <ErrorBoundary>
        <DynamicChild />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong in this tool")).toBeTruthy();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(screen.getByTestId("recovered-child")).toBeTruthy();
  });

  it("ensures a throwing component does not unmount siblings", () => {
    console.error = vi.fn();

    render(
      <div data-testid="parent-container">
        <ErrorBoundary>
          <div data-testid="sibling-1">Sibling One Active</div>
        </ErrorBoundary>

        <ErrorBoundary>
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>

        <ErrorBoundary>
          <div data-testid="sibling-2">Sibling Two Active</div>
        </ErrorBoundary>
      </div>
    );

    // Sibling 1 and 2 must remain mounted and healthy
    expect(screen.getByTestId("sibling-1")).toBeTruthy();
    expect(screen.getByText("Sibling One Active")).toBeTruthy();

    // Sibling with error displays fallback
    expect(screen.getByTestId("error-boundary-fallback")).toBeTruthy();
    expect(screen.getByText("Something went wrong in this tool")).toBeTruthy();

    // Sibling 2 is intact
    expect(screen.getByTestId("sibling-2")).toBeTruthy();
    expect(screen.getByText("Sibling Two Active")).toBeTruthy();
  });
});
