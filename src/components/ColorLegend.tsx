import { useMemo, useState } from "react";
import { Panel } from "@xyflow/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useGraph } from "@/contexts/GraphContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { hashToHue } from "@/utils/colorHash";

/**
 * Floating legend panel on the graph canvas showing program colors.
 * Each unique program ID that appears in the current graph gets a color swatch
 * and its human-readable name (or shortened address).
 */
export function ColorLegend() {
  const { state } = useGraph();
  const { getLabel } = useSettings();
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const [collapsed, setCollapsed] = useState(isMobile);

  const programs = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of state.nodes) {
      const pid = node.data.programId;
      if (!pid) continue;
      if (map.has(pid)) continue;
      // Use programName from any node, or the address label, or a shortened address
      const name =
        node.data.programName ??
        getLabel(pid) ??
        `${pid.slice(0, 4)}...${pid.slice(-4)}`;
      map.set(pid, name);
    }
    return Array.from(map.entries());
  }, [state.nodes, getLabel]);

  if (programs.length === 0) return null;

  return (
    <Panel position="top-left" className="!m-2">
      <div className="bg-background/90 backdrop-blur-sm border rounded-lg shadow-md text-xs max-w-[220px]">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center justify-between w-full px-2.5 py-1.5 text-muted-foreground hover:text-foreground"
        >
          <span className="font-medium">Legend</span>
          {collapsed ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronUp className="size-3.5" />
          )}
        </button>
        {!collapsed && (
          <div className="px-2.5 pb-2 space-y-1">
            {programs.map(([pid, name]) => {
              const hue = hashToHue(pid);
              return (
                <div key={pid} className="flex items-center gap-2">
                  <span
                    className="shrink-0 w-3 h-3 rounded-sm"
                    style={{ backgroundColor: `hsl(${hue}, 70%, 50%)` }}
                  />
                  <span className="truncate text-muted-foreground" title={pid}>
                    {name}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}
