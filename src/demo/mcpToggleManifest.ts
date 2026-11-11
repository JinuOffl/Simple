import type { ManifestV2 } from "@/schema/manifest.v2";

export const mcpToggleManifest: ManifestV2 = {
  schema_version: 2,
  app_id: "demo-mcp-living-room-light",
  name: "Living Room Light",
  icon: "💡",
  description: "Phase 1b vertical slice: toggle bound to MCP tool call with SSRF guard.",
  permissions: [],
  connectors: [
    {
      connector_id: "fake_home_assistant",
      tools: ["light.toggle", "light.get_state"],
    },
  ],
  data: {
    collections: [],
  },
  screens: [
    {
      id: "main",
      title: "Control",
      nodes: [
        {
          id: "light_toggle",
          type: "toggle",
          props: {
            label: "Living Room Light",
            default_value: false,
            save_to: "light_state",
          },
          bind: "light_state",
          on_click: "a_toggle_light",
        },
        {
          id: "status_card",
          type: "card",
          props: {
            title: "MCP Server Status",
            body: "Tap the toggle above to call light.toggle via run-mcp-action.",
          },
          bind: "status_card",
        },
        {
          id: "refresh_btn",
          type: "button",
          props: {
            label: "Check State",
            variant: "ghost",
          },
          on_click: "a_get_light",
        },
      ],
    },
  ],
  actions: [
    {
      id: "a_toggle_light",
      kind: "mcp_call",
      connector_id: "fake_home_assistant",
      tool_name: "light.toggle",
      params: {
        entity_id: "light.living_room",
        state: "{{light_state}}",
      },
      input_from: ["light_toggle"],
      render_result_into: "status_card",
      credit_cost_class: "mcp_call",
    },
    {
      id: "a_get_light",
      kind: "mcp_call",
      connector_id: "fake_home_assistant",
      tool_name: "light.get_state",
      params: {
        entity_id: "light.living_room",
      },
      render_result_into: "status_card",
      credit_cost_class: "mcp_call",
    },
  ],
};

