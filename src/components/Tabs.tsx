import { useState } from "react";

export interface TabItem {
  label: string;
  screen_id: string;
}

interface TabsProps {
  tabs?: TabItem[];
  default_tab?: string;
  activeTab?: string;
  onSelectTab?: (screenId: string) => void;
}

/**
 * Tab switcher navigation bar for multi-screen apps.
 */
export function Tabs({
  tabs = [],
  default_tab,
  activeTab,
  onSelectTab,
}: TabsProps) {
  const initial = default_tab ?? tabs[0]?.screen_id ?? "";
  const [internalActive, setInternalActive] = useState<string>(initial);
  const current = activeTab ?? internalActive;

  if (!tabs || tabs.length === 0) {
    return null;
  }

  const handleSelect = (screenId: string) => {
    setInternalActive(screenId);
    onSelectTab?.(screenId);
  };

  return (
    <nav
      aria-label="Tabs navigation"
      className="w-full flex flex-wrap gap-1.5 p-1 bg-n-surface border border-n-border rounded-sm"
    >
      {tabs.map((tab) => {
        const isActive = tab.screen_id === current;
        return (
          <button
            key={tab.screen_id}
            type="button"
            onClick={() => handleSelect(tab.screen_id)}
            aria-selected={isActive}
            role="tab"
            className={`flex-1 min-w-[70px] px-3 py-2 text-[10px] uppercase tracking-wider rounded-sm border transition-all duration-150 text-center ${
              isActive
                ? "bg-white text-n-bg border-white font-bold"
                : "bg-transparent text-n-text2 border-transparent hover:text-white hover:bg-white/5"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
