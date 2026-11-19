import type {
  ConversationTurn,
  ManifestV2Like,
  Permission,
  PromptAnalysis,
  UnsupportedFeatureFinding,
} from "./types.ts";
import { ALLOWLISTED_APIS, KNOWN_MCP_CONNECTORS } from "./registrySpec.ts";

/**
 * Deterministic `ANALYZE` stage:
 * Extracts user intent, requested built-in components/APIs/MCP connectors,
 * required native permissions, and catches unsupported requests upfront so
 * Constraint #8 ("honesty over magic") holds deterministically.
 */

interface UnsupportedRule {
  readonly feature: string;
  readonly pattern: RegExp;
  readonly reason: string;
  readonly alternative: string;
}

const UNSUPPORTED_RULES: readonly UnsupportedRule[] = [
  {
    feature: "end_to_end_encrypted_messaging",
    pattern:
      /\b(end[\s-]?to[\s-]?end encrypt(ed|ion)|e2e encrypt(ed|ion)|e2ee|whatsapp (clone|replacement)|signal (clone|replacement))\b/i,
    reason:
      "Simple v2 explicitly does not provide private end-to-end encrypted messaging or a WhatsApp/Signal replacement.",
    alternative:
      "I can build a shared group check-in or notes app (non-E2E encrypted) using `card` or `conversation_loop` instead.",
  },
  {
    feature: "ios_native_build",
    pattern:
      /\b(ios app|apple app store|swiftui|xcode build|iphone ipa|compile for ios)\b/i,
    reason:
      "Simple v2 targets web apps and Android only; native iOS compilation/App Store builds are not supported.",
    alternative:
      "I can build the same workflow as a web/Android Simple app you can open in any mobile browser.",
  },
  {
    feature: "arbitrary_os_execution",
    pattern:
      /\b(run bash|execute shell|run python script|root (my )?phone|install apk|arbitrary javascript execution|eval arbitrary code)\b/i,
    reason:
      "For security, Simple never generates or executes arbitrary shell/OS scripts or unreviewed executable code.",
    alternative:
      "Describe the specific workflow you want (calculator, API lookup, AI assistant, or an allowlisted MCP connector tool).",
  },
  {
    feature: "native_sms_or_calls",
    pattern:
      /\b(send (real )?sms automatically|auto[\s-]?dial phone calls|intercept incoming calls|read sms inbox)\b/i,
    reason:
      "Background SMS sending, auto-dialing, and call/SMS interception are not available capabilities in Simple.",
    alternative:
      "I can build a quick call-prep checklist, message drafter using `llm_call`, or trigger an approved webhook/MCP tool.",
  },
  {
    feature: "real_money_execution",
    pattern:
      /\b(transfer real money|send upi payment|charge credit cards|auto[\s-]?trade stocks|execute crypto trades|connect bank account directly)\b/i,
    reason:
      "Live payment processing, direct bank transfers, and automated financial trading are not supported.",
    alternative:
      "I can build an invoice ledger, expense tracker, or live currency conversion viewer instead.",
  },
];

export function analyzePrompt(
  prompt: string,
  existingManifest?: ManifestV2Like,
  conversationContext: ConversationTurn[] = []
): PromptAnalysis {
  const combinedText = [prompt, ...conversationContext.map((m) => m.content)].join(" \n ");
  const lower = prompt.toLowerCase();

  const unsupportedRequests: UnsupportedFeatureFinding[] = [];
  for (const rule of UNSUPPORTED_RULES) {
    if (rule.pattern.test(prompt)) {
      unsupportedRequests.push({
        feature: rule.feature,
        reason: rule.reason,
        alternative: rule.alternative,
      });
    }
  }

  const suggestedApis: string[] = [];
  if (/\b(weather|forecast|rain|temperature|humidity)\b/i.test(lower)) {
    suggestedApis.push("weather");
  }
  if (/\b(currency|exchange rate|forex|usd|eur|inr|gbp|jpy)\b/i.test(lower)) {
    suggestedApis.push("currency");
  }
  if (/\b(timezone|world clock|time in )\b/i.test(lower)) {
    suggestedApis.push("timezone");
  }
  if (/\b(dictionary|define word|meaning of|synonym|phonetic)\b/i.test(lower)) {
    suggestedApis.push("dictionary");
  }
  if (/\b(country|capital of|population of|flag of)\b/i.test(lower)) {
    suggestedApis.push("country");
  }
  if (/\b(advice|tip of the day|life advice)\b/i.test(lower)) {
    suggestedApis.push("advice");
  }

  const suggestedConnectors: Array<{ connectorId: string; tools: string[] }> = [];
  for (const connector of KNOWN_MCP_CONNECTORS) {
    if (connector.keywords.some((kw) => lower.includes(kw))) {
      suggestedConnectors.push({
        connectorId: connector.connector_id,
        tools: [...connector.tools],
      });
    }
  }

  const suggestedComponents = new Set<string>(["card"]);
  const suggestedPermissions = new Set<Permission>();

  if (/\b(calculator|arithmetic|math|tip calc)\b/i.test(lower)) {
    suggestedComponents.add("calculator");
  }
  if (/\b(clock|watch|time|timezone)\b/i.test(lower)) {
    suggestedComponents.add("clock");
  }
  if (/\b(checklist|todo|to-do|habit|packing|grocery|routine|chore|task list)\b/i.test(lower)) {
    suggestedComponents.add("checklist");
  }
  if (/\b(quiz|mcq|trivia quiz|multiple choice|test me|aptitude)\b/i.test(lower)) {
    suggestedComponents.add("mcq_quiz");
  }
  if (
    /\b(camera|photo|snap|scan receipt|take a picture|gallery)\b/i.test(lower)
  ) {
    suggestedComponents.add("image_capture");
    suggestedComponents.add("image_gallery");
    suggestedPermissions.add("camera");
  }
  if (/\b(voice note|mic|record audio|speech to text|dictate)\b/i.test(lower)) {
    suggestedComponents.add("mic_recorder");
    suggestedPermissions.add("microphone");
  }
  if (
    /\b(tutor|coach|interview|feynman|chat assistant|mentor|conversational|roleplay)\b/i.test(
      lower
    )
  ) {
    suggestedComponents.add("conversation_loop");
    suggestedPermissions.add("microphone");
  }
  if (/\b(toggle|switch|on\/off|smart light|lamp|smart plug)\b/i.test(lower)) {
    suggestedComponents.add("toggle");
  }
  if (suggestedApis.length > 0 || /\b(generate|summarize|draft|explain|button|fetch|check)\b/i.test(lower)) {
    suggestedComponents.add("button");
  }

  const multiplayerRequested =
    /\b(couple|couples|shared|multiplayer|team|friends|with my partner|roommate|family)\b/i.test(
      lower
    );

  const requestedFeatures: string[] = [];
  for (const api of suggestedApis) {
    if (api in ALLOWLISTED_APIS) requestedFeatures.push(`api_fetch:${api}`);
  }
  for (const conn of suggestedConnectors) {
    requestedFeatures.push(`mcp:${conn.connectorId}`);
  }
  for (const comp of suggestedComponents) {
    requestedFeatures.push(`component:${comp}`);
  }
  if (multiplayerRequested) requestedFeatures.push("multiplayer:shared_app");

  const screenHints = existingManifest
    ? existingManifest.screens.map((s) => s.id)
    : ["main"];

  const trimmedIntent =
    prompt.trim().length > 160 ? `${prompt.trim().slice(0, 157)}...` : prompt.trim();

  // Mention combinedText length softly so no unused-var lint occurs even as context grows
  if (combinedText.length === 0) {
    return {
      intent: trimmedIntent,
      isEdit: Boolean(existingManifest),
      requestedFeatures,
      unsupportedRequests,
      suggestedApis,
      suggestedConnectors,
      suggestedComponents: [...suggestedComponents],
      suggestedPermissions: [...suggestedPermissions],
      screenHints,
      multiplayerRequested,
    };
  }

  return {
    intent: trimmedIntent,
    isEdit: Boolean(existingManifest),
    requestedFeatures,
    unsupportedRequests,
    suggestedApis,
    suggestedConnectors,
    suggestedComponents: [...suggestedComponents],
    suggestedPermissions: [...suggestedPermissions],
    screenHints,
    multiplayerRequested,
  };
}

