import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
import { useSettings } from "@/contexts/SettingsContext";
import { fetchIdl } from "@/solana/fetchIdl";
import { setIdl } from "@/solana/idlCache";
import { PdaExplorer } from "./PdaExplorer";
import type { ProgramEntry } from "@/types/pdaExplorer";
import {
  Database,
  RefreshCw,
  Trash2,
  ChevronRight,
  ChevronDown,
  Loader2,
} from "lucide-react";

export function ProgramBrowser() {
  const { savedPrograms, removeProgram, refreshProgram, rpcEndpoint } =
    useSettings();
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const handleRefresh = useCallback(
    async (programId: string) => {
      setRefreshingId(programId);
      try {
        const idl = await fetchIdl(programId, rpcEndpoint);
        if (idl) {
          setIdl(programId, idl);
          const entry: ProgramEntry = {
            programId,
            programName: idl.metadata?.name ?? programId,
            idlFetchedAt: Date.now(),
            idl,
          };
          refreshProgram(programId, entry);
        }
      } catch {
        // refresh failed silently
      } finally {
        setRefreshingId(null);
      }
    },
    [rpcEndpoint, refreshProgram],
  );

  const handleToggle = useCallback(
    (programId: string) => {
      setExpandedProgramId((prev) => (prev === programId ? null : programId));
    },
    [],
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Database className="size-3.5 mr-1" />
          Programs
          {savedPrograms.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-[9px] px-1">
              {savedPrograms.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-sm">Saved Programs</SheetTitle>
          <SheetDescription className="text-xs">
            Programs with IDLs discovered during exploration. Select one to browse its PDAs.
          </SheetDescription>
        </SheetHeader>

        {savedPrograms.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            No programs saved yet. Explore an Anchor account to auto-discover programs.
          </div>
        ) : (
          <div className="px-4 space-y-2">
            {savedPrograms.map((program) => (
              <div key={program.programId} className="border rounded-lg">
                <div className="flex items-center gap-2 p-2">
                  <button
                    onClick={() => handleToggle(program.programId)}
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                  >
                    {expandedProgramId === program.programId ? (
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">
                        {program.programName}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {program.programId}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => handleRefresh(program.programId)}
                      disabled={refreshingId === program.programId}
                    >
                      {refreshingId === program.programId ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-destructive"
                      onClick={() => removeProgram(program.programId)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>

                {expandedProgramId === program.programId && (
                  <div className="border-t p-2">
                    <PdaExplorer program={program} />
                  </div>
                )}

                <div className="px-2 pb-1.5">
                  <span className="text-[9px] text-muted-foreground">
                    Fetched {new Date(program.idlFetchedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
