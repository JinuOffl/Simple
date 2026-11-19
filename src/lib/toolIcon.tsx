import React from "react";
import {
  Calculator,
  Clock,
  Cloud,
  CheckSquare,
  MessageSquare,
  Grid3X3,
  Hash,
  Camera,
  Mic,
  Coins,
  HelpCircle,
  Wrench,
  Heart,
  type LucideProps,
} from "lucide-react";
import type { ManifestV2 } from "@/schema/manifest.v2";

interface ToolIconProps extends LucideProps {
  manifest?: ManifestV2 | null;
  category?: string;
  emoji?: string;
}

export interface MinimalTemplate {
  name: string;
  slug?: string;
  icon?: string;
  description?: string;
  manifest?: unknown;
}

function resolveIconComponent(
  nameOrSlug?: string,
  emoji?: string,
  toolType?: string
): React.ComponentType<LucideProps> {
  const text = `${nameOrSlug || ""} ${emoji || ""} ${toolType || ""}`.toLowerCase();

  if (text.includes("calc") || text.includes("arithmetic") || text.includes("🧮")) {
    return Calculator;
  }
  if (
    text.includes("clock") ||
    text.includes("timer") ||
    text.includes("pomodoro") ||
    text.includes("time") ||
    text.includes("⏱️") ||
    text.includes("🕒") ||
    text.includes("⏰")
  ) {
    return Clock;
  }
  if (text.includes("weather") || text.includes("forecast") || text.includes("cloud") || text.includes("🌤️") || text.includes("🌧️")) {
    return Cloud;
  }
  if (
    text.includes("check") ||
    text.includes("todo") ||
    text.includes("task") ||
    text.includes("water") ||
    text.includes("checklist") ||
    text.includes("✅") ||
    text.includes("☑️")
  ) {
    return CheckSquare;
  }
  if (
    text.includes("tutor") ||
    text.includes("chat") ||
    text.includes("conversation") ||
    text.includes("ai") ||
    text.includes("message") ||
    text.includes("💬") ||
    text.includes("🤖")
  ) {
    return MessageSquare;
  }
  if (
    text.includes("heat") ||
    text.includes("habit") ||
    text.includes("grid") ||
    text.includes("streak") ||
    text.includes("📊") ||
    text.includes("🟩")
  ) {
    return Grid3X3;
  }
  if (text.includes("counter") || text.includes("count") || text.includes("tally") || text.includes("🔢")) {
    return Hash;
  }
  if (text.includes("camera") || text.includes("photo") || text.includes("image") || text.includes("📸") || text.includes("📷")) {
    return Camera;
  }
  if (text.includes("mic") || text.includes("voice") || text.includes("record") || text.includes("audio") || text.includes("🎙️") || text.includes("🎤")) {
    return Mic;
  }
  if (text.includes("currency") || text.includes("money") || text.includes("coin") || text.includes("forex") || text.includes("💱") || text.includes("💵")) {
    return Coins;
  }
  if (text.includes("quiz") || text.includes("flashcard") || text.includes("mcq") || text.includes("trivia") || text.includes("question") || text.includes("❓")) {
    return HelpCircle;
  }
  if (text.includes("heart") || text.includes("ble") || text.includes("pulse") || text.includes("bpm") || text.includes("❤️")) {
    return Heart;
  }

  return Wrench;
}

export function ToolIcon({
  manifest,
  category,
  emoji,
  size = 14,
  strokeWidth = 1.5,
  className,
  ...rest
}: ToolIconProps) {
  const IconComponent = resolveIconComponent(
    manifest?.name || category,
    manifest?.icon || emoji,
    (manifest?.tool as any)?.type
  );

  return <IconComponent size={size} strokeWidth={strokeWidth} className={className} {...rest} />;
}

export function TemplateIcon({
  template,
  size = 14,
  strokeWidth = 1.5,
  className,
  ...rest
}: {
  template: MinimalTemplate;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const IconComponent = resolveIconComponent(
    template.slug || template.name,
    template.icon,
    (template.manifest as any)?.tool?.type
  );

  return <IconComponent size={size} strokeWidth={strokeWidth} className={className} {...rest} />;
}

