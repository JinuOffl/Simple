import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Toggle } from "@/components/Toggle";
import { Checklist } from "@/components/Checklist";
import { Calculator } from "@/components/Calculator";
import { Clock } from "@/components/Clock";
import { ImageCapture } from "@/components/ImageCapture";
import { ImageGallery } from "@/components/ImageGallery";
import { MicRecorder } from "@/components/MicRecorder";
import { McqQuiz } from "@/components/McqQuiz";
import { ChatBubble } from "@/components/ChatBubble";
import { ConversationLoop } from "@/components/ConversationLoop";
import { Markdown } from "@/components/Markdown";
import { Stat } from "@/components/Stat";
import { Slider } from "@/components/Slider";
import { Timer } from "@/components/Timer";
import { Tabs } from "@/components/Tabs";
import { List } from "@/components/List";
import { Table } from "@/components/Table";
import { Form, type FormFieldSpec } from "@/components/Form";
import { Chart } from "@/components/Chart";
import { ChatThread } from "@/components/ChatThread";
import { Heatmap } from "@/components/Heatmap";
import { Status } from "@/components/Status";
import { IconRow, type IconRowItem } from "@/components/IconRow";
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
  id,
  items,
  allowAdd,
  allowDelete,
  allowEdit,
  placeholder,
  bindValue,
  ctx,
}: AdapterBaseProps & {
  items?: string[];
  allowAdd?: boolean;
  allowDelete?: boolean;
  allowEdit?: boolean;
  placeholder?: string;
}) {
  const resolvedItems = Array.isArray(ctx?.bindValue)
    ? (ctx.bindValue as string[])
    : Array.isArray(bindValue)
      ? (bindValue as string[])
      : Array.isArray(items)
        ? items
        : [];

  return (
    <Checklist
      id={id}
      items={resolvedItems}
      allowAdd={allowAdd}
      allowDelete={allowDelete}
      allowEdit={allowEdit}
      placeholder={placeholder}
      ctx={ctx}
    />
  );
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

export function ToggleAdapter({
  id,
  label,
  default_value,
  save_to,
  bindValue,
  onAction,
  ctx,
}: AdapterBaseProps & {
  label?: string;
  default_value?: boolean;
  save_to?: string;
}) {
  const dataKey = save_to ?? id;
  const resolvedChecked =
    typeof ctx?.bindValue === "boolean"
      ? ctx.bindValue
      : typeof bindValue === "boolean"
        ? bindValue
        : save_to && typeof ctx?.appData[save_to] === "boolean"
          ? (ctx.appData[save_to] as boolean)
          : typeof ctx?.appData[id] === "boolean"
            ? (ctx.appData[id] as boolean)
            : Boolean(default_value);

  return (
    <Toggle
      label={label ?? "Toggle"}
      checked={resolvedChecked}
      defaultValue={Boolean(default_value)}
      loading={Boolean(ctx?.isLoading)}
      onToggle={(next) => {
        ctx?.onDataChange?.(dataKey, next);
        if (ctx?.onAction) {
          void ctx.onAction({ [dataKey]: next, state: next });
        } else if (onAction) {
          void onAction();
        }
      }}
    />
  );
}

export function MarkdownAdapter({
  content,
  bindValue,
  ctx,
}: AdapterBaseProps & { content?: string }) {
  const resolved =
    typeof ctx?.bindValue === "string"
      ? ctx.bindValue
      : typeof bindValue === "string"
        ? bindValue
        : content ?? "";
  return <Markdown content={resolved} />;
}

export function StatAdapter({
  label,
  value,
  unit,
  description,
  bindValue,
  ctx,
}: AdapterBaseProps & {
  label?: string;
  value?: string | number;
  unit?: string;
  description?: string;
}) {
  const resolvedValue =
    ctx?.bindValue !== undefined
      ? (ctx.bindValue as string | number)
      : bindValue !== undefined
        ? (bindValue as string | number)
        : value;
  return (
    <Stat
      label={label}
      value={resolvedValue}
      unit={unit}
      description={description}
    />
  );
}

export function SliderAdapter({
  id,
  label,
  min,
  max,
  step,
  default_value,
  save_to,
  bindValue,
  onAction,
  ctx,
}: AdapterBaseProps & {
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  default_value?: number;
  save_to?: string;
}) {
  const dataKey = save_to ?? id;
  const resolvedVal =
    typeof ctx?.bindValue === "number"
      ? ctx.bindValue
      : typeof bindValue === "number"
        ? bindValue
        : save_to && typeof ctx?.appData[save_to] === "number"
          ? (ctx.appData[save_to] as number)
          : typeof ctx?.appData[id] === "number"
            ? (ctx.appData[id] as number)
            : default_value;

  return (
    <Slider
      label={label}
      min={min}
      max={max}
      step={step}
      value={resolvedVal}
      defaultValue={default_value}
      disabled={Boolean(ctx?.isLoading)}
      onChange={(next) => {
        ctx?.onDataChange?.(dataKey, next);
        if (ctx?.onAction) {
          void ctx.onAction({ [dataKey]: next, value: next });
        } else if (onAction) {
          void onAction();
        }
      }}
    />
  );
}

export function TimerAdapter({
  duration_seconds,
  label,
  auto_start,
}: AdapterBaseProps & {
  duration_seconds?: number;
  label?: string;
  auto_start?: boolean;
}) {
  return (
    <Timer
      duration_seconds={duration_seconds}
      label={label}
      auto_start={auto_start}
    />
  );
}

export function TabsAdapter({
  tabs,
  default_tab,
  ctx,
}: AdapterBaseProps & {
  tabs?: Array<{ label: string; screen_id: string }>;
  default_tab?: string;
}) {
  return (
    <Tabs
      tabs={tabs}
      default_tab={default_tab}
      onSelectTab={(screenId) => {
        ctx?.onNavigateScreen?.(screenId);
      }}
    />
  );
}

export function ListAdapter({
  items,
  ordered,
  bindValue,
  ctx,
}: AdapterBaseProps & { items?: string[]; ordered?: boolean }) {
  const resolvedItems = Array.isArray(ctx?.bindValue)
    ? (ctx.bindValue as string[])
    : Array.isArray(bindValue)
      ? (bindValue as string[])
      : items ?? [];
  return <List items={resolvedItems} ordered={ordered} />;
}

export function TableAdapter({
  columns,
  rows,
  bindValue,
  ctx,
}: AdapterBaseProps & { columns?: string[]; rows?: string[][] }) {
  const resolvedRows = Array.isArray(ctx?.bindValue)
    ? (ctx.bindValue as string[][])
    : Array.isArray(bindValue)
      ? (bindValue as string[][])
      : rows ?? [];
  return <Table columns={columns} rows={resolvedRows} />;
}

export function FormAdapter({
  fields,
  submit_label,
  onAction,
  ctx,
}: AdapterBaseProps & {
  fields?: FormFieldSpec[];
  submit_label?: string;
}) {
  return (
    <Form
      fields={fields}
      submit_label={submit_label}
      initialValues={ctx?.appData}
      loading={Boolean(ctx?.isLoading)}
      onSubmit={async (values) => {
        for (const [k, v] of Object.entries(values)) {
          ctx?.onDataChange?.(k, v);
        }
        if (ctx?.onAction) {
          await ctx.onAction(values);
        } else if (onAction) {
          await onAction();
        }
      }}
    />
  );
}

export function ChartAdapter({
  chart_type,
  labels,
  datasets,
  title,
  live,
  max_points,
  bindValue,
  ctx,
}: AdapterBaseProps & {
  chart_type?: "bar" | "line" | "pie";
  labels?: string[];
  datasets?: Array<{ label: string; data: number[] }>;
  title?: string;
  live?: boolean;
  max_points?: number;
}) {
  const resolvedValue = ctx?.bindValue !== undefined ? ctx.bindValue : bindValue;
  const resolvedDatasets = Array.isArray(resolvedValue)
    ? (resolvedValue as Array<{ label: string; data: number[] }>)
    : datasets;
  return (
    <Chart
      chart_type={chart_type}
      labels={labels}
      datasets={resolvedDatasets}
      title={title}
      live={live}
      max_points={max_points}
      bindValue={resolvedValue}
    />
  );
}

export function ChatThreadAdapter({
  persona_prompt,
  initial_message,
  placeholder,
  ctx,
}: AdapterBaseProps & {
  persona_prompt?: string;
  initial_message?: string;
  placeholder?: string;
}) {
  return (
    <ChatThread
      persona_prompt={persona_prompt}
      initial_message={initial_message}
      placeholder={placeholder}
      appId={ctx?.appId}
    />
  );
}

export function HeatmapAdapter({
  id,
  rows,
  days,
  save_to,
  title,
  bindValue,
  ctx,
}: AdapterBaseProps & {
  rows: string[];
  days?: number;
  save_to?: string;
  title?: string;
}) {
  return (
    <Heatmap
      id={id}
      rows={rows}
      days={days}
      save_to={save_to}
      title={title}
      bindValue={bindValue}
      ctx={ctx}
    />
  );
}

export function StatusAdapter({
  id,
  label,
  state,
  bindValue,
  ctx,
}: AdapterBaseProps & {
  label: string;
  state?: "ok" | "warn" | "off";
}) {
  return (
    <Status
      id={id}
      label={label}
      state={state}
      bindValue={bindValue}
      ctx={ctx}
    />
  );
}

export function IconRowAdapter({
  id,
  items,
  bindValue,
  onAction,
  ctx,
}: AdapterBaseProps & {
  items: IconRowItem[];
}) {
  return (
    <IconRow
      id={id}
      items={items}
      bindValue={bindValue}
      onAction={onAction}
      ctx={ctx}
    />
  );
}
