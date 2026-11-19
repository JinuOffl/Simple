import { getCatalogAdapter } from "../catalog.ts";

function findNodeInManifest(manifest: unknown, nodeId: string): Record<string, unknown> | null {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return null;
  const m = manifest as Record<string, unknown>;
  if (!Array.isArray(m.screens)) return null;
  for (const sc of m.screens) {
    if (sc && typeof sc === "object" && Array.isArray((sc as Record<string, unknown>).nodes)) {
      for (const n of (sc as Record<string, unknown>).nodes as Array<Record<string, unknown>>) {
        if (n && typeof n === "object" && n.id === nodeId) return n;
      }
    }
  }
  return null;
}

/**
 * Pure deterministic healer for common LLM schema slips.
 * Keeps strictly deterministic repairs and never invents arbitrary defaults.
 */
export function healManifest(raw: unknown, fallback?: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;

  const obj = structuredClone(raw) as Record<string, unknown>;

  // 1. Collection field type "text" -> "string"
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    const dataObj = obj.data as Record<string, unknown>;
    if (Array.isArray(dataObj.collections)) {
      dataObj.collections = dataObj.collections.map((col) => {
        if (!col || typeof col !== "object" || Array.isArray(col)) return col;
        const c = { ...(col as Record<string, unknown>) };
        if (Array.isArray(c.fields)) {
          c.fields = c.fields.map((f) => {
            if (!f || typeof f !== "object" || Array.isArray(f)) return f;
            const field = { ...(f as Record<string, unknown>) };
            if (typeof field.type === "string" && field.type.toLowerCase() === "text") {
              field.type = "string";
            }
            return field;
          });
        }
        return c;
      });
    }
  }

  // 2. Action type -> kind ("create"|"insert"->record_insert, "update"|"edit"->record_update, "navigate"|"goto"->navigate, "save"->save_data)
  // and 3. Drop action label
  if (Array.isArray(obj.actions)) {
    obj.actions = obj.actions.map((action) => {
      if (!action || typeof action !== "object" || Array.isArray(action)) return action;
      const a = { ...(action as Record<string, unknown>) };

      if (!a.kind && typeof a.type === "string") {
        const t = a.type.toLowerCase();
        if (t === "create" || t === "insert") a.kind = "record_insert";
        else if (t === "update" || t === "edit") a.kind = "record_update";
        else if (t === "navigate" || t === "goto") a.kind = "navigate";
        else if (t === "save") a.kind = "save_data";
      }

      delete a.type;
      delete a.label;
      return a;
    });
  }

  // 4. Drop checklist props collection/fields & 5. Fill checklist items from existing node if missing
  if (Array.isArray(obj.screens)) {
    obj.screens = obj.screens.map((sc) => {
      if (!sc || typeof sc !== "object" || Array.isArray(sc)) return sc;
      const s = { ...(sc as Record<string, unknown>) };
      if (Array.isArray(s.nodes)) {
        s.nodes = s.nodes.map((node) => {
          if (!node || typeof node !== "object" || Array.isArray(node)) return node;
          const n = { ...(node as Record<string, unknown>) };
          if (n.type === "checklist") {
            const props =
              n.props && typeof n.props === "object" && !Array.isArray(n.props)
                ? { ...(n.props as Record<string, unknown>) }
                : {};
            delete props.collection;
            delete props.fields;
            if (!Array.isArray(props.items) && fallback && n.id) {
              const fallbackNode = findNodeInManifest(fallback, String(n.id));
              if (
                fallbackNode?.props &&
                typeof fallbackNode.props === "object" &&
                Array.isArray((fallbackNode.props as Record<string, unknown>).items)
              ) {
                props.items = (fallbackNode.props as Record<string, unknown>).items;
              }
            }
            n.props = props;
          }
          return n;
        });
      }
      return s;
    });
  }

  // 6. Tool meta healing: if obj.tool is missing but an api_fetch action uses a keyed adapter, auto-create tool
  if (!obj.tool || typeof obj.tool !== "object" || Array.isArray(obj.tool)) {
    let hasKeyedAdapter = false;
    if (Array.isArray(obj.actions)) {
      for (const a of obj.actions as Array<Record<string, unknown>>) {
        if (a && a.kind === "api_fetch" && typeof a.api === "string") {
          const adapter = getCatalogAdapter(a.api);
          if (adapter?.keyId) {
            hasKeyedAdapter = true;
            break;
          }
        }
      }
    }
    if (hasKeyedAdapter) {
      obj.tool = { size: "2x1" };
    }
  }

  // Ensure tool size is valid and requires is code-derived from catalog
  if (obj.tool && typeof obj.tool === "object" && !Array.isArray(obj.tool)) {
    const toolObj = { ...(obj.tool as Record<string, unknown>) };
    const validSizes = new Set(["1x1", "2x1", "2x2", "4x2"]);
    if (typeof toolObj.size !== "string" || !validSizes.has(toolObj.size)) {
      toolObj.size = "2x1";
    }

    const derivedRequires: Array<{ key_id: string; label: string; help_url?: string }> = [];
    const seenKeys = new Set<string>();
    if (Array.isArray(obj.actions)) {
      for (const a of obj.actions as Array<Record<string, unknown>>) {
        if (a && a.kind === "api_fetch" && typeof a.api === "string") {
          const adapter = getCatalogAdapter(a.api);
          if (adapter?.keyId && !seenKeys.has(adapter.keyId)) {
            seenKeys.add(adapter.keyId);
            derivedRequires.push({
              key_id: adapter.keyId,
              label: adapter.title,
              ...(adapter.helpUrl ? { help_url: adapter.helpUrl } : {}),
            });
          }
        }
      }
    }

    toolObj.requires = derivedRequires;
    obj.tool = toolObj;
  }

  return obj;
}
