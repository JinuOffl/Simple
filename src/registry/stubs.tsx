import type { RegistryRenderContext } from "./types";

interface StubBaseProps {
  id: string;
  bindValue?: unknown;
  onAction?: () => void | Promise<void>;
  ctx?: RegistryRenderContext;
}

function StubPlaceholder({ type }: { type: string }) {
  return (
    <div className="border p-2 text-xs opacity-50">({type} — coming soon)</div>
  );
}

export function MarkdownStub(_props: Record<string, unknown> & StubBaseProps) {
  return <StubPlaceholder type="markdown" />;
}

export function ListStub(_props: Record<string, unknown> & StubBaseProps) {
  return <StubPlaceholder type="list" />;
}

export function TableStub(_props: Record<string, unknown> & StubBaseProps) {
  return <StubPlaceholder type="table" />;
}

export function FormStub(_props: Record<string, unknown> & StubBaseProps) {
  return <StubPlaceholder type="form" />;
}

export function ChartStub(_props: Record<string, unknown> & StubBaseProps) {
  return <StubPlaceholder type="chart" />;
}

export function StatStub(_props: Record<string, unknown> & StubBaseProps) {
  return <StubPlaceholder type="stat" />;
}

export function ToggleStub(_props: Record<string, unknown> & StubBaseProps) {
  return <StubPlaceholder type="toggle" />;
}

export function SliderStub(_props: Record<string, unknown> & StubBaseProps) {
  return <StubPlaceholder type="slider" />;
}

export function TimerStub(_props: Record<string, unknown> & StubBaseProps) {
  return <StubPlaceholder type="timer" />;
}

export function TabsStub(_props: Record<string, unknown> & StubBaseProps) {
  return <StubPlaceholder type="tabs" />;
}

export function ChatThreadStub(_props: Record<string, unknown> & StubBaseProps) {
  return <StubPlaceholder type="chat_thread" />;
}
