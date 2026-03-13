import { useRef, useCallback, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { GraphProvider } from "@/contexts/GraphContext";
import { SettingsProvider, useSettings } from "@/contexts/SettingsContext";
import { SearchBar, DepthControl, RpcSelector } from "@/components/SearchBar";
import { GraphCanvas } from "@/components/GraphCanvas";
import { NodeDetailPanel } from "@/components/NodeDetailPanel";
import { RelationshipEditor } from "@/components/RelationshipEditor";
import { ProgramBrowser } from "@/components/ProgramBrowser";
import { PdaSearch } from "@/components/PdaSearch";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRelationshipRules } from "@/hooks/useRelationshipRules";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Download, Upload, Menu } from "lucide-react";

function RelationshipRuleEngine() {
  useRelationshipRules();
  return null;
}

function SettingsIO() {
  const { exportSettings, importSettings } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(() => {
    const json = exportSettings();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "solana-graph-explorer-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [exportSettings]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          importSettings(reader.result as string);
        } catch {
          alert("Invalid settings file");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [importSettings],
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button variant="ghost" size="icon" className="size-7" onClick={handleExport} title="Export settings">
        <Download className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="size-7" onClick={handleImport} title="Import settings">
        <Upload className="size-3.5" />
      </Button>
    </>
  );
}

function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const isSm = useMediaQuery("(max-width: 767px)");

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="flex items-center gap-2 shrink-0">
        <SearchBar />
        <div className="flex items-center gap-2 pr-3">
          {/* PdaSearch: visible at md+, hidden on sm */}
          <div className="hidden md:flex">
            <PdaSearch />
          </div>
          {/* ProgramBrowser, RelationshipEditor, SettingsIO: visible at lg+ */}
          <div className="hidden lg:flex items-center gap-2">
            <ProgramBrowser />
            <RelationshipEditor />
            <SettingsIO />
          </div>
          {/* Hamburger button: visible below lg */}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 lg:hidden"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
        </div>
      </header>
      <div className="flex-1 flex min-h-0">
        <main className="flex-1 relative min-w-0">
          <GraphCanvas />
        </main>
        <NodeDetailPanel />
      </div>
      <RelationshipRuleEngine />

      {/* Hamburger slide-in menu */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-72 sm:max-w-xs overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-4">
            {/* PdaSearch: only in menu on sm screens */}
            {isSm && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">PDA Search</h4>
                <PdaSearch />
              </div>
            )}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Depth</h4>
              <DepthControl />
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">RPC Endpoint</h4>
              <RpcSelector />
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Programs</h4>
              <ProgramBrowser />
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Relationships</h4>
              <RelationshipEditor />
            </div>
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Settings</h4>
              <div className="flex items-center gap-2">
                <SettingsIO />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function App() {
  return (
    <SettingsProvider>
      <GraphProvider>
        <ReactFlowProvider>
          <AppLayout />
        </ReactFlowProvider>
      </GraphProvider>
    </SettingsProvider>
  );
}

export default App;
