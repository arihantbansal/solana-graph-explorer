import { useState, useMemo, useCallback, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddressLabelPicker } from "@/components/AddressLabelPicker";
import { useSettings } from "@/contexts/SettingsContext";
import { extractPdaDefinitions, buildSeedBuffers } from "@/engine/pdaDeriver";
import { getProgramDerivedAddress, address } from "@solana/kit";
import type {
  SeedInputValue,
  BufferEncoding,
  SavedPdaSearch,
  SavedSeedValue,
  CustomSeedType,
} from "@/types/pdaExplorer";
import {
  CUSTOM_SEED_TYPES,
  BUFFER_ENCODING_OPTIONS,
  makeEmptyCustomSeed,
  customSeedToIdlSeed,
} from "@/types/pdaExplorer";
import type { IdlSeed } from "@/types/idl";
import {
  Loader2,
  Search,
  Star,
  Trash2,
  FlaskConical,
  ChevronRight,
  Plus,
} from "lucide-react";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useClearAndExplore } from "@/hooks/useClearAndExplore";
import { shortenAddress } from "@/utils/format";

// ─── Main Component: Dropdown + Dialog ───────────────────────────

export function PdaSearch() {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { savedPdaSearches } = useSettings();

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <FlaskConical className="size-3.5 mr-1" />
            PDA Search
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 max-h-[70vh] overflow-y-auto p-0" align="end">
          {savedPdaSearches.length > 0 ? (
            <div className="divide-y">
              {savedPdaSearches.map((fav) => (
                <FavoriteSearchCard
                  key={fav.id}
                  favorite={fav}
                  onClose={() => setPopoverOpen(false)}
                />
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No saved PDA searches yet.
            </div>
          )}
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs justify-between"
              onClick={() => {
                setPopoverOpen(false);
                setDialogOpen(true);
              }}
            >
              Search other PDA...
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <PdaSearchDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}

// ─── Favorite Card: compact form with only fillable fields ───────

const favoriteFieldSchema = z.record(z.string(), z.string());

type FavoriteFieldForm = z.infer<typeof favoriteFieldSchema>;

function FavoriteSearchCard({
  favorite,
  onClose,
}: {
  favorite: SavedPdaSearch;
  onClose: () => void;
}) {
  const { removePdaSearch, addressLabels } = useSettings();
  const clearAndExplore = useClearAndExplore();

  // Build field states for non-const seeds that aren't pre-filled
  const fillableSeeds = useMemo(() => {
    return favorite.seeds
      .map((seed, i) => {
        if (seed.kind === "const") return null;
        const pre = favorite.prefilledValues.find((p) => p.seedIndex === i);
        // If pre-filled with a non-empty value, skip (it's already set)
        if (pre && pre.value) return null;
        return { seed, index: i, pre };
      })
      .filter(Boolean) as { seed: IdlSeed; index: number; pre?: SavedSeedValue }[];
  }, [favorite]);

  const defaultFieldValues = useMemo(() => {
    const defaults: Record<string, string> = {};
    for (const { index } of fillableSeeds) {
      defaults[String(index)] = "";
    }
    return defaults;
  }, [fillableSeeds]);

  const form = useForm<FavoriteFieldForm>({
    defaultValues: defaultFieldValues,
  });

  const asyncAction = useAsyncAction<string>();

  const handleDeriveAndExplore = useCallback(async () => {
    const fieldValues = form.getValues();

    // Build full seed inputs
    const inputs: SeedInputValue[] = [];
    for (let i = 0; i < favorite.seeds.length; i++) {
      const seed = favorite.seeds[i];
      if (seed.kind === "const") {
        inputs.push({ seed, value: "" });
        continue;
      }
      const pre = favorite.prefilledValues.find((p) => p.seedIndex === i);
      const userValue = fieldValues[String(i)];
      const value = userValue ?? pre?.value ?? "";
      if (!value.trim()) {
        asyncAction.setError(`"${seed.path}" is required`);
        return;
      }
      inputs.push({
        seed,
        value,
        bufferEncoding: pre?.encoding ?? (seed.kind === "account" ? "base58" : "utf8"),
        transform: pre?.transform,
      });
    }

    const result = await asyncAction.run(async () => {
      const seedBuffers = await buildSeedBuffers(inputs);
      const programAddr = address(favorite.programId);
      const [pda] = await getProgramDerivedAddress({
        programAddress: programAddr,
        seeds: seedBuffers,
      });
      return pda as string;
    });

    if (!result) return;

    clearAndExplore(result);
    onClose();
  }, [favorite, form, clearAndExplore, onClose, asyncAction]);

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium truncate">{favorite.name}</div>
          <div className="text-[10px] text-muted-foreground truncate">
            {favorite.programName}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-5 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => removePdaSearch(favorite.id)}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {fillableSeeds.map(({ seed, index }) => (
        <div key={index} className="space-y-1">
          <label className="text-[10px] text-muted-foreground">
            {seed.path}
          </label>
          {seed.kind === "account" && (
            <AddressLabelPicker
              value={form.watch(String(index)) || ""}
              onSelect={(addr) => form.setValue(String(index), addr)}
              addressLabels={addressLabels}
              className="h-7 text-[10px]"
            />
          )}
          <Input
            placeholder={seed.kind === "account" ? "Public key..." : "Value..."}
            value={form.watch(String(index)) ?? ""}
            onChange={(e) => form.setValue(String(index), e.target.value)}
            className="font-mono text-xs h-7"
          />
        </div>
      ))}

      {fillableSeeds.length === 0 && (
        <div className="text-[10px] text-muted-foreground italic">
          All seeds pre-filled
        </div>
      )}

      {asyncAction.error && (
        <div className="text-[10px] text-destructive">{asyncAction.error}</div>
      )}

      <Button
        size="sm"
        className="w-full h-7 text-xs"
        onClick={handleDeriveAndExplore}
        disabled={asyncAction.isLoading}
      >
        {asyncAction.isLoading ? (
          <Loader2 className="size-3 animate-spin mr-1" />
        ) : (
          <Search className="size-3 mr-1" />
        )}
        Derive & Explore
      </Button>
    </div>
  );
}

// ─── Full PDA Search Dialog (resets on close) ────────────────────

const CUSTOM_PDA_VALUE = "__custom_pda__";

const seedFieldSchema = z.object({
  value: z.string(),
  encoding: z.enum(["utf8", "hex", "base58", "base64"]),
  transform: z.enum(["sha256"]).optional(),
  isConst: z.boolean(),
  isAccount: z.boolean(),
});

const customSeedSchema = z.object({
  label: z.string(),
  type: z.enum(["string", "pubkey", "u8", "u16", "u32", "u64", "i8", "i16", "i32", "i64", "bytes"]),
  value: z.string(),
  encoding: z.enum(["utf8", "hex", "base58", "base64"]),
  transform: z.enum(["sha256"]).optional(),
});

const dialogFormSchema = z.object({
  selectedProgramId: z.string(),
  selectedPdaIndex: z.string(),
  customProgramId: z.string(),
  favoriteName: z.string(),
  seedFields: z.array(seedFieldSchema),
  customSeeds: z.array(customSeedSchema),
});

type DialogForm = z.infer<typeof dialogFormSchema>;

function PdaSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    savedPrograms,
    savedPdaSearches,
    addPdaSearch,
    removePdaSearch,
    addressLabels,
  } = useSettings();
  const clearAndExplore = useClearAndExplore();

  const form = useForm<DialogForm>({
    resolver: zodResolver(dialogFormSchema),
    defaultValues: {
      selectedProgramId: "",
      selectedPdaIndex: "",
      customProgramId: "",
      favoriteName: "",
      seedFields: [],
      customSeeds: [],
    },
  });

  const { fields: seedFieldItems, replace: replaceSeedFields, update: updateSeedFieldItem } = useFieldArray({
    control: form.control,
    name: "seedFields",
  });

  const { fields: customSeedItems, replace: replaceCustomSeeds, append: appendCustomSeed, remove: removeCustomSeedItem, update: updateCustomSeedItem } = useFieldArray({
    control: form.control,
    name: "customSeeds",
  });

  const deriveAction = useAsyncAction<string>();

  const [loadedSeeds, setLoadedSeeds] = useState<IdlSeed[]>([]);

  const selectedProgramId = form.watch("selectedProgramId");
  const selectedPdaIndex = form.watch("selectedPdaIndex");
  const seedFields = form.watch("seedFields");
  const customSeeds = form.watch("customSeeds");
  const customProgramId = form.watch("customProgramId");
  const favoriteName = form.watch("favoriteName");

  const isCustomPda = selectedPdaIndex === CUSTOM_PDA_VALUE;

  // Reset all state when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset();
      setLoadedSeeds([]);
      deriveAction.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const isFavoriteSelected = selectedPdaIndex.startsWith("fav:");
  const selectedFavorite = isFavoriteSelected
    ? savedPdaSearches.find((s) => s.id === selectedPdaIndex.slice(4))
    : null;

  const selectedPda =
    selectedPdaIndex !== "" && !isFavoriteSelected
      ? pdaDefinitions[Number(selectedPdaIndex)] ?? null
      : null;

  const currentSeeds: IdlSeed[] = isCustomPda
    ? customSeeds.map(customSeedToIdlSeed)
    : selectedPda
      ? selectedPda.seeds
      : selectedFavorite
        ? selectedFavorite.seeds
        : loadedSeeds;

  const matchingFavorites = useMemo(
    () =>
      selectedProgramId
        ? savedPdaSearches.filter((s) => s.programId === selectedProgramId)
        : [],
    [savedPdaSearches, selectedProgramId],
  );

  const initSeedFields = useCallback(
    (seeds: IdlSeed[], prefilled?: SavedSeedValue[]) => {
      setLoadedSeeds(seeds);
      replaceSeedFields(
        seeds.map((seed, i) => {
          const pre = prefilled?.find((p) => p.seedIndex === i);
          if (seed.kind === "const") {
            return {
              value: "",
              encoding: "utf8" as BufferEncoding,
              isConst: true,
              isAccount: false,
            };
          }
          return {
            value: pre?.value ?? "",
            encoding:
              pre?.encoding ??
              (seed.kind === "account" ? "base58" : "utf8"),
            transform: pre?.transform,
            isConst: false,
            isAccount: seed.kind === "account",
          };
        }),
      );
    },
    [replaceSeedFields],
  );

  const handleProgramSelect = useCallback((programId: string) => {
    form.setValue("selectedProgramId", programId);
    form.setValue("selectedPdaIndex", "");
    replaceSeedFields([]);
    setLoadedSeeds([]);
    deriveAction.reset();
  }, [form, replaceSeedFields, deriveAction]);

  const handlePdaSelect = useCallback(
    (indexStr: string) => {
      form.setValue("selectedPdaIndex", indexStr);
      deriveAction.reset();

      if (indexStr === CUSTOM_PDA_VALUE) {
        replaceCustomSeeds([makeEmptyCustomSeed()]);
        replaceSeedFields([]);
        form.setValue("favoriteName", "custom PDA");
        return;
      }

      replaceCustomSeeds([]);

      if (indexStr.startsWith("fav:")) {
        const fav = savedPdaSearches.find(
          (s) => s.id === indexStr.slice(4),
        );
        if (fav) {
          form.setValue("favoriteName", fav.name);
          initSeedFields(fav.seeds, fav.prefilledValues);
        }
        return;
      }

      const pda = pdaDefinitions[Number(indexStr)];
      if (pda) {
        form.setValue("favoriteName", pda.name);
        initSeedFields(pda.seeds);
      }
    },
    [form, pdaDefinitions, savedPdaSearches, initSeedFields, replaceSeedFields, replaceCustomSeeds, deriveAction],
  );

  const updateSeedField = useCallback(
    (index: number, update: Partial<DialogForm["seedFields"][number]>) => {
      const current = seedFields[index];
      if (!current) return;
      updateSeedFieldItem(index, { ...current, ...update });
      deriveAction.reset();
    },
    [seedFields, updateSeedFieldItem, deriveAction],
  );

  const effectiveProgramId = selectedFavorite
    ? selectedFavorite.programId
    : (selectedPda?.programId ?? selectedProgramId) || customProgramId;

  const derivedAddress = deriveAction.result;

  const handleDerive = useCallback(async () => {
    if (!effectiveProgramId) {
      deriveAction.setError("Enter a program ID");
      return;
    }

    if (isCustomPda) {
      if (customSeeds.length === 0) {
        deriveAction.setError("Add at least one seed");
        return;
      }
      for (const cs of customSeeds) {
        if (!cs.value.trim()) {
          deriveAction.setError(`Seed "${cs.label || "unnamed"}" needs a value`);
          return;
        }
      }

      await deriveAction.run(async () => {
        const inputs: SeedInputValue[] = customSeeds.map((cs) => ({
          seed: customSeedToIdlSeed(cs),
          value: cs.value,
          bufferEncoding: cs.type === "pubkey" ? "base58" : cs.encoding,
          transform: cs.transform,
        }));
        const seedBuffers = await buildSeedBuffers(inputs);
        const programAddr = address(effectiveProgramId);
        const [pda] = await getProgramDerivedAddress({
          programAddress: programAddr,
          seeds: seedBuffers,
        });
        return pda as string;
      });
      return;
    }

    if (currentSeeds.length === 0) {
      deriveAction.setError("Select a PDA first");
      return;
    }

    const inputs: SeedInputValue[] = [];
    for (let i = 0; i < currentSeeds.length; i++) {
      const seed = currentSeeds[i];
      const field = seedFields[i];
      if (!field) {
        deriveAction.setError("Missing seed value");
        return;
      }
      if (seed.kind === "const") {
        inputs.push({ seed, value: "", transform: field.transform });
      } else if (!field.value.trim()) {
        deriveAction.setError(`Seed "${seed.path}" is required`);
        return;
      } else {
        inputs.push({
          seed,
          value: field.value,
          bufferEncoding: field.encoding,
          transform: field.transform,
        });
      }
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
  }, [effectiveProgramId, currentSeeds, seedFields, isCustomPda, customSeeds, deriveAction]);

  const handleExplore = useCallback(async () => {
    if (!derivedAddress) return;
    clearAndExplore(derivedAddress);
    onOpenChange(false);
  }, [derivedAddress, clearAndExplore, onOpenChange]);

  const handleSaveFavorite = useCallback(() => {
    const name = favoriteName.trim();
    if (!name || (!isCustomPda && currentSeeds.length === 0) || (isCustomPda && customSeeds.length === 0)) return;

    const programName =
      selectedProgram?.programName ??
      selectedFavorite?.programName ??
      effectiveProgramId;

    const seeds = isCustomPda ? customSeeds.map(customSeedToIdlSeed) : currentSeeds;

    const prefilledValues: SavedSeedValue[] = isCustomPda
      ? customSeeds.map((cs, i) => ({
          seedIndex: i,
          value: cs.value,
          encoding: cs.type === "pubkey" ? "base58" as BufferEncoding : cs.encoding,
          transform: cs.transform,
        }))
      : seedFields
          .map((field, i) => ({
            seedIndex: i,
            value: field.isConst ? "" : field.value,
            encoding: field.encoding,
            transform: field.transform,
          }))
          .filter((v) => !seedFields[v.seedIndex].isConst);

    const search: SavedPdaSearch = {
      id: `pda-search-${effectiveProgramId}-${name.replace(/\s+/g, "-")}`,
      name,
      programId: effectiveProgramId,
      programName,
      pdaName: selectedPda?.name ?? selectedFavorite?.pdaName ?? name,
      seeds,
      prefilledValues,
    };

    addPdaSearch(search);
  }, [
    favoriteName,
    currentSeeds,
    seedFields,
    customSeeds,
    isCustomPda,
    effectiveProgramId,
    selectedProgram,
    selectedPda,
    selectedFavorite,
    addPdaSearch,
  ]);

  const favoriteId = favoriteName.trim()
    ? `pda-search-${effectiveProgramId}-${favoriteName.trim().replace(/\s+/g, "-")}`
    : "";
  const isFavoriteSaved = favoriteId !== "" && savedPdaSearches.some((s) => s.id === favoriteId);

  const handleToggleFavorite = useCallback(() => {
    if (isFavoriteSaved) {
      removePdaSearch(favoriteId);
    } else {
      handleSaveFavorite();
    }
  }, [isFavoriteSaved, favoriteId, removePdaSearch, handleSaveFavorite]);

  const showSeedForm = isCustomPda || currentSeeds.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Search by PDA</DialogTitle>
          <DialogDescription>
            Derive a PDA address from a program and explore it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Program picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Program
            </label>
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
                      {shortenAddress(p.programId, 8)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* PDA picker */}
          {selectedProgramId && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                PDA
              </label>
              <Select
                value={selectedPdaIndex}
                onValueChange={handlePdaSelect}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Select a PDA..." />
                </SelectTrigger>
                <SelectContent>
                  {matchingFavorites.map((fav) => (
                    <SelectItem key={fav.id} value={`fav:${fav.id}`}>
                      <span className="text-xs">{fav.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">
                        (saved)
                      </span>
                    </SelectItem>
                  ))}
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

          {/* Custom PDA: optional program override */}
          {isCustomPda && !selectedProgramId && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Program ID
              </label>
              <Input
                placeholder="Enter program ID (base58)..."
                value={customProgramId}
                onChange={(e) => form.setValue("customProgramId", e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          )}

          {/* Custom seed builder */}
          {isCustomPda && (
            <div className="space-y-3">
              <label className="text-xs font-medium text-muted-foreground">
                Seeds
              </label>
              {customSeedItems.map((csField, i) => {
                const cs = customSeeds[i];
                if (!cs) return null;
                return (
                  <div key={csField.id} className="space-y-1.5 border rounded p-2 relative">
                    {customSeedItems.length > 1 && (
                      <button
                        onClick={() => {
                          removeCustomSeedItem(i);
                          deriveAction.reset();
                        }}
                        className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">Seed {i + 1}</span>
                      <Select
                        value={cs.type}
                        onValueChange={(v) => {
                          updateCustomSeedItem(i, {
                            ...cs,
                            type: v as CustomSeedType,
                            encoding: v === "pubkey" ? "base58" : "utf8",
                          });
                          deriveAction.reset();
                        }}
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
                    <Input
                      placeholder="Label (e.g. mint, authority)..."
                      value={cs.label}
                      onChange={(e) => {
                        updateCustomSeedItem(i, { ...cs, label: e.target.value });
                      }}
                      className="text-xs"
                    />
                    <div className="flex gap-2">
                      {cs.type === "pubkey" && (
                        <AddressLabelPicker
                          value={cs.value}
                          onSelect={(addr) => {
                            updateCustomSeedItem(i, { ...cs, value: addr });
                            deriveAction.reset();
                          }}
                          addressLabels={addressLabels}
                          className="w-auto min-w-[140px]"
                        />
                      )}
                      <Input
                        placeholder={cs.type === "pubkey" ? "Public key (base58)..." : "Value..."}
                        value={cs.value}
                        onChange={(e) => {
                          updateCustomSeedItem(i, { ...cs, value: e.target.value });
                          deriveAction.reset();
                        }}
                        className="font-mono text-xs flex-1"
                      />
                      {cs.type === "bytes" && (
                        <Select
                          value={cs.encoding}
                          onValueChange={(v) => {
                            updateCustomSeedItem(i, { ...cs, encoding: v as BufferEncoding });
                            deriveAction.reset();
                          }}
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
                    <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={cs.transform === "sha256"}
                        onChange={(e) => {
                          updateCustomSeedItem(i, {
                            ...cs,
                            transform: e.target.checked ? "sha256" : undefined,
                          });
                          deriveAction.reset();
                        }}
                        className="rounded"
                      />
                      SHA-256 hash before use as seed
                    </label>
                  </div>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  appendCustomSeed(makeEmptyCustomSeed());
                  deriveAction.reset();
                }}
                className="w-full text-xs"
              >
                <Plus className="size-3 mr-1" />
                Add Seed
              </Button>
            </div>
          )}

          {/* Seed form (IDL-defined seeds — not shown for custom PDA) */}
          {showSeedForm && !isCustomPda && (
            <div className="space-y-3">
              {currentSeeds.map((seed, i) => {
                const field = seedFields[i];
                if (!field) return null;

                if (field.isConst) {
                  const display = Array.isArray(seed.value)
                    ? new TextDecoder().decode(new Uint8Array(seed.value))
                    : String(seed.value ?? seed.path);
                  return (
                    <div key={i} className="space-y-1">
                      <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1"
                        >
                          const
                        </Badge>
                        {display}
                      </label>
                      <Input
                        value={display}
                        disabled
                        className="font-mono text-xs bg-muted"
                      />
                    </div>
                  );
                }

                return (
                  <div key={i} className="space-y-1">
                    <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1"
                      >
                        {seed.kind}
                      </Badge>
                      {seed.path}
                    </label>
                    {field.isAccount && (
                      <AddressLabelPicker
                        value={field.value}
                        onSelect={(addr) => updateSeedField(i, { value: addr })}
                        addressLabels={addressLabels}
                        placeholder="Pick a saved address..."
                      />
                    )}
                    <div className="flex gap-2">
                      <Input
                        placeholder={
                          field.isAccount
                            ? "Public key (base58)..."
                            : "Value..."
                        }
                        value={field.value}
                        onChange={(e) =>
                          updateSeedField(i, { value: e.target.value })
                        }
                        className="font-mono text-xs flex-1"
                      />
                      {!field.isAccount && (
                        <Select
                          value={field.encoding}
                          onValueChange={(v) =>
                            updateSeedField(i, {
                              encoding: v as BufferEncoding,
                            })
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
                    <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={field.transform === "sha256"}
                        onChange={(e) =>
                          updateSeedField(i, {
                            transform: e.target.checked
                              ? "sha256"
                              : undefined,
                          })
                        }
                        className="rounded"
                      />
                      SHA-256 hash before use as seed
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          {/* Actions */}
          {showSeedForm && (
            <>
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
                  Derive
                </Button>
                <Button
                  onClick={handleExplore}
                  disabled={!derivedAddress}
                  size="sm"
                  className="flex-1"
                >
                  <Search className="size-3.5 mr-1" />
                  Explore
                </Button>
              </div>

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

              {/* Save as favorite */}
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-muted-foreground">
                    Save as favorite
                  </label>
                  <Input
                    value={favoriteName}
                    onChange={(e) => form.setValue("favoriteName", e.target.value)}
                    placeholder='e.g. "Key to Asset by entity_key"'
                    className="text-xs"
                  />
                </div>
                <Button
                  size="sm"
                  variant={isFavoriteSaved ? "default" : "secondary"}
                  onClick={handleToggleFavorite}
                  disabled={!favoriteName.trim()}
                  title={isFavoriteSaved ? "Remove from favorites" : "Save as favorite"}
                >
                  <Star className={`size-3.5 ${isFavoriteSaved ? "fill-current" : ""}`} />
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Seeds you leave empty will be prompted each time. Pre-filled
                values are saved.
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
