import { corsHeaders } from "../_shared/cors.ts";

// Runtime LLM action executor — separate from manifest generation
// Handles llm_call and conversation_loop actions in running mini-apps

async function callGroq(
  messages: Array<{ role: string; content: string }>,
  groqApiKey: string,
  model = "llama-3.3-70b-versatile"
): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const groqApiKey = Deno.env.get("GROQ_API_KEY");
    if (!groqApiKey) throw new Error("GROQ_API_KEY not set");

    const body = await req.json();
    const { action, app_data = {}, conversation_history = [] } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: "action is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result = "";

    if (action.kind === "llm_call") {
      // Fill template placeholders with app_data values
      let prompt = action.prompt_template ?? "Provide a helpful response.";
      for (const [key, val] of Object.entries(app_data)) {
        prompt = prompt.replace(
          new RegExp(`\\{\\{${key}\\}\\}`, "g"),
          typeof val === "string" ? val : JSON.stringify(val)
        );
      }

      const messages = [
        {
          role: "system",
          content: "You are a helpful assistant inside a personal mini-app. Be concise and practical.",
        },
        { role: "user", content: prompt },
      ];

      result = await callGroq(messages, groqApiKey);
    } else if (action.kind === "conversation_loop") {
      // Multi-turn conversation with persona
      const systemMsg = {
        role: "system",
        content:
          (action.persona_prompt ?? "You are a helpful assistant.") +
          "\n\nBe concise. Ask one follow-up question at a time. Keep responses under 150 words.",
      };

      // Build messages from conversation history
      const messages = [
        systemMsg,
        ...conversation_history.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      ];

      // Use a lighter model for conversation turns to reduce latency
      result = await callGroq(messages, groqApiKey, "llama-3.1-8b-instant");
    } else {
      return new Response(JSON.stringify({ error: `Unsupported action kind: ${action.kind}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("run-llm-action error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
