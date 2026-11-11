import type { JsonPatchOperation, ManifestV2Like } from "./types.ts";

/**
 * Pure RFC 6902 JSON Patch engine with strict prototype-pollution guards
 * and minimal-edit invariant verification for manifest updates.
 */

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

export class JsonPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonPatchError";
  }
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function parsePointer(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) {
    throw new JsonPatchError(`Invalid JSON Pointer "${pointer}": must start with "/".`);
  }
  const segments = pointer
    .slice(1)
    .split("/")
    .map((seg) => seg.replace(/~1/g, "/").replace(/~0/g, "~"));

  for (const seg of segments) {
    if (FORBIDDEN_SEGMENTS.has(seg)) {
      throw new JsonPatchError(`Forbidden JSON Pointer segment "${seg}" in path "${pointer}".`);
    }
  }
  return segments;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function parseArrayIndex(segment: string, length: number, allowDash: boolean): number {
  if (segment === "-") {
    if (!allowDash) {
      throw new JsonPatchError(`Array append token "-" is not allowed in this operation.`);
    }
    return length;
  }
  if (!/^(0|[1-9][0-9]*)$/.test(segment)) {
    throw new JsonPatchError(`Invalid array index "${segment}".`);
  }
  const index = Number(segment);
  const max = allowDash ? length : length - 1;
  if (index < 0 || index > max) {
    throw new JsonPatchError(`Array index ${index} out of bounds (length ${length}).`);
  }
  return index;
}

function getAtPointer(root: unknown, segments: string[]): unknown {
  let cursor: unknown = root;
  for (const seg of segments) {
    if (Array.isArray(cursor)) {
      const idx = parseArrayIndex(seg, cursor.length, false);
      cursor = cursor[idx];
    } else if (isPlainObject(cursor)) {
      if (!Object.prototype.hasOwnProperty.call(cursor, seg)) {
        throw new JsonPatchError(`Path segment "${seg}" does not exist.`);
      }
      cursor = cursor[seg];
    } else {
      throw new JsonPatchError(`Cannot traverse primitive at segment "${seg}".`);
    }
  }
  return cursor;
}

function resolveParent(
  root: unknown,
  segments: string[]
): { parent: Record<string, unknown> | unknown[]; key: string } {
  if (segments.length === 0) {
    throw new JsonPatchError("Operation cannot target empty root pointer in parent resolution.");
  }
  const parentSegments = segments.slice(0, -1);
  const key = segments[segments.length - 1]!;
  const parent = getAtPointer(root, parentSegments);
  if (!Array.isArray(parent) && !isPlainObject(parent)) {
    throw new JsonPatchError(`Target parent at "${parentSegments.join("/")}" is not a container.`);
  }
  return { parent, key };
}

function deepEquals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, idx) => deepEquals(item, b[idx]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(
      (k) => Object.prototype.hasOwnProperty.call(b, k) && deepEquals(a[k], b[k])
    );
  }
  return false;
}

function applySingleOperation(doc: unknown, op: JsonPatchOperation): unknown {
  const segments = parsePointer(op.path);

  switch (op.op) {
    case "add": {
      if (segments.length === 0) return deepClone(op.value);
      const { parent, key } = resolveParent(doc, segments);
      if (Array.isArray(parent)) {
        const idx = parseArrayIndex(key, parent.length, true);
        parent.splice(idx, 0, deepClone(op.value));
      } else {
        parent[key] = deepClone(op.value);
      }
      return doc;
    }

    case "remove": {
      if (segments.length === 0) {
        throw new JsonPatchError(`Cannot remove root document.`);
      }
      const { parent, key } = resolveParent(doc, segments);
      if (Array.isArray(parent)) {
        const idx = parseArrayIndex(key, parent.length, false);
        parent.splice(idx, 1);
      } else {
        if (!Object.prototype.hasOwnProperty.call(parent, key)) {
          throw new JsonPatchError(`Cannot remove non-existent key "${key}" at "${op.path}".`);
        }
        delete parent[key];
      }
      return doc;
    }

    case "replace": {
      if (segments.length === 0) return deepClone(op.value);
      const { parent, key } = resolveParent(doc, segments);
      if (Array.isArray(parent)) {
        const idx = parseArrayIndex(key, parent.length, false);
        parent[idx] = deepClone(op.value);
      } else {
        if (!Object.prototype.hasOwnProperty.call(parent, key)) {
          throw new JsonPatchError(`Cannot replace non-existent key "${key}" at "${op.path}".`);
        }
        parent[key] = deepClone(op.value);
      }
      return doc;
    }

    case "move": {
      if (typeof op.from !== "string") {
        throw new JsonPatchError(`"move" operation requires a "from" JSON Pointer.`);
      }
      if (op.path === op.from || op.path.startsWith(`${op.from}/`)) {
        throw new JsonPatchError(`Cannot move "${op.from}" into its own descendant "${op.path}".`);
      }
      const fromSegments = parsePointer(op.from);
      const val = deepClone(getAtPointer(doc, fromSegments));
      const afterRemove = applySingleOperation(doc, { op: "remove", path: op.from });
      return applySingleOperation(afterRemove, { op: "add", path: op.path, value: val });
    }

    case "copy": {
      if (typeof op.from !== "string") {
        throw new JsonPatchError(`"copy" operation requires a "from" JSON Pointer.`);
      }
      const fromSegments = parsePointer(op.from);
      const val = deepClone(getAtPointer(doc, fromSegments));
      return applySingleOperation(doc, { op: "add", path: op.path, value: val });
    }

    case "test": {
      const actual = getAtPointer(doc, segments);
      if (!deepEquals(actual, op.value)) {
        throw new JsonPatchError(`"test" operation failed at path "${op.path}".`);
      }
      return doc;
    }

    default: {
      throw new JsonPatchError(`Unsupported JSON Patch op: "${String((op as { op?: string }).op)}"`);
    }
  }
}

/**
 * Apply an RFC 6902 JSON Patch sequence to a cloned copy of `target`.
 */
export function applyJsonPatch<T>(target: T, operations: JsonPatchOperation[]): T {
  if (!Array.isArray(operations)) {
    throw new JsonPatchError("Patch operations must be an array.");
  }
  let working: unknown = deepClone(target);
  for (const op of operations) {
    if (!op || typeof op !== "object") {
      throw new JsonPatchError("Each patch operation must be an object.");
    }
    working = applySingleOperation(working, op);
  }
  return working as T;
}

export interface MinimalEditCheckResult {
  ok: boolean;
  errors: string[];
  preservedNodeIds: string[];
  preservedActionIds: string[];
}

/**
 * Enforce Non-Negotiable Constraint #3:
 * Edits must be minimal patches that preserve untouched IDs, props, and actions,
 * never wholesale document regeneration.
 */
export function verifyMinimalEditPatch(
  before: ManifestV2Like,
  after: ManifestV2Like,
  operations: JsonPatchOperation[]
): MinimalEditCheckResult {
  const errors: string[] = [];

  if (operations.length === 0) {
    errors.push("Edit patch must contain at least one RFC 6902 operation.");
  }

  for (const op of operations) {
    if (op.path === "" && (op.op === "replace" || op.op === "add")) {
      errors.push(
        `Root replacement ("path": "") is forbidden for edits; emit targeted JSON Patch operations instead.`
      );
    }
    if ((op.path === "/screens" || op.path === "/actions") && op.op === "replace") {
      const beforeNodes = before.screens.reduce((n, s) => n + s.nodes.length, 0);
      if (op.path === "/screens" && beforeNodes > 0) {
        errors.push(
          `Replacing the entire "/screens" array is forbidden when editing; patch specific screen/node paths.`
        );
      }
      if (op.path === "/actions" && before.actions.length > 0) {
        errors.push(
          `Replacing the entire "/actions" array is forbidden when editing; patch specific action indices.`
        );
      }
    }
  }

  if (after.app_id !== before.app_id) {
    errors.push(`Edit patch must preserve existing app_id "${before.app_id}".`);
  }

  const beforeNodes = new Map(
    before.screens.flatMap((s) => s.nodes.map((n) => [n.id, n] as const))
  );
  const afterNodes = new Map(
    after.screens.flatMap((s) => s.nodes.map((n) => [n.id, n] as const))
  );
  const preservedNodeIds: string[] = [];
  for (const id of beforeNodes.keys()) {
    if (afterNodes.has(id)) preservedNodeIds.push(id);
  }

  const beforeActions = new Map(before.actions.map((a) => [a.id, a] as const));
  const afterActions = new Map(after.actions.map((a) => [a.id, a] as const));
  const preservedActionIds: string[] = [];
  for (const id of beforeActions.keys()) {
    if (afterActions.has(id)) preservedActionIds.push(id);
  }

  if (beforeNodes.size > 0 && preservedNodeIds.length === 0) {
    errors.push("Edit patch removed or replaced every existing node; untouched nodes must remain.");
  }

  return {
    ok: errors.length === 0,
    errors,
    preservedNodeIds,
    preservedActionIds,
  };
}

