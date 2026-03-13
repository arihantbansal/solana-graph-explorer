import { useMemo, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGraph } from "@/contexts/GraphContext";
import { useSettings } from "@/contexts/SettingsContext";
import { extractPdaDefinitions, buildSeedBuffers } from "@/engine/pdaDeriver";
import { expandAccount } from "@/engine/expandAccount";
import { getProgramDerivedAddress, address } from "@solana/kit";
import type { AccountNodeData, AccountEdge } from "@/types/graph";
import type { PdaDefinition, SeedInputValue, BufferEncoding, SeedTransform, CustomSeedType } from "@/types/pdaExplorer";
import { CUSTOM_SEED_TYPES, BUFFER_ENCODING_OPTIONS, customSeedToIdlSeed } from "@/types/pdaExplorer";
import type { IdlSeed } from "@/types/idl";
import type { PdaRelationshipRule, SeedMapping, SeedSource } from "@/types/relationships";
import { Loader2, Search, Bookmark, FlaskConical, Plus, Trash2 } from "lucide-react";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { isPubkey } from "@/utils/format";
import { makeIdlFetchedHandler } from "@/utils/programSaver";

interface PdaRuleCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  nodeData: AccountNodeData;
}

type SeedSourceKind = "idl_const" | "field" | "source_address" | "const";

interface SeedMappingState {
  sourceKind: SeedSourceKind;
  fieldName: string;
  constValue: string;
  constEncoding: BufferEncoding;
  /** For custom seeds: the seed type determines encoding */
  customSeedType?: CustomSeedType;
  /** For custom seeds: a user-given label */
  customLabel?: string;
  /** Optional transform to apply (e.g. SHA-256 hash) */
  transform?: SeedTransform;
}

const seedMappingSchema = z.object({
  sourceKind: z.enum(["idl_const", "field", "source_address", "const"]),
  fieldName: z.string(),
  constValue: z.string(),
  constEncoding: z.enum(["utf8", "hex", "base58", "base64"]),
  customSeedType: z.enum(["string", "pubkey", "u8", "u16", "u32", "u64", "i8", "i16", "i32", "i64", "bytes"]).optional(),
  customLabel: z.string().optional(),
  transform: z.enum(["sha256"]).optional(),
});

const formSchema = z.object({
  selectedProgramId: z.string(),
  customProgramId: z.string(),
  useCustomProgram: z.boolean(),
  selectedPdaIndex: z.string(),
  seedMappings: z.array(seedMappingSchema),
  label: z.string(),
});

type PdaRuleForm = z.infer<typeof formSchema>;

const CUSTOM_PDA_VALUE = "__custom_pda__";
const SAVED_RULE_PREFIX = "rule:";

export function PdaRuleCreator({
  open,
  onOpenChange,
  nodeId,
  nodeData,
}: PdaRuleCreatorProps) {
  const { state, dispatch } = useGraph();
  const {
    savedPrograms,
    rpcEndpoint,
    saveProgram,
    addRelationshipRule,
    relationshipRules,
    addressLabels,
  } = useSettings();

  const form = useForm<PdaRuleForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      selectedProgramId: "",
      customProgramId: "",
      useCustomProgram: false,
      selectedPdaIndex: "",
      seedMappings: [],
      label: "",
    },
  });

  const { fields: seedMappingFields, replace: replaceSeedMappings, update: updateSeedMappingField, append: appendSeedMapping, remove: removeSeedMapping } = useFieldArray({
    control: form.control,
    name: "seedMappings",
  });

  const deriveAction = useAsyncAction<string>();

  const selectedProgramId = form.watch("selectedProgramId");
  const customProgramId = form.watch("customProgramId");
  const useCustomProgram = form.watch("useCustomProgram");
  const selectedPdaIndex = form.watch("selectedPdaIndex");
  const seedMappings = form.watch("seedMappings");
  const label = form.watch("label");

  const isCustomPda = selectedPdaIndex === CUSTOM_PDA_VALUE;
  const isSelectedRule = selectedPdaIndex.startsWith(SAVED_RULE_PREFIX);

  const effectiveProgramId = useCustomProgram
    ? customProgramId.trim()
    : selectedProgramId;

  const selectedProgram = savedPrograms.find(
    (p) => p.programId === selectedProgramId,
  );

  const pdaDefinitions = useMemo(
    () =>
      selectedProgram?.idl
        ? extractPdaDefinitions(selectedProgram.idl, selectedProgram.programId)
        : [],
    [selectedProgram],
  );

  // Saved rules that target the currently selected program
  const matchingRules = useMemo(
    () =>
      effectiveProgramId
        ? relationshipRules.filter((r) => r.targetProgramId === effectiveProgramId)
        : [],
    [relationshipRules, effectiveProgramId],
  );

  const selectedPda: PdaDefinition | null =
    selectedPdaIndex !== "" && !isCustomPda && !isSelectedRule
      ? pdaDefinitions[Number(selectedPdaIndex)] ?? null
      : null;

  // Get fields from decoded data for dropdown options
  const decodedFields = useMemo(() => {
    if (!nodeData.decodedData) return [];
    return Object.entries(nodeData.decodedData).map(([key, value]) => ({
      key,
      value: String(value),
      isPubkey: isPubkey(value),
    }));
  }, [nodeData.decodedData]);

  const pubkeyFields = decodedFields.filter((f) => f.isPubkey);

  const handleProgramSelect = useCallback(
    (programId: string) => {
      form.setValue("selectedProgramId", programId);
      form.setValue("useCustomProgram", false);
      form.setValue("selectedPdaIndex", "");
      replaceSeedMappings([]);
      deriveAction.reset();
    },
    [form, replaceSeedMappings, deriveAction],
  );

  const handlePdaSelect = useCallback(
    (indexStr: string) => {
      form.setValue("selectedPdaIndex", indexStr);
      deriveAction.reset();

      if (indexStr === CUSTOM_PDA_VALUE) {
        form.setValue("label", "custom PDA");
        replaceSeedMappings([makeEmptyCustomSeed()]);
        return;
      }

      // Load from a saved rule
      if (indexStr.startsWith(SAVED_RULE_PREFIX)) {
        const ruleId = indexStr.slice(SAVED_RULE_PREFIX.length);
        const rule = matchingRules.find((r) => r.id === ruleId);
        if (rule) {
          form.setValue("label", rule.label);
          replaceSeedMappings(
            rule.seedMappings.map((m) => seedMappingToState(m)),
          );
        }
        return;
      }

      const pda = pdaDefinitions[Number(indexStr)];
      if (pda) {
        form.setValue("label", pda.name);
        replaceSeedMappings(
          pda.seeds.map((seed) => {
            if (seed.kind === "const") {
              return makeMapping("idl_const");
            }
            if (seed.kind === "account") {
              const pathParts = seed.path.split(".");
              const seedFieldName = pathParts[pathParts.length - 1];
              const matchingField = pubkeyFields.find(
                (f) => f.key.toLowerCase() === seedFieldName.toLowerCase(),
              );
              if (matchingField) {
                return makeMapping("field", matchingField.key);
              }
            }
            if (seed.kind === "arg") {
              const pathParts = seed.path.split(".");
              const seedFieldName = pathParts[pathParts.length - 1];
              const matchingField = decodedFields.find(
                (f) => f.key.toLowerCase() === seedFieldName.toLowerCase(),
              );
              if (matchingField) {
                return makeMapping("field", matchingField.key);
              }
            }
            return makeMapping("const");
          }),
        );
      }
    },
    [form, pdaDefinitions, pubkeyFields, decodedFields, matchingRules, replaceSeedMappings, deriveAction],
  );

  const updateSeedMapping = useCallback(
    (index: number, update: Partial<SeedMappingState>) => {
      const current = seedMappings[index];
      if (!current) return;
      updateSeedMappingField(index, { ...current, ...update });
      deriveAction.reset();
    },
    [seedMappings, updateSeedMappingField, deriveAction],
  );

  const addCustomSeed = useCallback(() => {
    appendSeedMapping(makeEmptyCustomSeed());
    deriveAction.reset();
  }, [appendSeedMapping, deriveAction]);

  const removeCustomSeed = useCallback((index: number) => {
    removeSeedMapping(index);
    deriveAction.reset();
  }, [removeSeedMapping, deriveAction]);

  // The selected saved rule (if any)
  const selectedRule = isSelectedRule
    ? matchingRules.find((r) => r.id === selectedPdaIndex.slice(SAVED_RULE_PREFIX.length))
    : null;

  // Build the seeds array for the current configuration
  const currentSeeds: IdlSeed[] = useMemo(() => {
    if (selectedPda) return selectedPda.seeds;
    if (selectedRule) return selectedRule.seedMappings.map((m) => m.seed);
    if (!isCustomPda) return [];
    // Build IdlSeeds for custom mode
    return seedMappings.map((m) => customMappingToIdlSeed(m));
  }, [selectedPda, selectedRule, isCustomPda, seedMappings]);

  // Build SeedInputValue[] from current mapping state
  const buildSeedInputs = useCallback((): SeedInputValue[] | null => {
    const seeds = currentSeeds;
    if (seeds.length === 0 && !isCustomPda) return null;

    const inputs: SeedInputValue[] = [];
    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i];
      const mapping = seedMappings[i];
      if (!mapping) return null;

      const transform = mapping.transform;
      switch (mapping.sourceKind) {
        case "idl_const":
          inputs.push({ seed, value: "", transform });
          break;
        case "field": {
          const val = nodeData.decodedData?.[mapping.fieldName];
          if (val === undefined || val === null) return null;
          // If the field is a Uint8Array, encode as hex
          if (val instanceof Uint8Array) {
            const hex = Array.from(val).map((b) => b.toString(16).padStart(2, "0")).join("");
            inputs.push({ seed, value: hex, bufferEncoding: "hex", transform });
          } else {
            inputs.push({ seed, value: String(val), transform });
          }
          break;
        }
        case "source_address":
          inputs.push({ seed, value: nodeData.address, transform });
          break;
        case "const":
          inputs.push({
            seed,
            value: mapping.constValue,
            bufferEncoding: mapping.constEncoding as BufferEncoding,
            transform,
          });
          break;
      }
    }
    return inputs;
  }, [currentSeeds, seedMappings, nodeData, isCustomPda]);

  const handleDerive = useCallback(async () => {
    if (!effectiveProgramId) {
      deriveAction.setError("No program ID specified");
      return;
    }
    const inputs = buildSeedInputs();
    if (!inputs) {
      deriveAction.setError("Some seed values are missing");
      return;
    }

    await deriveAction.run(async () => {
      const seedBuffers = await buildSeedBuffers(inputs);
      const programAddr = address(effectiveProgramId);
      const [pda] = await getProgramDerivedAddress({
        programAddress: programAddr,
        seeds: seedBuffers,
      });
      return pda as string;
    });
  }, [effectiveProgramId, buildSeedInputs, deriveAction]);

  const derivedAddress = deriveAction.result;

  const buildPdaRule = useCallback((): PdaRelationshipRule | null => {
    if (!nodeData.accountType || !nodeData.programId || !effectiveProgramId) return null;
    const seeds = currentSeeds;

    const mappings: SeedMapping[] = seeds.map((seed, i) => {
      const m = seedMappings[i];
      let source: SeedSource;
      const transform = m.transform;
      switch (m.sourceKind) {
        case "idl_const":
          source = { kind: "idl_const", transform };
          break;
        case "field":
          source = { kind: "field", fieldName: m.fieldName, transform };
          break;
        case "source_address":
          source = { kind: "source_address", transform };
          break;
        case "const":
          source = { kind: "const", value: m.constValue, encoding: m.constEncoding as BufferEncoding, transform };
          break;
      }
      return { seedIndex: i, seed, source };
    });

    const ruleLabel = label.trim() || selectedRule?.label || selectedPda?.name || "custom PDA";
    const pdaName = selectedPda?.name ?? selectedRule?.targetPdaName ?? "custom";

    return {
      id: `pda-${nodeData.accountType}-${effectiveProgramId}-${ruleLabel.replace(/\s+/g, "_")}`,
      label: ruleLabel,
      sourceAccountType: nodeData.accountType,
      sourceProgram: nodeData.programId,
      targetPdaName: pdaName,
      targetProgramId: effectiveProgramId,
      seedMappings: mappings,
    };
  }, [currentSeeds, seedMappings, nodeData, label, effectiveProgramId, selectedPda, selectedRule]);

  const handleAddToGraph = useCallback(async () => {
    if (!derivedAddress) return;

    const existingIds = new Set(state.nodes.map((n) => n.id));
    if (existingIds.has(derivedAddress)) {
      dispatch({ type: "SELECT_NODE", nodeId: derivedAddress });
      onOpenChange(false);
      return;
    }

    const position = { x: 400, y: 300 };
    const sourceNode = state.nodes.find((n) => n.id === nodeId);
    if (sourceNode) {
      position.x = sourceNode.position.x + 360;
      position.y = sourceNode.position.y;
    }

    dispatch({
      type: "ADD_NODES",
      nodes: [
        {
          id: derivedAddress,
          type: "account",
          position,
          data: { address: derivedAddress, isExpanded: false, isLoading: true },
        },
      ],
    });

    const rule = buildPdaRule();
    const edgeId = `pda-derive-${nodeId}-${derivedAddress}`;
    const edge: AccountEdge = {
      id: edgeId,
      source: nodeId,
      target: derivedAddress,
      data: {
        relationshipType: "user_defined",
        label: label.trim() || selectedPda?.name || "PDA",
        pdaRule: rule ?? undefined,
      },
    };
    dispatch({ type: "ADD_EDGES", edges: [edge] });
    dispatch({ type: "SELECT_NODE", nodeId: derivedAddress });

    existingIds.add(derivedAddress);
    expandAccount(derivedAddress, position, rpcEndpoint, existingIds, dispatch, {
      onIdlFetched: makeIdlFetchedHandler(saveProgram),
    });

    onOpenChange(false);
  }, [
    derivedAddress,
    state.nodes,
    dispatch,
    nodeId,
    rpcEndpoint,
    saveProgram,
    onOpenChange,
    buildPdaRule,
    label,
    selectedPda,
  ]);

  const handleSaveAsRule = useCallback(() => {
    const rule = buildPdaRule();
    if (!rule) return;
    addRelationshipRule(rule);
  }, [buildPdaRule, addRelationshipRule]);

  const existingRule = buildPdaRule();
  const isRuleSaved = existingRule
    ? relationshipRules.some((r) => r.id === existingRule.id)
    : false;

  const showSeedForm = selectedPda || isCustomPda || isSelectedRule;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Derive PDA</DialogTitle>
          <DialogDescription>
            Derive a PDA from {nodeData.accountType ?? nodeData.address} and add
            it to the graph.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Program picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Target Program
            </label>
            {!useCustomProgram ? (
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    value={selectedProgramId}
                    onValueChange={handleProgramSelect}
                  >
                    <SelectTrigger size="sm">
                      <SelectValue placeholder="Select a program..." />
                    </SelectTrigger>
                    <SelectContent>
                      {savedPrograms.map((p) => (
                        <SelectItem key={p.programId} value={p.programId}>
                          <span className="text-xs">{p.programName}</span>
                          <span className="text-[10px] text-muted-foreground ml-2 font-mono">
                            {p.programId.slice(0, 8)}...
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    form.setValue("useCustomProgram", true);
                    form.setValue("selectedProgramId", "");
                    form.setValue("selectedPdaIndex", CUSTOM_PDA_VALUE);
                    form.setValue("label", "custom PDA");
                    replaceSeedMappings([makeEmptyCustomSeed()]);
                    deriveAction.reset();
                  }}
                  className="text-xs shrink-0"
                >
                  Custom
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={customProgramId}
                  onChange={(e) => {
                    form.setValue("customProgramId", e.target.value);
                    deriveAction.reset();
                  }}
                  placeholder="Program ID (base58)..."
                  className="font-mono text-xs flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    form.setValue("useCustomProgram", false);
                    form.setValue("customProgramId", "");
                    form.setValue("selectedPdaIndex", "");
                    replaceSeedMappings([]);
                    deriveAction.reset();
                  }}
                  className="text-xs shrink-0"
                >
                  Saved
                </Button>
              </div>
            )}
          </div>

          {/* PDA picker — for saved programs with IDLs, or when there are matching saved rules */}
          {((selectedProgram && !useCustomProgram) || (useCustomProgram && matchingRules.length > 0)) && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                PDA Definition
              </label>
              <Select
                value={selectedPdaIndex}
                onValueChange={handlePdaSelect}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Select a PDA..." />
                </SelectTrigger>
                <SelectContent>
                  {matchingRules.length > 0 && (
                    <>
                      {matchingRules.map((rule) => (
                        <SelectItem key={rule.id} value={`${SAVED_RULE_PREFIX}${rule.id}`}>
                          <span className="text-xs">{rule.label}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">
                            (saved rule)
                          </span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {pdaDefinitions.map((pda, i) => (
                    <SelectItem key={i} value={String(i)}>
                      <span className="font-mono text-xs">{pda.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">
                        ({pda.seeds.length} seeds)
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_PDA_VALUE}>
                    <span className="text-xs italic">Custom PDA...</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Seed form — IDL-defined PDA */}
          {selectedPda && !isCustomPda && (
            <>
              <div className="space-y-3">
                {selectedPda.seeds.map((seed, i) => (
                  <SeedMappingField
                    key={i}
                    seed={seed}
                    index={i}
                    mapping={seedMappings[i]}
                    decodedFields={decodedFields}
                    pubkeyFields={pubkeyFields}
                    onUpdate={updateSeedMapping}
                    addressLabels={addressLabels}
                  />
                ))}
              </div>
            </>
          )}

          {/* Seed form — Saved rule PDA */}
          {selectedRule && isSelectedRule && (
            <>
              <div className="space-y-3">
                {selectedRule.seedMappings.map((m, i) => (
                  <SeedMappingField
                    key={i}
                    seed={m.seed}
                    index={i}
                    mapping={seedMappings[i]}
                    decodedFields={decodedFields}
                    pubkeyFields={pubkeyFields}
                    onUpdate={updateSeedMapping}
                    addressLabels={addressLabels}
                  />
                ))}
              </div>
            </>
          )}

          {/* Seed form — Custom PDA */}
          {isCustomPda && (
            <>
              <div className="space-y-3">
                <label className="text-xs font-medium text-muted-foreground">
                  Seeds
                </label>
                {seedMappingFields.map((field, i) => (
                  <CustomSeedField
                    key={field.id}
                    index={i}
                    mapping={seedMappings[i]}
                    decodedFields={decodedFields}
                    pubkeyFields={pubkeyFields}
                    onUpdate={updateSeedMapping}
                    onRemove={seedMappingFields.length > 1 ? removeCustomSeed : undefined}
                    addressLabels={addressLabels}
                  />
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addCustomSeed}
                  className="w-full text-xs"
                >
                  <Plus className="size-3 mr-1" />
                  Add Seed
                </Button>
              </div>
            </>
          )}

          {/* Label + actions — shown for both IDL and custom */}
          {showSeedForm && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Edge Label
                </label>
                <Input
                  value={label}
                  onChange={(e) => form.setValue("label", e.target.value)}
                  placeholder="Label for the relationship edge"
                  className="text-xs"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleDerive}
                  disabled={deriveAction.isLoading}
                  size="sm"
                  variant="outline"
                  className="flex-1"
                >
                  {deriveAction.isLoading ? (
                    <Loader2 className="size-3.5 animate-spin mr-1" />
                  ) : (
                    <FlaskConical className="size-3.5 mr-1" />
                  )}
                  Test Derive
                </Button>
                <Button
                  onClick={handleAddToGraph}
                  disabled={!derivedAddress}
                  size="sm"
                  className="flex-1"
                >
                  <Search className="size-3.5 mr-1" />
                  Add to Graph
                </Button>
              </div>

              {nodeData.accountType && nodeData.programId && (
                <Button
                  onClick={handleSaveAsRule}
                  disabled={isRuleSaved}
                  size="sm"
                  variant="secondary"
                  className="w-full"
                >
                  <Bookmark className="size-3.5 mr-1" />
                  {isRuleSaved ? "Rule Saved" : "Save as Rule"}
                </Button>
              )}

              {derivedAddress && (
                <div className="text-xs bg-muted p-2 rounded font-mono break-all">
                  {derivedAddress}
                </div>
              )}
              {deriveAction.error && (
                <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                  {deriveAction.error}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Helpers ---

function makeMapping(
  sourceKind: SeedSourceKind,
  fieldName = "",
): SeedMappingState {
  return {
    sourceKind,
    fieldName,
    constValue: "",
    constEncoding: "utf8",
  };
}

/**
 * Convert a persisted SeedMapping back to editable SeedMappingState.
 */
function seedMappingToState(m: SeedMapping): SeedMappingState {
  const base: SeedMappingState = {
    sourceKind: m.source.kind,
    fieldName: "",
    constValue: "",
    constEncoding: "utf8",
    transform: m.source.transform,
  };

  switch (m.source.kind) {
    case "idl_const":
      return { ...base, sourceKind: "idl_const" };
    case "field":
      return { ...base, sourceKind: "field", fieldName: m.source.fieldName };
    case "source_address":
      return { ...base, sourceKind: "source_address" };
    case "const":
      return {
        ...base,
        sourceKind: "const",
        constValue: m.source.value,
        constEncoding: m.source.encoding,
      };
  }
}

function makeEmptyCustomSeed(): SeedMappingState {
  return {
    sourceKind: "const",
    fieldName: "",
    constValue: "",
    constEncoding: "utf8",
    customSeedType: "string",
    customLabel: "",
  };
}

/**
 * Convert a custom seed mapping into an IdlSeed for derivation/persistence.
 * Delegates to the shared customSeedToIdlSeed.
 */
function customMappingToIdlSeed(mapping: SeedMappingState): IdlSeed {
  return customSeedToIdlSeed(mapping);
}

// --- IDL Seed Mapping Field (existing) ---

interface SeedMappingFieldProps {
  seed: IdlSeed;
  index: number;
  mapping: SeedMappingState;
  decodedFields: { key: string; value: string; isPubkey: boolean }[];
  pubkeyFields: { key: string; value: string; isPubkey: boolean }[];
  onUpdate: (index: number, update: Partial<SeedMappingState>) => void;
  addressLabels: Record<string, string>;
}

function SeedMappingField({
  seed,
  index,
  mapping,
  decodedFields,
  pubkeyFields,
  onUpdate,
  addressLabels,
}: SeedMappingFieldProps) {
  if (seed.kind === "const") {
    const display = Array.isArray(seed.value)
      ? new TextDecoder().decode(new Uint8Array(seed.value))
      : String(seed.value);
    return (
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Badge variant="outline" className="text-[9px] px-1">const</Badge>
          {display}
        </label>
        <Input value={display} disabled className="font-mono text-xs bg-muted" />
      </div>
    );
  }

  const isAccountSeed = seed.kind === "account";
  const seedLabel = seed.path;
  const availableFields = isAccountSeed ? pubkeyFields : decodedFields;

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Badge variant="outline" className="text-[9px] px-1">{seed.kind}</Badge>
        {seedLabel}
      </label>
      <SourcePicker
        index={index}
        mapping={mapping}
        availableFields={availableFields}
        onUpdate={onUpdate}
        isAccountSeed={isAccountSeed}
        addressLabels={isAccountSeed ? addressLabels : undefined}
      />
    </div>
  );
}

// --- Custom Seed Field ---

interface CustomSeedFieldProps {
  index: number;
  mapping: SeedMappingState;
  decodedFields: { key: string; value: string; isPubkey: boolean }[];
  pubkeyFields: { key: string; value: string; isPubkey: boolean }[];
  onUpdate: (index: number, update: Partial<SeedMappingState>) => void;
  onRemove?: (index: number) => void;
  addressLabels: Record<string, string>;
}

function CustomSeedField({
  index,
  mapping,
  decodedFields,
  pubkeyFields,
  onUpdate,
  onRemove,
  addressLabels,
}: CustomSeedFieldProps) {
  const seedType = mapping.customSeedType ?? "string";
  const availableFields = seedType === "pubkey" ? pubkeyFields : decodedFields;

  return (
    <div className="space-y-1.5 border rounded p-2 relative">
      {onRemove && (
        <button
          onClick={() => onRemove(index)}
          className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3" />
        </button>
      )}

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Seed {index + 1}</span>
        <Select
          value={seedType}
          onValueChange={(v) =>
            onUpdate(index, {
              customSeedType: v as CustomSeedType,
              // Reset encoding when changing type
              constEncoding: v === "pubkey" ? "base58" : "utf8",
            })
          }
        >
          <SelectTrigger className="h-6 text-[10px] w-auto min-w-[120px] px-2" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CUSTOM_SEED_TYPES.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <SourcePicker
        index={index}
        mapping={mapping}
        availableFields={availableFields}
        onUpdate={onUpdate}
        showEncodingForConst={seedType === "bytes"}
        isAccountSeed={seedType === "pubkey"}
        addressLabels={seedType === "pubkey" ? addressLabels : undefined}
      />
    </div>
  );
}

// --- Shared Source Picker ---

interface SourcePickerProps {
  index: number;
  mapping: SeedMappingState;
  availableFields: { key: string; value: string; isPubkey: boolean }[];
  onUpdate: (index: number, update: Partial<SeedMappingState>) => void;
  /** Only show encoding picker for const values when true (for "bytes" custom seeds) */
  showEncodingForConst?: boolean;
  /** When true, the seed expects a pubkey — show address input + bookmarked addresses */
  isAccountSeed?: boolean;
  /** Bookmarked address labels for pubkey seed quick-fill */
  addressLabels?: Record<string, string>;
}

function SourcePicker({
  index,
  mapping,
  availableFields,
  onUpdate,
  showEncodingForConst = true,
  isAccountSeed = false,
  addressLabels = {},
}: SourcePickerProps) {
  const sourceOptions: { value: string; label: string }[] = [];
  sourceOptions.push({
    value: "__source_address__",
    label: "This account's address",
  });
  for (const f of availableFields) {
    sourceOptions.push({
      value: `field:${f.key}`,
      label: `${f.key} = ${f.value.length > 20 ? f.value.slice(0, 20) + "..." : f.value}`,
    });
  }

  // For account seeds, add bookmarked addresses as source options
  if (isAccountSeed) {
    const labelEntries = Object.entries(addressLabels);
    if (labelEntries.length > 0) {
      for (const [addr, lbl] of labelEntries) {
        // Skip if already in available fields
        if (availableFields.some((f) => f.value === addr)) continue;
        sourceOptions.push({
          value: `bookmark:${addr}`,
          label: `${lbl} (${addr.slice(0, 4)}...${addr.slice(-4)})`,
        });
      }
    }
  }

  sourceOptions.push({
    value: "__custom__",
    label: isAccountSeed ? "Custom address..." : "Custom value",
  });

  let selectValue = "__custom__";
  if (mapping.sourceKind === "source_address") {
    selectValue = "__source_address__";
  } else if (mapping.sourceKind === "field") {
    selectValue = `field:${mapping.fieldName}`;
  } else if (mapping.sourceKind === "const" && isAccountSeed) {
    // Check if the current const value matches a bookmark
    const bookmarkMatch = Object.prototype.hasOwnProperty.call(addressLabels, mapping.constValue);
    if (bookmarkMatch) {
      selectValue = `bookmark:${mapping.constValue}`;
    }
  }

  return (
    <>
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === "__source_address__") {
            onUpdate(index, { sourceKind: "source_address", fieldName: "" });
          } else if (v === "__custom__") {
            onUpdate(index, { sourceKind: "const", fieldName: "", constValue: "" });
          } else if (v.startsWith("field:")) {
            onUpdate(index, {
              sourceKind: "field",
              fieldName: v.slice("field:".length),
            });
          } else if (v.startsWith("bookmark:")) {
            const addr = v.slice("bookmark:".length);
            onUpdate(index, {
              sourceKind: "const",
              fieldName: "",
              constValue: addr,
              constEncoding: "base58",
            });
          }
        }}
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder="Select source..." />
        </SelectTrigger>
        <SelectContent>
          {sourceOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <span className="text-xs">{opt.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {mapping.sourceKind === "const" && isAccountSeed && (
        <div className="space-y-1.5">
          {Object.keys(addressLabels).length > 0 && (
            <Select
              value={mapping.constValue || "__none__"}
              onValueChange={(v) => {
                if (v !== "__none__") {
                  onUpdate(index, { constValue: v, constEncoding: "base58" });
                }
              }}
            >
              <SelectTrigger size="sm">
                <SelectValue placeholder="Pick a saved address..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-xs text-muted-foreground italic">Enter manually below...</span>
                </SelectItem>
                {Object.entries(addressLabels).map(([addr, lbl]) => (
                  <SelectItem key={addr} value={addr}>
                    <span className="text-xs">{lbl}</span>
                    <span className="text-[10px] text-muted-foreground ml-2 font-mono">
                      {addr.slice(0, 4)}...{addr.slice(-4)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            placeholder="Public key (base58)..."
            value={mapping.constValue}
            onChange={(e) => onUpdate(index, { constValue: e.target.value })}
            className="font-mono text-xs"
          />
        </div>
      )}

      {mapping.sourceKind === "const" && !isAccountSeed && (
        <div className="flex gap-2">
          <Input
            placeholder="Value..."
            value={mapping.constValue}
            onChange={(e) => onUpdate(index, { constValue: e.target.value })}
            className="font-mono text-xs flex-1"
          />
          {showEncodingForConst && (
            <Select
              value={mapping.constEncoding}
              onValueChange={(v) =>
                onUpdate(index, { constEncoding: v as BufferEncoding })
              }
            >
              <SelectTrigger className="w-24" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUFFER_ENCODING_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* SHA-256 hash toggle — available for all non-idl_const seeds */}
      {mapping.sourceKind !== "idl_const" && (
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={mapping.transform === "sha256"}
            onChange={(e) =>
              onUpdate(index, {
                transform: e.target.checked ? "sha256" : undefined,
              })
            }
            className="rounded"
          />
          SHA-256 hash before use as seed
        </label>
      )}
    </>
  );
}
