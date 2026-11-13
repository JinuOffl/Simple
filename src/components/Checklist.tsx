import { useState, useEffect, useRef } from "react";
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
  placeholder = "Add a new task or habit...",
  ctx,
  onDataChange,
}: ChecklistProps) {
  const storageKey = `simple_checklist_${ctx?.appId || "preview"}_${id}`;

  // Initialize from localStorage, ctx.bindValue, ctx.appData, or props.items
  const [tasks, setTasks] = useState<ChecklistItem[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
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

  // Sync if props.items change and local list is empty
  useEffect(() => {
    if (tasks.length === 0 && items && items.length > 0) {
      setTasks(
        items.map((text, idx) => ({
          id: `item-${idx}`,
          text: String(text),
          completed: false,
        }))
      );
    }
  }, [items, tasks.length]);

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
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      // ignore
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
    <div className="bg-n-surface border border-n-border rounded-sm overflow-hidden animate-fade-in flex flex-col">
      {/* Create / Add Task Bar */}
      {allowAdd && (
        <div className="p-2 border-b border-n-border bg-n-surface2/50 flex items-center gap-2">
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
            className="flex-1 bg-black/40 border border-n-border rounded-sm px-3 py-1.5 text-xs text-white placeholder-n-text3 focus:outline-none focus:border-white transition-colors font-sans"
            aria-label="New task input"
          />
          <button
            type="button"
            onClick={handleAddTask}
            disabled={!newText.trim()}
            className="px-3 py-1.5 bg-white text-black text-[10px] font-mono font-bold uppercase tracking-wider rounded-sm hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0 active:scale-95"
            aria-label="Add task"
          >
            + ADD
          </button>
        </div>
      )}

      {/* Task List */}
      <div className="divide-y divide-n-border">
        {tasks.length === 0 ? (
          <div className="px-4 py-6 text-center text-n-text3 text-xs font-mono">
            (No tasks yet. Add one above)
          </div>
        ) : (
          tasks.map((task, i) => {
            const isEditing = editingId === task.id;

            return (
              <div
                key={task.id || i}
                className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors group ${
                  task.completed ? "bg-white/[0.01]" : "hover:bg-n-surface2/40"
                }`}
              >
                {/* Nothing-style checkbox */}
                <button
                  type="button"
                  onClick={() => toggleTask(task.id)}
                  aria-label={task.completed ? `Mark ${task.text} incomplete` : `Mark ${task.text} complete`}
                  className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-colors rounded-sm cursor-pointer ${
                    task.completed ? "bg-white border-white" : "border-n-border2 hover:border-white"
                  }`}
                >
                  {task.completed && (
                    <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="#0a0a0a" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                    </svg>
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
                      className="flex-1 bg-black/60 border border-white rounded-sm px-2 py-1 text-xs text-white focus:outline-none font-sans"
                      aria-label="Edit task input"
                    />
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 px-1.5 py-0.5 border border-emerald-500/40 rounded uppercase"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="text-[10px] font-mono text-n-text3 hover:text-white px-1.5 py-0.5 border border-n-border rounded uppercase"
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
                      className={`text-xs transition-colors flex-1 select-none ${
                        allowEdit ? "cursor-pointer hover:text-white" : ""
                      } ${task.completed ? "line-through text-n-text3" : "text-n-text"}`}
                    >
                      {task.text}
                    </span>

                    {/* Done label */}
                    {task.completed && (
                      <span className="text-n-text3 text-[9px] uppercase tracking-wider font-mono">
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
                          className="text-[10px] text-n-text3 hover:text-white font-mono uppercase px-1 py-0.5 rounded border border-transparent hover:border-n-border transition-colors"
                          title="Edit"
                        >
                          ✎
                        </button>
                      )}
                      {allowDelete && (
                        <button
                          type="button"
                          onClick={() => deleteTask(task.id)}
                          aria-label={`Delete ${task.text}`}
                          className="text-xs text-n-text3 hover:text-red-400 font-mono px-1 py-0.5 rounded border border-transparent hover:border-red-500/30 transition-colors"
                          title="Delete"
                        >
                          ✕
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
        <div className="px-4 py-2.5 flex items-center gap-3 border-t border-n-border bg-n-surface/40">
          <div className="flex-1 h-1 bg-n-border rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-n-text3 text-[10px] font-mono tracking-wider shrink-0">
            {completedCount}/{tasks.length}
          </span>
          {completedCount === tasks.length && tasks.length > 0 && (
            <span className="text-emerald-400 text-[10px] font-mono font-bold tracking-wider">
              ALL DONE
            </span>
          )}
        </div>
      )}
    </div>
  );
}
