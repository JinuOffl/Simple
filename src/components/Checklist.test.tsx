// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Checklist } from "./Checklist";

describe("Checklist Component CRUD", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders initial checklist items and shows 0/2 progress", () => {
    render(<Checklist id="chk1" items={["Wake up at 6 AM", "Drink 500ml water"]} />);

    expect(screen.getByText("Wake up at 6 AM")).toBeTruthy();
    expect(screen.getByText("Drink 500ml water")).toBeTruthy();
    expect(screen.getByText("0/2")).toBeTruthy();
  });

  it("toggles item completion when checkbox is clicked", () => {
    const onDataChange = vi.fn();
    render(
      <Checklist
        id="chk1"
        items={["Meditation"]}
        onDataChange={onDataChange}
      />
    );

    const toggleBtn = screen.getByLabelText("Mark Meditation complete");
    fireEvent.click(toggleBtn);

    expect(screen.getByText("1/1")).toBeTruthy();
    expect(screen.getByText("ALL DONE")).toBeTruthy();
    expect(screen.getByText("done")).toBeTruthy();
    expect(onDataChange).toHaveBeenCalledWith("chk1", ["Meditation"]);
  });

  it("allows adding a new task (Create)", () => {
    const onDataChange = vi.fn();
    render(
      <Checklist
        id="chk1"
        items={["Morning run"]}
        onDataChange={onDataChange}
      />
    );

    const input = screen.getByLabelText("New task input");
    const addBtn = screen.getByLabelText("Add task");

    fireEvent.change(input, { target: { value: "Cold shower" } });
    fireEvent.click(addBtn);

    expect(screen.getByText("Cold shower")).toBeTruthy();
    expect(screen.getByText("0/2")).toBeTruthy();
    expect(onDataChange).toHaveBeenCalledWith("chk1", ["Morning run", "Cold shower"]);
  });

  it("allows inline editing of an existing task (Update)", () => {
    const onDataChange = vi.fn();
    render(
      <Checklist
        id="chk1"
        items={["Read 10 pages"]}
        onDataChange={onDataChange}
      />
    );

    const editBtn = screen.getByLabelText("Edit Read 10 pages");
    fireEvent.click(editBtn);

    const editInput = screen.getByLabelText("Edit task input");
    fireEvent.change(editInput, { target: { value: "Read 20 pages of fiction" } });

    const saveBtn = screen.getByTitle("Save");
    fireEvent.click(saveBtn);

    expect(screen.getByText("Read 20 pages of fiction")).toBeTruthy();
    expect(screen.queryByText("Read 10 pages")).toBeNull();
    expect(onDataChange).toHaveBeenCalledWith("chk1", ["Read 20 pages of fiction"]);
  });

  it("allows deleting a task (Delete)", () => {
    const onDataChange = vi.fn();
    render(
      <Checklist
        id="chk1"
        items={["Task A", "Task B"]}
        onDataChange={onDataChange}
      />
    );

    const deleteBtn = screen.getByLabelText("Delete Task A");
    fireEvent.click(deleteBtn);

    expect(screen.queryByText("Task A")).toBeNull();
    expect(screen.getByText("Task B")).toBeTruthy();
    expect(screen.getByText("0/1")).toBeTruthy();
    expect(onDataChange).toHaveBeenCalledWith("chk1", ["Task B"]);
  });

  it("does not reseed from props.items after the user empties the list (delete all -> stays empty after rerender)", () => {
    const { rerender } = render(
      <Checklist
        id="chk-empty-test"
        items={["Initial Task 1", "Initial Task 2"]}
      />
    );

    expect(screen.getByText("Initial Task 1")).toBeTruthy();
    expect(screen.getByText("Initial Task 2")).toBeTruthy();

    // Delete both tasks
    const deleteBtn1 = screen.getByLabelText("Delete Initial Task 1");
    fireEvent.click(deleteBtn1);
    const deleteBtn2 = screen.getByLabelText("Delete Initial Task 2");
    fireEvent.click(deleteBtn2);

    expect(screen.queryByText("Initial Task 1")).toBeNull();
    expect(screen.queryByText("Initial Task 2")).toBeNull();
    expect(screen.getByText("(No tasks yet. Add one above)")).toBeTruthy();

    // Rerender with the same props.items
    rerender(
      <Checklist
        id="chk-empty-test"
        items={["Initial Task 1", "Initial Task 2"]}
      />
    );

    // Should NOT reseed from props.items
    expect(screen.queryByText("Initial Task 1")).toBeNull();
    expect(screen.queryByText("Initial Task 2")).toBeNull();
    expect(screen.getByText("(No tasks yet. Add one above)")).toBeTruthy();
  });
});
