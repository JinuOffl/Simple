import { useState } from "react";

export interface FormFieldSpec {
  name: string;
  label: string;
  type?: "text" | "number" | "email" | "textarea";
  placeholder?: string;
  required?: boolean;
}

interface FormProps {
  fields?: FormFieldSpec[];
  submit_label?: string;
  initialValues?: Record<string, unknown>;
  loading?: boolean;
  onSubmit?: (values: Record<string, unknown>) => void | Promise<void>;
}

/**
 * Structured form collecting multi-field user input with Nothing-OS styling.
 */
export function Form({
  fields = [],
  submit_label = "Submit",
  initialValues = {},
  loading = false,
  onSubmit,
}: FormProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      const v = initialValues[f.name];
      init[f.name] = v !== undefined && v !== null ? String(v) : "";
    }
    return init;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (name: string, val: string) => {
    setValues((prev) => ({ ...prev, [name]: val }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const newErrors: Record<string, string> = {};
    for (const f of fields) {
      if (f.required && !values[f.name]?.trim()) {
        newErrors[f.name] = `${f.label} is required`;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Convert values according to field types
    const parsedValues: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = values[f.name] ?? "";
      if (f.type === "number") {
        parsedValues[f.name] = raw ? Number(raw) : 0;
      } else {
        parsedValues[f.name] = raw;
      }
    }

    onSubmit?.(parsedValues);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full bg-n-surface border border-n-border rounded-sm p-4 animate-fade-in space-y-3.5"
    >
      {fields.map((f) => {
        const hasError = Boolean(errors[f.name]);
        return (
          <div key={f.name} className="space-y-1">
            <label
              htmlFor={`form-field-${f.name}`}
              className="text-[10px] font-mono uppercase tracking-[0.16em] text-n-text2 flex items-center justify-between"
            >
              <span>{f.label}</span>
              {f.required && (
                <span className="text-[9px] text-n-text3 lowercase">required</span>
              )}
            </label>

            {f.type === "textarea" ? (
              <textarea
                id={`form-field-${f.name}`}
                value={values[f.name] ?? ""}
                placeholder={f.placeholder}
                rows={3}
                disabled={loading}
                onChange={(e) => handleChange(f.name, e.target.value)}
                className={`w-full bg-n-surface2 border px-3 py-2 text-xs text-white placeholder:text-n-text3 outline-none rounded-sm transition-colors resize-none ${
                  hasError
                    ? "border-red-500/70 focus:border-red-400"
                    : "border-n-border focus:border-n-border2"
                }`}
              />
            ) : (
              <input
                id={`form-field-${f.name}`}
                type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
                value={values[f.name] ?? ""}
                placeholder={f.placeholder}
                disabled={loading}
                onChange={(e) => handleChange(f.name, e.target.value)}
                className={`w-full bg-n-surface2 border px-3 py-2 text-xs text-white placeholder:text-n-text3 outline-none rounded-sm transition-colors ${
                  hasError
                    ? "border-red-500/70 focus:border-red-400"
                    : "border-n-border focus:border-n-border2"
                }`}
              />
            )}

            {hasError && (
              <p className="text-[10px] text-red-400 font-mono mt-0.5">
                {errors[f.name]}
              </p>
            )}
          </div>
        );
      })}

      <div className="pt-2 border-t border-n-border flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="btn-primary"
        >
          {loading ? "Saving..." : submit_label}
        </button>
      </div>
    </form>
  );
}
