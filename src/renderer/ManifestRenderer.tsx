import type { Manifest, ManifestComponent } from "@/schema/manifest.schema";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Checklist } from "@/components/Checklist";
import { ImageGallery } from "@/components/ImageGallery";
import { ImageCapture } from "@/components/ImageCapture";
import { MicRecorder } from "@/components/MicRecorder";
import { McqQuiz } from "@/components/McqQuiz";
import { ChatBubble } from "@/components/ChatBubble";
import { ConversationLoop } from "@/components/ConversationLoop";
import { Calculator } from "@/components/Calculator";
import { Clock } from "@/components/Clock";
import { runAction } from "@/actions/actionRunner";

interface ManifestRendererProps {
  manifest: Manifest;
  appData?: Record<string, unknown>;
  appId?: string;
  onDataChange?: (key: string, value: unknown) => void;
  isPreview?: boolean; // In builder preview — some native actions are mocked
}

export function ManifestRenderer({
  manifest,
  appData = {},
  appId,
  onDataChange,
  isPreview = false,
}: ManifestRendererProps) {
  // Find action by id
  const getAction = (id: string) => manifest.actions.find((a) => a.id === id);

  const handleClick = async (component: ManifestComponent) => {
    if (!component.on_click) return;
    const action = getAction(component.on_click);
    if (!action) return;

    await runAction({
      action,
      appData,
      appId,
      onDataChange,
      isPreview,
    });
  };

  const renderComponent = (component: ManifestComponent) => {
    // Merge manifest props with live appData bound values
    const props = { ...(component.props ?? {}) };

    // Inject bound app_data value into props
    if (component.bind && appData[component.bind] !== undefined) {
      props._boundValue = appData[component.bind];
    }

    switch (component.type) {
      case "text":
        return (
          <Text
            key={component.id}
            content={
              typeof props._boundValue === "string"
                ? props._boundValue
                : (props.content as string) ?? ""
            }
          />
        );

      case "card":
        return (
          <Card
            key={component.id}
            title={(props.title as string) ?? ""}
            body={
              typeof props._boundValue === "string"
                ? props._boundValue
                : (props.body as string) ?? ""
            }
          />
        );

      case "button":
        return (
          <Button
            key={component.id}
            label={(props.label as string) ?? ""}
            onClick={() => handleClick(component)}
          />
        );

      case "checklist":
        return (
          <Checklist
            key={component.id}
            items={Array.isArray(props.items) ? (props.items as string[]) : []}
          />
        );

      case "image_gallery": {
        const images = Array.isArray(props._boundValue)
          ? (props._boundValue as string[])
          : Array.isArray(props.images)
          ? (props.images as string[])
          : [];
        return <ImageGallery key={component.id} images={images} />;
      }

      case "image_capture":
        return (
          <ImageCapture
            key={component.id}
            label={(props.label as string) ?? "Take Photo"}
            save_to={props.save_to as string | undefined}
            onCapture={(base64, key) => {
              if (key) onDataChange?.(key, base64);
              // If button is wired to an action, fire it too
              if (component.on_click) {
                const action = getAction(component.on_click);
                if (action) {
                  runAction({
                    action,
                    appData: { ...appData, [key ?? "image"]: base64 },
                    appId,
                    onDataChange,
                    isPreview,
                  });
                }
              }
            }}
          />
        );

      case "mic_recorder":
        return (
          <MicRecorder
            key={component.id}
            label={(props.label as string) ?? "Record"}
            save_to={props.save_to as string | undefined}
            onTranscript={(text, key) => {
              if (key) onDataChange?.(key, text);
            }}
          />
        );

      case "mcq_quiz":
        return (
          <McqQuiz
            key={component.id}
            questions={
              Array.isArray(props.questions)
                ? (props.questions as Array<{
                    question: string;
                    options: string[];
                    correct_index: number;
                  }>)
                : []
            }
          />
        );

      case "chat_bubble":
        return (
          <ChatBubble
            key={component.id}
            role={(props.role as "user" | "assistant") ?? "assistant"}
            content={(props.content as string) ?? ""}
          />
        );

      case "calculator":
        // Fully self-contained — no props, no actions, no network
        return <Calculator key={component.id} />;

      case "clock":
        return (
          <Clock
            key={component.id}
            timezone={props.timezone as string | undefined}
            format={(props.format as "12h" | "24h") ?? "12h"}
            label={props.label as string | undefined}
          />
        );

      case "conversation_loop":
        return (
          <ConversationLoop
            key={component.id}
            actionId={component.on_click ?? component.id}
            persona_prompt={(props.persona_prompt as string) ?? "You are a helpful assistant."}
            appId={appId}
          />
        );

      default:
        return (
          <div key={component.id} className="glass rounded-xl p-3 text-white/40 text-xs">
            Unknown component type: {(component as ManifestComponent).type}
          </div>
        );
    }
  };

  return (
    <div className="space-y-3 p-4 animate-fade-in">
      {/* App header in preview */}
      {manifest.name && (
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/10">
          <span className="text-3xl">{manifest.icon}</span>
          <div>
            <h2 className="text-white font-semibold text-base">{manifest.name}</h2>
            {manifest.permissions.length > 0 && (
              <p className="text-white/40 text-xs mt-0.5">
                Uses: {manifest.permissions.join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      {manifest.components.map(renderComponent)}
    </div>
  );
}
