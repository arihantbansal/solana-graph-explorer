import { GraphProvider } from "@/contexts/GraphContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { SearchBar } from "@/components/SearchBar";
import { GraphCanvas } from "@/components/GraphCanvas";
import { NodeDetailPanel } from "@/components/NodeDetailPanel";
import { RelationshipEditor } from "@/components/RelationshipEditor";
import { ProgramBrowser } from "@/components/ProgramBrowser";

function App() {
  return (
    <SettingsProvider>
      <GraphProvider>
        <div className="h-screen w-screen flex flex-col">
          <header className="flex items-center gap-2 shrink-0">
            <SearchBar />
            <div className="flex items-center gap-2 pr-3">
              <ProgramBrowser />
              <RelationshipEditor />
            </div>
          </header>
          <main className="flex-1 relative">
            <GraphCanvas />
          </main>
          <NodeDetailPanel />
        </div>
      </GraphProvider>
    </SettingsProvider>
  );
}

export default App;
