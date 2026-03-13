import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Form,
  FormField,
  FormItem,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
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
  Plus,
} from "lucide-react";

export function ProgramBrowser() {
  const { savedPrograms, removeProgram, refreshProgram, saveProgram, rpcEndpoint } =
    useSettings();
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const addProgramSchema = z.object({
    programId: z
      .string()
      .trim()
      .min(1, "Enter a program ID")
      .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid program ID")
      .refine(
        (id) => !savedPrograms.some((p) => p.programId === id),
        "Program already saved",
      ),
  });

  type AddProgramForm = z.infer<typeof addProgramSchema>;

  const form = useForm<AddProgramForm>({
    resolver: zodResolver(addProgramSchema),
    defaultValues: { programId: "" },
  });

  /** Fetch IDL and build a ProgramEntry. Returns null if not found. */
  const fetchProgramEntry = useCallback(
    async (programId: string): Promise<ProgramEntry | null> => {
      const idl = await fetchIdl(programId, rpcEndpoint);
      if (!idl) return null;
      setIdl(programId, idl);
      return {
        programId,
        programName: idl.metadata?.name ?? programId,
        idlFetchedAt: Date.now(),
        idl,
      };
    },
    [rpcEndpoint],
  );

  const handleRefresh = useCallback(
    async (programId: string) => {
      setRefreshingId(programId);
      try {
        const entry = await fetchProgramEntry(programId);
        if (entry) refreshProgram(programId, entry);
      } catch {
        // refresh failed silently
      } finally {
        setRefreshingId(null);
      }
    },
    [fetchProgramEntry, refreshProgram],
  );

  const onSubmit = useCallback(
    async (data: AddProgramForm) => {
      try {
        const entry = await fetchProgramEntry(data.programId);
        if (!entry) {
          form.setError("programId", { message: "No IDL found for this program" });
          return;
        }
        saveProgram(entry);
        form.reset();
      } catch {
        form.setError("programId", { message: "Failed to fetch IDL" });
      }
    },
    [fetchProgramEntry, saveProgram, form],
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

        {/* Add program by ID */}
        <div className="px-4 pb-3 space-y-1.5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name="programId"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="Program ID (base58)..."
                          {...field}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              form.handleSubmit(onSubmit)();
                            }
                          }}
                          className="font-mono text-xs flex-1"
                          disabled={form.formState.isSubmitting}
                        />
                      </FormControl>
                      <Button
                        size="sm"
                        type="submit"
                        disabled={form.formState.isSubmitting || !form.watch("programId").trim()}
                      >
                        {form.formState.isSubmitting ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Plus className="size-3.5" />
                        )}
                      </Button>
                    </div>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>

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
                    {program.idl ? (
                      <PdaExplorer program={program} />
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground p-2">
                        <Loader2 className="size-3 animate-spin" />
                        Fetching IDL...
                      </div>
                    )}
                  </div>
                )}

                <div className="px-2 pb-1.5">
                  <span className="text-[9px] text-muted-foreground">
                    {program.idlFetchedAt
                      ? `Fetched ${new Date(program.idlFetchedAt).toLocaleDateString()}`
                      : "IDL not loaded"}
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
