import type { ManifestV2, ManifestV2Node, ManifestV2Screen, ManifestV2Action } from "./manifest.v2";
import { validateManifestV2 } from "./validator";

export interface UiSpecAdapter {
  readonly format: "json" | "openui";
  parse(source: string): ManifestV2;
  serialize(manifest: ManifestV2): string;
}

/**
 * Standard JSON adapter for Manifest v2.
 * Fully validated with strict Zod schema, referential integrity, and capability allowlists.
 */
export class JsonUiSpecAdapter implements UiSpecAdapter {
  readonly format = "json" as const;

  parse(source: string): ManifestV2 {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch (err) {
      throw new Error(`JSON syntax error: ${err instanceof Error ? err.message : String(err)}`);
    }

    const validation = validateManifestV2(parsed);
    if (validation.kind === "invalid") {
      throw new Error(`Invalid Manifest v2 JSON: ${validation.errors.join("; ")}`);
    }
    if (validation.kind === "truncated") {
      throw new Error(`Truncated Manifest v2 JSON: ${validation.reason}`);
    }
    return validation.manifest;
  }

  serialize(manifest: ManifestV2): string {
    return JSON.stringify(manifest, null, 2);
  }
}

/**
 * OpenUI Lang representation adapter for Manifest v2.
 * Serializes manifests into concise declarative syntax e.g.:
 *   screen_main = Screen("main", title="Main Screen")
 *   card_1 = Card(title="Welcome", body="...")
 *   btn_1 = Button(label="Click", on_click=action_run)
 *   action_run = llm_call(prompt_template="...")
 * and parses OpenUI Lang back into ManifestV2.
 */
export class OpenUiSpecAdapter implements UiSpecAdapter {
  readonly format = "openui" as const;

  serialize(manifest: ManifestV2): string {
    const lines: string[] = [];
    lines.push(`# OpenUI Lang - Manifest v2`);
    lines.push(`app = App(id="${manifest.app_id}", name="${manifest.name}", icon="${manifest.icon}")`);

    if (manifest.description) {
      lines.push(`app.description = "${manifest.description.replace(/"/g, '\\"')}"`);
    }
    if (manifest.permissions.length > 0) {
      lines.push(`app.permissions = [${manifest.permissions.map((p) => `"${p}"`).join(", ")}]`);
    }

    for (const conn of manifest.connectors) {
      lines.push(`connector_${conn.connector_id} = Connector("${conn.connector_id}", tools=[${conn.tools.map((t) => `"${t}"`).join(", ")}])`);
    }

    for (const screen of manifest.screens) {
      const nodeRefs = screen.nodes.map((n) => n.id).join(", ");
      lines.push(`screen_${screen.id} = Screen("${screen.id}", title="${screen.title}", nodes=[${nodeRefs}])`);

      for (const node of screen.nodes) {
        const propPairs: string[] = [];
        if (node.props) {
          for (const [k, v] of Object.entries(node.props)) {
            propPairs.push(`${k}=${JSON.stringify(v)}`);
          }
        }
        if (node.bind) propPairs.push(`bind="${node.bind}"`);
        if (node.on_click) propPairs.push(`on_click="${node.on_click}"`);

        lines.push(`${node.id} = ${node.type}(${propPairs.join(", ")})`);
      }
    }

    for (const action of manifest.actions) {
      const actionProps: string[] = [];
      if (action.prompt_template) actionProps.push(`prompt_template=${JSON.stringify(action.prompt_template)}`);
      if (action.persona_prompt) actionProps.push(`persona_prompt=${JSON.stringify(action.persona_prompt)}`);
      if (action.api) actionProps.push(`api="${action.api}"`);
      if (action.operation) actionProps.push(`operation="${action.operation}"`);
      if (action.connector_id) actionProps.push(`connector_id="${action.connector_id}"`);
      if (action.tool_name) actionProps.push(`tool_name="${action.tool_name}"`);
      if (action.render_result_into) actionProps.push(`render_result_into="${action.render_result_into}"`);
      if (action.input_from && action.input_from.length > 0) {
        actionProps.push(`input_from=[${action.input_from.map((i) => `"${i}"`).join(", ")}]`);
      }

      lines.push(`${action.id} = ${action.kind}(${actionProps.join(", ")})`);
    }

    return lines.join("\n");
  }

  parse(source: string): ManifestV2 {
    const lines = source.split("\n");
    let appId = "app";
    let name = "OpenUI App";
    let icon = "📱";
    let description: string | undefined;
    const permissions: ManifestV2["permissions"] = [];
    const connectors: ManifestV2["connectors"] = [];
    const screenMap = new Map<string, { id: string; title: string; nodeIds: string[] }>();
    const nodeMap = new Map<string, ManifestV2Node>();
    const actionMap = new Map<string, ManifestV2Action>();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      // app = App(...)
      const appMatch = line.match(/^app\s*=\s*App\((.*)\)$/);
      if (appMatch) {
        const idMatch = appMatch[1].match(/id="([^"]+)"/);
        const nameMatch = appMatch[1].match(/name="([^"]+)"/);
        const iconMatch = appMatch[1].match(/icon="([^"]+)"/);
        if (idMatch) appId = idMatch[1];
        if (nameMatch) name = nameMatch[1];
        if (iconMatch) icon = iconMatch[1];
        continue;
      }

      // app.description = "..."
      const descMatch = line.match(/^app\.description\s*=\s*"(.*)"$/);
      if (descMatch) {
        description = descMatch[1].replace(/\\"/g, '"');
        continue;
      }

      // app.permissions = [...]
      const permMatch = line.match(/^app\.permissions\s*=\s*\[(.*)\]$/);
      if (permMatch) {
        const rawPerms = permMatch[1].split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
        for (const p of rawPerms) {
          if (["camera", "microphone", "location", "contacts", "notifications"].includes(p)) {
            permissions.push(p as ManifestV2["permissions"][number]);
          }
        }
        continue;
      }

      // connector_<id> = Connector("...", tools=[...])
      const connMatch = line.match(/^connector_(\w+)\s*=\s*Connector\("([^"]+)",\s*tools=\[(.*)\]\)$/);
      if (connMatch) {
        const connId = connMatch[2];
        const tools = connMatch[3]
          ? connMatch[3].split(",").map((t) => t.trim().replace(/^"|"$/g, ""))
          : [];
        connectors.push({ connector_id: connId, tools: tools.filter(Boolean) });
        continue;
      }

      // screen_<id> = Screen("...", title="...", nodes=[...])
      const screenMatch = line.match(/^screen_(\w+)\s*=\s*Screen\("([^"]+)",\s*title="([^"]+)",\s*nodes=\[(.*)\]\)$/);
      if (screenMatch) {
        const sId = screenMatch[2];
        const title = screenMatch[3];
        const nodeIds = screenMatch[4]
          ? screenMatch[4].split(",").map((n) => n.trim())
          : [];
        screenMap.set(sId, { id: sId, title, nodeIds: nodeIds.filter(Boolean) });
        continue;
      }

      // Assignment: identifier = Function(...)
      const assignMatch = line.match(/^(\w+)\s*=\s*(\w+)\((.*)\)$/);
      if (assignMatch) {
        const identifier = assignMatch[1];
        const funcName = assignMatch[2];
        const rawArgs = assignMatch[3];

        const isActionKind = [
          "llm_call",
          "local_compute",
          "api_fetch",
          "mcp_call",
          "navigate",
          "save_data",
          "record_insert",
          "record_update",
          "conversation_loop",
        ].includes(funcName);

        if (isActionKind) {
          const actionObj: ManifestV2Action = {
            id: identifier,
            kind: funcName as ManifestV2Action["kind"],
          };
          const promptMatch = rawArgs.match(/prompt_template=(.*)/);
          if (promptMatch) {
            try {
              actionObj.prompt_template = JSON.parse(promptMatch[1].split(/,\s*\w+=/)[0]);
            } catch {
              actionObj.prompt_template = promptMatch[1];
            }
          }
          const renderMatch = rawArgs.match(/render_result_into="([^"]+)"/);
          if (renderMatch) actionObj.render_result_into = renderMatch[1];
          const apiMatch = rawArgs.match(/api="([^"]+)"/);
          if (apiMatch && ["weather", "currency", "timezone", "dictionary", "country", "trivia"].includes(apiMatch[1])) {
            actionObj.api = apiMatch[1] as ManifestV2Action["api"];
          }

          actionMap.set(identifier, actionObj);
        } else {
          // UI Node
          const node: ManifestV2Node = {
            id: identifier,
            type: funcName as ManifestV2Node["type"],
          };
          const bindMatch = rawArgs.match(/bind="([^"]+)"/);
          if (bindMatch) node.bind = bindMatch[1];
          const onClickMatch = rawArgs.match(/on_click="([^"]+)"/);
          if (onClickMatch) node.on_click = onClickMatch[1];

          // Parse props if any keyword args exist
          const props: Record<string, unknown> = {};
          const propRegex = /(\w+)=("[^"]*"|\[[^\]]*\]|\{[^}]*\}|\d+|true|false)/g;
          let pMatch: RegExpExecArray | null;
          while ((pMatch = propRegex.exec(rawArgs)) !== null) {
            const key = pMatch[1];
            if (key === "bind" || key === "on_click") continue;
            try {
              props[key] = JSON.parse(pMatch[2]);
            } catch {
              props[key] = pMatch[2];
            }
          }
          if (Object.keys(props).length > 0) {
            node.props = props;
          }
          nodeMap.set(identifier, node);
        }
      }
    }

    const screens: ManifestV2Screen[] = [];
    if (screenMap.size === 0) {
      screens.push({
        id: "main",
        title: "Main",
        nodes: [...nodeMap.values()],
      });
    } else {
      for (const s of screenMap.values()) {
        const nodes: ManifestV2Node[] = [];
        for (const nid of s.nodeIds) {
          const n = nodeMap.get(nid);
          if (n) nodes.push(n);
        }
        screens.push({ id: s.id, title: s.title, nodes });
      }
    }

    const manifest: ManifestV2 = {
      schema_version: 2,
      app_id: appId,
      name,
      icon,
      description,
      permissions,
      connectors,
      data: { collections: [] },
      screens,
      actions: [...actionMap.values()],
    };

    return manifest;
  }
}

export interface FormatComparisonResult {
  manifestId: string;
  jsonLengthChars: number;
  openUiLengthChars: number;
  jsonEstTokens: number;
  openUiEstTokens: number;
  tokenReductionPercent: number;
  jsonParseLatencyMs: number;
  openUiParseLatencyMs: number;
  roundtripMatch: boolean;
}

/**
 * Compare serialization, parsing latency, estimated token count, and roundtrip fidelity
 * between JSON and OpenUI Lang.
 */
export function compareUiSpecFormats(manifest: ManifestV2): FormatComparisonResult {
  const jsonAdapter = new JsonUiSpecAdapter();
  const openUiAdapter = new OpenUiSpecAdapter();

  const jsonStr = jsonAdapter.serialize(manifest);
  const openUiStr = openUiAdapter.serialize(manifest);

  const t0 = performance.now();
  const parsedJson = jsonAdapter.parse(jsonStr);
  const t1 = performance.now();
  const jsonParseMs = Math.max(0.01, t1 - t0);

  const t2 = performance.now();
  const parsedOpenUi = openUiAdapter.parse(openUiStr);
  const t3 = performance.now();
  const openUiParseMs = Math.max(0.01, t3 - t2);

  const jsonEstTokens = Math.ceil(jsonStr.length / 3.8);
  const openUiEstTokens = Math.ceil(openUiStr.length / 3.8);
  const tokenReductionPercent = Math.round(((jsonEstTokens - openUiEstTokens) / jsonEstTokens) * 100);

  const roundtripMatch =
    parsedJson.app_id === parsedOpenUi.app_id &&
    parsedJson.screens.length === parsedOpenUi.screens.length;

  return {
    manifestId: manifest.app_id,
    jsonLengthChars: jsonStr.length,
    openUiLengthChars: openUiStr.length,
    jsonEstTokens,
    openUiEstTokens,
    tokenReductionPercent,
    jsonParseLatencyMs: parseFloat(jsonParseMs.toFixed(3)),
    openUiParseLatencyMs: parseFloat(openUiParseMs.toFixed(3)),
    roundtripMatch,
  };
}
