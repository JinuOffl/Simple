/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Markdown } from "./Markdown";
import { Stat } from "./Stat";
import { Slider } from "./Slider";
import { Timer } from "./Timer";
import { Tabs } from "./Tabs";
import { List } from "./List";
import { Table } from "./Table";
import { Form } from "./Form";
import { Chart } from "./Chart";
import { ChatThread } from "./ChatThread";

describe("Phase 5 Expanded Components Suite", () => {
  describe("Markdown", () => {
    it("renders headings, bold, inline code, and lists safely", () => {
      const content = "# Main Heading\n## Subheading\n**Bold text** and `code`\n- Item 1\n- Item 2";
      render(<Markdown content={content} />);

      expect(screen.getByText("Main Heading")).toBeTruthy();
      expect(screen.getByText("Subheading")).toBeTruthy();
      expect(screen.getByText("Bold text")).toBeTruthy();
      expect(screen.getByText("code")).toBeTruthy();
      expect(screen.getByText("Item 1")).toBeTruthy();
      expect(screen.getByText("Item 2")).toBeTruthy();
    });

    it("renders safe links and handles empty content gracefully", () => {
      const { container } = render(<Markdown content="" />);
      expect(container.firstChild).toBeNull();

      render(<Markdown content="Visit [Docs](https://example.com)" />);
      const link = screen.getByRole("link", { name: "Docs" });
      expect(link.getAttribute("href")).toBe("https://example.com");
    });
  });

  describe("Stat", () => {
    it("displays prominent metric, unit, and description", () => {
      render(
        <Stat
          label="Steps Today"
          value={8423}
          unit="steps"
          description="Goal: 10,000 steps"
        />
      );

      expect(screen.getByText("Steps Today")).toBeTruthy();
      expect(screen.getByText("8423")).toBeTruthy();
      expect(screen.getByText("Goal: 10,000 steps")).toBeTruthy();
    });
  });

  describe("Slider", () => {
    it("renders range input and responds to change events", () => {
      const onChange = vi.fn();
      render(
        <Slider
          label="Volume"
          min={0}
          max={100}
          defaultValue={40}
          onChange={onChange}
        />
      );

      expect(screen.getByText("Volume")).toBeTruthy();
      const input = screen.getByRole("slider");
      expect(input.getAttribute("aria-valuenow")).toBe("40");

      fireEvent.change(input, { target: { value: "75" } });
      expect(onChange).toHaveBeenCalledWith(75);
    });
  });

  describe("Timer", () => {
    it("renders countdown time and provides start/pause/reset controls", () => {
      render(<Timer duration_seconds={90} label="Rest" auto_start={false} />);

      expect(screen.getByText("Rest")).toBeTruthy();
      expect(screen.getByText("01:30")).toBeTruthy();

      const startBtn = screen.getByRole("button", { name: /start/i });
      fireEvent.click(startBtn);

      expect(screen.getByRole("button", { name: /pause/i })).toBeTruthy();
    });
  });

  describe("Tabs", () => {
    it("renders tab buttons and triggers onSelectTab", () => {
      const onSelect = vi.fn();
      const tabs = [
        { label: "Dashboard", screen_id: "dashboard" },
        { label: "Settings", screen_id: "settings" },
      ];

      render(<Tabs tabs={tabs} default_tab="dashboard" onSelectTab={onSelect} />);

      const settingsTab = screen.getByRole("tab", { name: "Settings" });
      fireEvent.click(settingsTab);

      expect(onSelect).toHaveBeenCalledWith("settings");
    });
  });

  describe("List", () => {
    it("renders bullet and numbered list items", () => {
      render(<List items={["First Item", "Second Item"]} ordered={true} />);

      expect(screen.getByText("First Item")).toBeTruthy();
      expect(screen.getByText("Second Item")).toBeTruthy();
      expect(screen.getByText("01")).toBeTruthy();
      expect(screen.getByText("02")).toBeTruthy();
    });
  });

  describe("Table", () => {
    it("renders table with columns and row cells", () => {
      const columns = ["User", "Score"];
      const rows = [
        ["Alice", "98"],
        ["Bob", "85"],
      ];

      render(<Table columns={columns} rows={rows} />);

      expect(screen.getByText("User")).toBeTruthy();
      expect(screen.getByText("Score")).toBeTruthy();
      expect(screen.getByText("Alice")).toBeTruthy();
      expect(screen.getByText("98")).toBeTruthy();
    });
  });

  describe("Form", () => {
    it("validates required fields and submits form values", () => {
      const onSubmit = vi.fn();
      const fields = [
        { name: "username", label: "Username", required: true },
        { name: "age", label: "Age", type: "number" as const },
      ];

      render(<Form fields={fields} submit_label="Save User" onSubmit={onSubmit} />);

      const submitBtn = screen.getByRole("button", { name: "Save User" });
      fireEvent.click(submitBtn);

      // Fails validation because username is required
      expect(screen.getByText("Username is required")).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();

      // Fill in username
      const usernameInput = screen.getByLabelText(/username/i);
      fireEvent.change(usernameInput, { target: { value: "testuser" } });

      fireEvent.click(submitBtn);
      expect(onSubmit).toHaveBeenCalledWith({
        username: "testuser",
        age: 0,
      });
    });
  });

  describe("Chart", () => {
    it("renders bar, line, and pie charts cleanly", () => {
      const datasets = [{ label: "Activity", data: [10, 20, 30] }];
      const labels = ["A", "B", "C"];

      const { rerender } = render(
        <Chart chart_type="bar" labels={labels} datasets={datasets} title="Bar Title" />
      );
      expect(screen.getByText("Bar Title")).toBeTruthy();
      expect(screen.getByText("A")).toBeTruthy();

      rerender(
        <Chart chart_type="line" labels={labels} datasets={datasets} title="Line Title" />
      );
      expect(screen.getByText("Line Title")).toBeTruthy();

      rerender(
        <Chart chart_type="pie" labels={labels} datasets={datasets} title="Pie Title" />
      );
      expect(screen.getByText("Pie Title")).toBeTruthy();
    });

    it("renders streaming live chart when live is true and bindValue is updated", () => {
      const { rerender } = render(
        <Chart title="Live Pulse" live={true} max_points={3} bindValue={65} />
      );

      expect(screen.getByText("Live Pulse")).toBeTruthy();
      expect(screen.getByText("line")).toBeTruthy();

      // Stream next data points
      rerender(
        <Chart title="Live Pulse" live={true} max_points={3} bindValue={72} />
      );
      rerender(
        <Chart title="Live Pulse" live={true} max_points={3} bindValue={80} />
      );
      rerender(
        <Chart title="Live Pulse" live={true} max_points={3} bindValue={85} />
      );

      expect(document.querySelector("svg")).toBeTruthy();
    });
  });

  describe("ChatThread", () => {
    it("renders initial message and input elements", () => {
      render(
        <ChatThread
          initial_message="Welcome to study buddy!"
          placeholder="Ask a question..."
        />
      );

      expect(screen.getByText("Welcome to study buddy!")).toBeTruthy();
      expect(screen.getByPlaceholderText("Ask a question...")).toBeTruthy();
      expect(screen.getByRole("button", { name: /send/i })).toBeTruthy();
    });
  });
});
