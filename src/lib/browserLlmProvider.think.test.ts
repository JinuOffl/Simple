import { describe, it, expect } from "vitest";
import { extractJsonFromText } from "./browserLlmProvider";

describe("Phase 1.6: browser extractJsonFromText <think> tag robustness", () => {
  it("parses JSON preceded by a multiline think block", () => {
    const raw = `<think>
I need to produce a valid manifest.
Let's make sure the components are well-formed.
</think>
{"app_id": "test-tool", "schema_version": 2}`;
    const result = extractJsonFromText(raw) as Record<string, unknown>;
    expect(result.app_id).toBe("test-tool");
    expect(result.schema_version).toBe(2);
  });

  it("handles case-insensitive THINK tags", () => {
    const raw = `<THINK>
internal thinking process
</THINK>
{"status": "ready", "count": 42}`;
    const result = extractJsonFromText(raw) as Record<string, unknown>;
    expect(result.status).toBe("ready");
    expect(result.count).toBe(42);
  });

  it("parses JSON in a code fence with a think block", () => {
    const raw = `<think>thinking...</think>
\`\`\`json
{
  "name": "Checklist Tool",
  "nodes": ["node_1"]
}
\`\`\``;
    const result = extractJsonFromText(raw) as Record<string, unknown>;
    expect(result.name).toBe("Checklist Tool");
    expect(result.nodes).toEqual(["node_1"]);
  });

  it("parses JSON with prose around it and a think block", () => {
    const raw = `<think>generating answer</think>
Here is the JSON you requested:
{"valid": true}
Let me know if you need any adjustments!`;
    const result = extractJsonFromText(raw) as Record<string, unknown>;
    expect(result.valid).toBe(true);
  });

  it("throws Error if model output contains no valid JSON", () => {
    const raw = "<think>Failed to generate</think>Sorry, I cannot do that.";
    expect(() => extractJsonFromText(raw)).toThrow("Model output did not contain valid JSON.");
  });
});
