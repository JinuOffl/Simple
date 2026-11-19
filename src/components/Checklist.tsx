import { useState, useEffect, useRef } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import type { RegistryRenderContext } from "@/registry/types";

export interface ChecklistProps {
  id?: string;
  items?: string[];
  allowAdd?: boolean;
  allowDelete?: boolean;
  allowEdit?: boolean;
  placeholder?: string;
  ctx?: RegistryRenderContext;
  onDataChange?: (key: string, value: unknown) => void;
}

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export function Checklist({
  id = "checklist",
  items = [],
  allowAdd = true,
  allowDelete = true,
  allowEdit = true,
  placeholder = "Add item...",
  ctx,
  onDataChange,
}: ChecklistProps) {
  const storageKey = `simple_checklist_${ctx?.appId || "preview"}_${id}`;

  // Initialize from localStorage, ctx.bindValue, ctx.appData, or props.items
  const [tasks, setTasks] = useState<ChecklistItem[]>(() => {
    if (!ctx?.isPreview) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved !== null) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed.map((item, idx) =>
              typeof item === "string"
                ? { id: `item-${idx}`, text: item, completed: false }
                : { id: item.id || `item-${idx}`, text: item.text || "", completed: Boolean(item.completed) }
            );
          }
        }
      } catch {
        // ignore localStorage errors
      }
    }

    if (Array.isArray(ctx?.bindValue) && ctx.bindValue.length > 0) {
      return (ctx.bindValue as string[]).map((text, idx) => ({
        id: `item-${idx}`,
        text: String(text),
        completed: false,
      }));
    }

    return (items || []).map((text, idx) => ({
      id: `item-${idx}`,
      text: String(text),
      completed: false,
    }));
  });

  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Helper to persist state
  const persist = (updated: ChecklistItem[]) => {
    setTasks(updated);
    if (!ctx?.isPreview) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        // ignore
      }
    }
    const stringItems = updated.map((t) => t.text);
    if (ctx?.onDataChange) {
      ctx.onDataChange(id, stringItems);
    } else if (onDataChange) {
      onDataChange(id, stringItems);
    }
  };

  const toggleTask = (taskId: string) => {
    const updated = tasks.map((t) =>
      t.id === taskId ? { ...t, completed: !t.completed } : t
    );
    persist(updated);
  };

  const handleAddTask = () => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    const newTask: ChecklistItem = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: trimmed,
      completed: false,
    };
    persist([...tasks, newTask]);
    setNewText("");
  };

  const startEdit = (task: ChecklistItem) => {
    setEditingId(task.id);
    setEditingText(task.text);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const trimmed = editingText.trim();
    if (!trimmed) {
      deleteTask(editingId);
    } else {
      const updated = tasks.map((t) =>
        t.id === editingId ? { ...t, text: trimmed } : t
      );
      persist(updated);
    }
    setEditingId(null);
    setEditingText("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const deleteTask = (taskId: string) => {
    const updated = tasks.filter((t) => t.id !== taskId);
    persist(updated);
    if (editingId === taskId) {
      setEditingId(null);
      setEditingText("");
    }
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const progressPercent = tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0;

  return (
    <div className="bg-n-s1 border border-n-line rounded-sm overflow-hidden animate-fade-in flex flex-col">
      {/* Create / Add Task Bar */}
      {allowAdd && (
        <div className="p-2.5 border-b border-n-line bg-n-s2 flex items-center gap-2">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddTask();
              }
            }}
            placeholder={placeholder}
            className="flex-1 bg-n-s1 border border-n-line2 rounded-sm px-3 py-1.5 text-xs text-n-primary font-grotesk placeholder-n-disabled focus:outline-none focus:border-n-line3 transition-colors"
            aria-label="New task input"
          />
          <button
            type="button"
            onClick={handleAddTask}
            disabled={!newText.trim()}
            className="px-3 py-1.5 bg-n-btn text-n-btn-text text-[10px] font-mono font-bold uppercase tracking-wider rounded-sm hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0 active:scale-95 nt-press"
            aria-label="Add task"
          >
            + ADD
          </button>
        </div>
      )}

      {/* Task List */}
      <div className="divide-y divide-n-line">
        {tasks.length === 0 ? (
          <div className="px-4 py-6 text-center text-n-disabled text-xs font-mono">
            (No tasks yet. Add one above)
          </div>
        ) : (
          tasks.map((task, i) => {
            const isEditing = editingId === task.id;

            return (
              <div
                key={task.id || i}
                className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors group ${
                  task.completed ? "bg-n-s2/20" : "hover:bg-n-s2/50"
                }`}
              >
                {/* Nothing-style checkbox */}
                <button
                  type="button"
                  onClick={() => toggleTask(task.id)}
                  aria-label={task.completed ? `Mark ${task.text} incomplete` : `Mark ${task.text} complete`}
                  className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-colors rounded-sm cursor-pointer nt-press ${
                    task.completed ? "bg-n-btn border-n-btn text-n-btn-text" : "border-n-line2 hover:border-n-line3"
                  }`}
                >
                  {task.completed && (
                    <Check size={10} strokeWidth={2.5} className="fill-current" />
                  )}
                </button>

                {/* Inline Edit Mode or Display Mode */}
                {isEditing ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="flex-1 bg-n-s2 border border-n-line3 rounded-sm px-2 py-1 text-xs text-n-primary focus:outline-none font-grotesk"
                      aria-label="Edit task input"
                    />
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="text-[10px] font-mono text-n-display hover:opacity-80 px-1.5 py-0.5 border border-n-line3 rounded uppercase nt-press"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="text-[10px] font-mono text-n-disabled hover:text-n-display px-1.5 py-0.5 border border-n-line rounded uppercase nt-press"
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <>
                    <span
                      onClick={() => allowEdit && startEdit(task)}
                      title={allowEdit ? "Click to edit" : undefined}
                      className={`text-xs font-grotesk transition-colors flex-1 select-none ${
                        allowEdit ? "cursor-pointer hover:text-n-display" : ""
                      } ${task.completed ? "line-through text-n-disabled" : "text-n-primary"}`}
                    >
                      {task.text}
                    </span>

                    {/* Done label */}
                    {task.completed && (
                      <span className="nt-label">
                        done
                      </span>
                    )}

                    {/* Action buttons (Edit & Delete) */}
                    <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                      {allowEdit && (
                        <button
                          type="button"
                          onClick={() => startEdit(task)}
                          aria-label={`Edit ${task.text}`}
                          className="p-1 text-n-disabled hover:text-n-display border border-transparent hover:border-n-line rounded transition-colors"
                          title="Edit"
                        >
                          <Pencil size={11} strokeWidth={1.5} />
                        </button>
                      )}
                      {allowDelete && (
                        <button
                          type="button"
                          onClick={() => deleteTask(task.id)}
                          aria-label={`Delete ${task.text}`}
                          className="p-1 text-n-disabled hover:text-n-red border border-transparent hover:border-n-red/30 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={11} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Progress bar & stats */}
      {tasks.length > 0 && (
        <div className="px-4 py-2.5 flex items-center gap-3 border-t border-n-line bg-n-s2">
          <div className="flex-1 h-1 bg-n-line rounded-full overflow-hidden">
            <div
              className="h-full bg-n-btn transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="nt-label shrink-0">
            {completedCount}/{tasks.length}
          </span>
          {completedCount === tasks.length && tasks.length > 0 && (
            <span className="font-mono text-[10px] font-bold text-n-display tracking-wider">
              ALL DONE
            </span>
          )}
        </div>
      )}
    </div>
  );
}
