import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SeedInput } from "./SeedInput";
import { useGraph } from "@/contexts/GraphContext";
import { useSettings } from "@/contexts/SettingsContext";
import { extractPdaDefinitions, buildSeedBuffers } from "@/engine/pdaDeriver";
import { expandAccount } from "@/engine/expandAccount";
import {
  getProgramDerivedAddress,
  address,
} from "@solana/kit";
import type { ProgramEntry, PdaDefinition, SeedInputValue } from "@/types/pdaExplorer";
import { Loader2, Search } from "lucide-react";
import { makeIdlFetchedHandler } from "@/utils/programSaver";

interface PdaExplorerProps {
  program: ProgramEntry;
}

export function PdaExplorer({ program }: PdaExplorerProps) {
  const { state, dispatch } = useGraph();
  const { rpcEndpoint, saveProgram } = useSettings();

  const pdaDefinitions = useMemo(
    () => (program.idl ? extractPdaDefinitions(program.idl, program.programId) : []),
    [program],
  );

  const [selectedPdaIndex, setSelectedPdaIndex] = useState<string>("");
  const [seedValues, setSeedValues] = useState<SeedInputValue[]>([]);
  const [derivedAddress, setDerivedAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPda: PdaDefinition | null =
    selectedPdaIndex !== "" ? pdaDefinitions[Number(selectedPdaIndex)] ?? null : null;

  const handlePdaSelect = useCallback(
    (indexStr: string) => {
      setSelectedPdaIndex(indexStr);
      setDerivedAddress(null);
      setError(null);
      const pda = pdaDefinitions[Number(indexStr)];
      if (pda) {
        setSeedValues(
          pda.seeds.map((seed) => ({
            seed,
            value: "",
            bufferEncoding: seed.kind === "arg" ? "utf8" : undefined,
          })),
        );
      }
    },
    [pdaDefinitions],
  );

  const handleSeedChange = useCallback(
    (index: number, value: SeedInputValue) => {
      setSeedValues((prev) => {
        const next = [...prev];
        next[index] = value;
        return next;
      });
    },
    [],
  );

  const handleDerive = useCallback(async () => {
    if (!selectedPda) return;

    setIsLoading(true);
    setError(null);
    setDerivedAddress(null);

    try {
      const seedBuffers = await buildSeedBuffers(seedValues);
      const programAddr = address(selectedPda.programId);

      const [pda] = await getProgramDerivedAddress({
        programAddress: programAddr,
        seeds: seedBuffers,
      });

      const derived = pda as string;
      setDerivedAddress(derived);

      // Add to graph and expand
      const position = { x: 400, y: 300 };
      const existingIds = new Set(state.nodes.map((n) => n.id));

      dispatch({
        type: "ADD_NODES",
        nodes: [
          {
            id: derived,
            type: "account",
            position,
            data: { address: derived, isExpanded: false, isLoading: true },
          },
        ],
      });
      dispatch({ type: "SELECT_NODE", nodeId: derived });

      existingIds.add(derived);
      await expandAccount({
        address: derived,
        sourcePosition: position,
        rpcUrl: rpcEndpoint,
        existingNodeIds: existingIds,
        dispatch,
        options: {
          onIdlFetched: makeIdlFetchedHandler(saveProgram),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to derive PDA");
    } finally {
      setIsLoading(false);
    }
  }, [selectedPda, seedValues, state.nodes, dispatch, rpcEndpoint, saveProgram]);

  if (!program.idl) {
    return (
      <div className="text-xs text-muted-foreground p-2">
        Loading IDL...
      </div>
    );
  }

  if (pdaDefinitions.length === 0) {
    return (
      <div className="text-xs text-muted-foreground p-2">
        No PDA definitions found in this IDL.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Select value={selectedPdaIndex} onValueChange={handlePdaSelect}>
        <SelectTrigger size="sm">
          <SelectValue placeholder="Select a PDA..." />
        </SelectTrigger>
        <SelectContent>
          {pdaDefinitions.map((pda, i) => (
            <SelectItem key={i} value={String(i)}>
              <span className="font-mono text-xs">{pda.name}</span>
              <span className="text-[10px] text-muted-foreground ml-2">
                ({pda.seeds.length} seeds)
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedPda && (
        <>
          <div className="flex flex-wrap gap-1">
            {selectedPda.instructionNames.map((name) => (
              <Badge key={name} variant="secondary" className="text-[9px]">
                {name}
              </Badge>
            ))}
          </div>

          <div className="space-y-2">
            {seedValues.map((sv, i) => (
              <SeedInput
                key={i}
                seed={sv.seed}
                value={sv}
                onChange={(v) => handleSeedChange(i, v)}
              />
            ))}
          </div>

          <Button
            onClick={handleDerive}
            disabled={isLoading}
            size="sm"
            className="w-full"
          >
            {isLoading ? (
              <Loader2 className="size-3.5 animate-spin mr-1" />
            ) : (
              <Search className="size-3.5 mr-1" />
            )}
            Derive & Fetch
          </Button>

          {derivedAddress && (
            <div className="text-xs bg-muted p-2 rounded font-mono break-all">
              {derivedAddress}
            </div>
          )}

          {error && (
            <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
