import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Checklist } from "@/components/Checklist";
import { Calculator } from "@/components/Calculator";
import { Clock } from "@/components/Clock";
import { ImageCapture } from "@/components/ImageCapture";
import { ImageGallery } from "@/components/ImageGallery";
import { MicRecorder } from "@/components/MicRecorder";
import { McqQuiz } from "@/components/McqQuiz";
import { ChatBubble } from "@/components/ChatBubble";
import { ConversationLoop } from "@/components/ConversationLoop";
import type { RegistryRenderContext } from "./types";

interface AdapterBaseProps {
  id: string;
  bindValue?: unknown;
  onAction?: () => void | Promise<void>;
  ctx?: RegistryRenderContext;
}

export function TextAdapter({
  content,
  className,
  bindValue,
  ctx,
}: AdapterBaseProps & { content?: string; className?: string }) {
  const resolved =
    typeof ctx?.bindValue === "string"
      ? ctx.bindValue
      : typeof bindValue === "string"
        ? bindValue
        : content ?? "";
  return <Text content={resolved} className={className} />;
}

export function CardAdapter({
  title,
  body,
  bindValue,
  ctx,
}: AdapterBaseProps & { title?: string; body?: string }) {
  const resolvedBody =
    typeof ctx?.bindValue === "string"
      ? ctx.bindValue
      : typeof bindValue === "string"
        ? bindValue
        : body ?? "";
  return <Card title={title ?? ""} body={resolvedBody} />;
}

export function ButtonAdapter({
  label,
  loading,
  disabled,
  variant,
  onAction,
  ctx,
}: AdapterBaseProps & {
  label?: string;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const handleClick = ctx?.onAction
    ? () => {
        void ctx.onAction?.();
      }
    : onAction
      ? () => {
          void onAction();
        }
      : undefined;

  return (
    <Button
      label={label ?? ""}
      loading={Boolean(ctx?.isLoading || loading)}
      disabled={disabled}
      variant={variant}
      onClick={handleClick}
    />
  );
}

export function ChecklistAdapter({
  items,
}: AdapterBaseProps & { items?: string[] }) {
  return <Checklist items={Array.isArray(items) ? items : []} />;
}

export function CalculatorAdapter(_props: AdapterBaseProps) {
  return <Calculator />;
}

export function ClockAdapter({
  timezone,
  format,
  label,
}: AdapterBaseProps & {
  timezone?: string;
  format?: "12h" | "24h";
  label?: string;
}) {
  return <Clock timezone={timezone} format={format ?? "12h"} label={label} />;
}

export function ImageCaptureAdapter({
  label,
  save_to,
  onAction,
  ctx,
}: AdapterBaseProps & { label?: string; save_to?: string }) {
  return (
    <ImageCapture
      label={label ?? "Take Photo"}
      save_to={save_to}
      onCapture={(base64, key) => {
        if (key) ctx?.onDataChange?.(key, base64);
        if (ctx?.onAction) {
          void ctx.onAction({ [key ?? "image"]: base64 });
        } else if (onAction) {
          void onAction();
        }
      }}
    />
  );
}

export function ImageGalleryAdapter({
  images,
  source,
  bindValue,
  ctx,
}: AdapterBaseProps & { images?: string[]; source?: string }) {
  const resolvedImages = Array.isArray(ctx?.bindValue)
    ? (ctx.bindValue as string[])
    : Array.isArray(bindValue)
      ? (bindValue as string[])
      : ctx && source && Array.isArray(ctx.appData[source])
        ? (ctx.appData[source] as string[])
        : Array.isArray(images)
          ? images
          : [];
  return <ImageGallery images={resolvedImages} source={source} />;
}

export function MicRecorderAdapter({
  label,
  save_to,
  ctx,
}: AdapterBaseProps & { label?: string; save_to?: string }) {
  return (
    <MicRecorder
      label={label ?? "Record"}
      save_to={save_to}
      onTranscript={(text, key) => {
        if (key) ctx?.onDataChange?.(key, text);
      }}
    />
  );
}

export function McqQuizAdapter({
  questions,
}: AdapterBaseProps & {
  questions?: Array<{
    question: string;
    options: string[];
    correct_index: number;
  }>;
}) {
  return <McqQuiz questions={Array.isArray(questions) ? questions : []} />;
}

export function ChatBubbleAdapter({
  role,
  content,
}: AdapterBaseProps & { role?: "user" | "assistant"; content?: string }) {
  return <ChatBubble role={role ?? "assistant"} content={content ?? ""} />;
}

export function ConversationLoopAdapter({
  id,
  persona_prompt,
  actionId,
  appId,
  ctx,
}: AdapterBaseProps & {
  persona_prompt?: string;
  actionId?: string;
  appId?: string;
}) {
  return (
    <ConversationLoop
      actionId={actionId ?? ctx?.onClickActionId ?? id}
      persona_prompt={persona_prompt ?? "You are a helpful assistant."}
      appId={appId ?? ctx?.appId}
    />
  );
}
