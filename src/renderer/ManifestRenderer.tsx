import { useEffect, useMemo, useState } from "react";
import type { Manifest } from "@/schema/manifest.v1";
import type { ManifestV2, ManifestV2Action } from "@/schema/manifest.v2";
import { migrateV1toV2, needsMigration } from "@/schema/migrator";
import { getRegistryEntry, type RegistryRenderContext } from "@/registry";
import { runAction } from "@/actions/actionRunner";
import { useAppStore } from "@/lib/zustandStore";

interface ManifestRendererProps {
  manifest: Manifest | ManifestV2;
  appData?: Record<string, unknown>;
  appId?: string;
  onDataChange?: (key: string, value: unknown) => void;
  isPreview?: boolean; // In builder preview — some native actions are mocked
}

/**
 * Registry-driven renderer for v1 and v2 app manifests.
 * Normalizes v1 manifests via migrateV1toV2 and delegates all node rendering
 * to COMPONENT_REGISTRY entries.
 */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(36);
}

export function ManifestRenderer({
  manifest,
  appData = {},
  appId,
  onDataChange,
  isPreview = false,
}: ManifestRendererProps) {
  const v2Manifest = useMemo<ManifestV2>(
    () =>
      needsMigration(manifest)
        ? migrateV1toV2(manifest as Manifest)
        : (manifest as ManifestV2),
    [manifest]
  );

  const defaultScreenId = v2Manifest.screens[0]?.id ?? "main";
  const [activeScreenId, setActiveScreenId] = useState<string>(defaultScreenId);

  const hasActiveScreen = v2Manifest.screens.some((s) => s.id === activeScreenId);
  const resolvedScreenId = hasActiveScreen ? activeScreenId : defaultScreenId;

  useEffect(() => {
    if (!hasActiveScreen) {
      setActiveScreenId(defaultScreenId);
    }
  }, [hasActiveScreen, defaultScreenId]);

  const componentLoadingMap = useAppStore((s) => s.componentLoadingMap);
  const setComponentLoading = useAppStore((s) => s.setComponentLoading);

  const activeScreen =
    v2Manifest.screens.find((s) => s.id === resolvedScreenId) ??
    v2Manifest.screens[0];

  const availableScreenIds = v2Manifest.screens.map((s) => s.id);
  const permissions = v2Manifest.permissions ?? [];
  const actions = v2Manifest.actions ?? [];

  const getAction = (id: string): ManifestV2Action | undefined =>
    actions.find((a) => a.id === id);

  return (
    <div className="space-y-3 p-4 animate-fade-in">
      {/* App header */}
      {v2Manifest.name && (
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/10">
          <span className="text-3xl">{v2Manifest.icon}</span>
          <div>
            <h2 className="text-white font-semibold text-base">{v2Manifest.name}</h2>
            {permissions.length > 0 && (
              <p className="text-white/40 text-xs mt-0.5">
                Uses: {permissions.join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Multi-screen switcher */}
      {v2Manifest.screens.length > 1 && (
        <nav aria-label="App screens" className="flex flex-wrap gap-1.5 pb-2 border-b border-white/10">
          {v2Manifest.screens.map((screen) => {
            const isActive = screen.id === resolvedScreenId;
            return (
              <button
                key={screen.id}
                type="button"
                onClick={() => setActiveScreenId(screen.id)}
                aria-current={isActive ? "page" : undefined}
                className={`px-3 py-1.5 text-[10px] uppercase tracking-wider rounded-sm border transition-colors ${
                  isActive
                    ? "bg-white text-n-bg border-white font-bold"
                    : "bg-n-surface text-n-text2 border-n-border hover:border-n-border2 hover:text-white"
                }`}
              >
                {screen.title}
              </button>
            );
          })}
        </nav>
      )}

      {/* Registry-driven node list */}
      {(activeScreen?.nodes ?? []).map((node) => {
        const entry = getRegistryEntry(node.type);
        if (!entry) {
          return (
            <div key={node.id} className="glass rounded-xl p-3 text-white/40 text-xs">
              Unknown component type: {node.type}
            </div>
          );
        }

        const onClickActionId = node.on_click;
        const onAction = onClickActionId
          ? async (extraAppData?: Record<string, unknown>) => {
              const action = getAction(onClickActionId);
              if (!action) return;
              const isAsyncNetwork =
                action.kind === "mcp_call" ||
                action.kind === "llm_call" ||
                action.kind === "api_fetch";
              if (isAsyncNetwork) {
                setComponentLoading(node.id, true);
              }
              try {
                await runAction({
                  action,
                  appData: extraAppData ? { ...appData, ...extraAppData } : appData,
                  appId,
                  onDataChange,
                  isPreview,
                  availableScreenIds,
                  onNavigateScreen: setActiveScreenId,
                });
              } finally {
                if (isAsyncNetwork) {
                  setComponentLoading(node.id, false);
                }
              }
            }
          : undefined;

        const ctx: RegistryRenderContext = {
          nodeId: node.id,
          bindValue: node.bind ? appData[node.bind] : appData[node.id],
          appData,
          appId,
          isPreview,
          isLoading: Boolean(componentLoadingMap[node.id]),
          onClickActionId: node.on_click,
          onDataChange,
          onAction,
          onNavigateScreen: setActiveScreenId,
        };

        const EntryComponent = entry.component;

        return (
          <EntryComponent
            key={`${node.id}:${djb2Hash(JSON.stringify(node.props ?? {}))}`}
            {...((node.props ?? {}) as Record<string, unknown>)}
            id={node.id}
            bindValue={ctx.bindValue}
            onAction={ctx.onAction ? () => ctx.onAction?.() : undefined}
            ctx={ctx}
          />
        );
      })}
    </div>
  );
}
