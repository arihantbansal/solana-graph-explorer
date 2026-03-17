import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useGraph } from "@/contexts/GraphContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useExploreAddress } from "@/hooks/useExploreAddress";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useHistory } from "@/contexts/HistoryContext";
import { PdaRuleCreator } from "@/components/PdaRuleCreator";
import { BytesFieldDisplay } from "@/components/BytesFieldDisplay";
import { TransactionHistory } from "@/components/TransactionHistory";
import { TokenBalances } from "@/components/TokenBalances";
import { BalanceChangeHistory } from "@/components/BalanceChangeHistory";
import { AssetsPanel } from "@/components/AssetsPanel";
import { MetadataFetcher } from "@/components/MetadataFetcher";
import { IdlViewer } from "@/components/IdlViewer";
import { ProgramAccounts } from "@/components/ProgramAccounts";
import { hasIdl } from "@/solana/idlCache";
import { X, GitBranchPlus, ChevronsDownUp, ChevronsUpDown, EyeOff, Eye, ChevronRight, ExternalLink, Shield } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { useView } from "@/contexts/ViewContext";
import { useClearAndExplore } from "@/hooks/useClearAndExplore";
import { expandAccount } from "@/engine/expandAccount";
import type { NodeRect } from "@/utils/layout";
import { isPubkey, lamportsToSol } from "@/utils/format";
import { makeIdlFetchedHandler } from "@/utils/programSaver";

/** Recursively render decoded field values — nested objects/arrays shown inline with indentation */
function DecodedValue({
  value,
  depth = 0,
  exploreAddress,
  sourceNodeId,
  fieldName,
}: {
  value: unknown;
  depth?: number;
  exploreAddress: (address: string, meta: { sourceNodeId: string; fieldName: string; depth: number }) => void;
  sourceNodeId: string;
  fieldName: string;
}) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">null</span>;
  }

  if (isPubkey(value)) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          onClick={() => exploreAddress(value as string, { sourceNodeId, fieldName, depth: 0 })}
          className="text-blue-500 hover:underline cursor-pointer"
          title={`Explore ${value}`}
        >
          {value as string}
        </button>
        <CopyButton value={value as string} iconSize="size-2.5" />
      </span>
    );
  }

  if (typeof value === "bigint") {
    return <span>{value.toString()}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground italic">[]</span>;
    // If all items are primitives, render compact
    const allPrimitive = value.every((v) => typeof v !== "object" || v === null);
    if (allPrimitive) {
      return (
        <div className="space-y-0.5">
          {value.map((item, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="text-muted-foreground/50 text-[10px] select-none">{i}</span>
              <DecodedValue value={item} depth={depth + 1} exploreAddress={exploreAddress} sourceNodeId={sourceNodeId} fieldName={`${fieldName}[${i}]`} />
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        {value.map((item, i) => (
          <div key={i} className="border border-muted/40 rounded px-2 py-1.5">
            <div className="text-[10px] text-muted-foreground/60 mb-1">#{i}</div>
            <DecodedValue value={item} depth={depth + 1} exploreAddress={exploreAddress} sourceNodeId={sourceNodeId} fieldName={`${fieldName}[${i}]`} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-muted-foreground italic">{"{}"}</span>;
    return (
      <div className="space-y-0.5">
        {entries.map(([k, v]) => {
          const isNested = typeof v === "object" && v !== null && !(v instanceof Uint8Array);
          return (
            <div key={k} className="py-0.5">
              {isNested ? (
                <div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <ChevronRight className="size-3" />
                    <span className="text-xs">{k}</span>
                  </div>
                  <div className="ml-4 mt-0.5">
                    <DecodedValue value={v} depth={depth + 1} exploreAddress={exploreAddress} sourceNodeId={sourceNodeId} fieldName={`${fieldName}.${k}`} />
                  </div>
                </div>
              ) : (
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-muted-foreground whitespace-nowrap">{k}</span>
                  <span className="font-mono text-right break-all">
                    <DecodedValue value={v} depth={depth + 1} exploreAddress={exploreAddress} sourceNodeId={sourceNodeId} fieldName={`${fieldName}.${k}`} />
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}

const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 420;
const MAX_WIDTH = 800;

/** Cache scroll positions per address so navigating back restores position */
const scrollPositionCache = new Map<string, number>();

/** Cache active tab per address */
const activeTabCache = new Map<string, TabKey>();

type TabKey = "transactions" | "balanceChanges" | "tokens" | "assets" | "idl" | "accounts";

const BASE_TABS: { key: TabKey; label: string }[] = [
  { key: "transactions", label: "Transactions" },
  { key: "balanceChanges", label: "Balance Changes" },
  { key: "tokens", label: "Tokens" },
  { key: "assets", label: "Assets" },
];

const PROGRAM_TABS: { key: TabKey; label: string }[] = [
  { key: "transactions", label: "Transactions" },
  { key: "accounts", label: "Accounts" },
];

export function NodeDetailPanel() {
  const { state, dispatch, selectedNode, getNodeEdges, nodeIds } = useGraph();
  const { rpcEndpoint, savedPrograms, saveProgram, collapsedAddresses, getBytesEncoding, setBytesEncoding, isCollapsedAddress, addCollapsedAddress, removeCollapsedAddress, getLabel } = useSettings();
  const exploreAddress = useExploreAddress();
  const { state: viewState, openTransaction } = useView();
  const clearAndExplore = useClearAndExplore();
  const { addHistoryItem } = useHistory();
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [pdaRuleOpen, setPdaRuleOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("transactions");
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevAddressRef = useRef<string | null>(null);
  const historyTrackedRef = useRef<string | null>(null);

  const isOpen = state.selectedNodeId !== null && selectedNode !== undefined;

  // Save scroll position when switching away from a node
  const currentAddress = selectedNode?.data.address ?? null;
  if (currentAddress !== prevAddressRef.current) {
    if (prevAddressRef.current && scrollRef.current) {
      scrollPositionCache.set(prevAddressRef.current, scrollRef.current.scrollTop);
    }
    // Save active tab for old address
    if (prevAddressRef.current) {
      activeTabCache.set(prevAddressRef.current, activeTab);
    }
    prevAddressRef.current = currentAddress;
    // Restore scroll position and tab for new node after render
    if (currentAddress && scrollRef.current) {
      const saved = scrollPositionCache.get(currentAddress);
      scrollRef.current.scrollTop = saved ?? 0;
    }
    if (currentAddress) {
      setActiveTab(activeTabCache.get(currentAddress) ?? "transactions");
    }
  }

  // Also restore after initial mount/render via effect
  useEffect(() => {
    if (currentAddress && scrollRef.current) {
      const saved = scrollPositionCache.get(currentAddress);
      scrollRef.current.scrollTop = saved ?? 0;
    }
  }, [currentAddress]);

  // Track account visits in history
  useEffect(() => {
    if (!selectedNode || selectedNode.data.isLoading) return;
    const addr = selectedNode.data.address;
    if (historyTrackedRef.current === addr) return;
    historyTrackedRef.current = addr;

    addHistoryItem({
      type: "account",
      id: addr,
      accountType: selectedNode.data.accountType,
      programName: selectedNode.data.programName,
      timestamp: Date.now(),
    });
  }, [selectedNode?.data.address, selectedNode?.data.isLoading, selectedNode?.data.accountType, selectedNode?.data.programName, addHistoryItem]); // eslint-disable-line react-hooks/exhaustive-deps

  const edges = selectedNode ? getNodeEdges(selectedNode.id) : [];

  // Compute dynamic tabs — programs get Transactions + Accounts + IDL; others get base tabs
  const tabs = (() => {
    const isProgram = !!selectedNode?.data.programInfo;
    const result = isProgram ? [...PROGRAM_TABS] : [...BASE_TABS];
    if (isProgram && hasIdl(selectedNode!.data.address)) {
      result.push({ key: "idl", label: "IDL" });
    }
    return result;
  })();

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    e.preventDefault();
  }, [width]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta)));
    };
    const onMouseUp = () => {
      isDragging.current = false;
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  if (!isOpen || !selectedNode) return null;

  // Extract metadata URI from decoded data (Metaplex metadata accounts, DAS assets)
  const metadataUri = selectedNode.data.decodedData?.uri;
  const hasMetadataUri = typeof metadataUri === "string" && metadataUri.startsWith("http");

  // Filter decoded fields: hide pubkey values already on the graph, hide uri (rendered by MetadataFetcher)
  const decodedEntries = useMemo(
    () => selectedNode.data.decodedData
      ? Object.entries(selectedNode.data.decodedData).filter(
          ([key, value]) => {
            if (key === "uri" && hasMetadataUri) return false;
            return !isPubkey(value) || !nodeIds.has(value);
          },
        )
      : [],
    [selectedNode.data.decodedData, nodeIds, hasMetadataUri],
  );

  const content = (
    <>
      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 w-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-2 sticky top-0 bg-background z-10 gap-2">
          <h3 className="text-sm font-semibold truncate">Account Details</h3>
          {!isMobile && (
            <button
              onClick={() => dispatch({ type: "SELECT_NODE", nodeId: null })}
              className="rounded-sm hover:bg-muted p-0.5 shrink-0"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="px-4 pb-2">
          <div className="flex items-start gap-1">
            {viewState.mode === "transaction" ? (
              <button
                onClick={() => clearAndExplore(selectedNode.data.address)}
                className="font-mono text-xs text-blue-500 hover:underline break-all text-left cursor-pointer"
                title="Explore this account"
              >
                {selectedNode.data.address}
              </button>
            ) : (
              <button
                onClick={() => clearAndExplore(selectedNode.data.address)}
                className="font-mono text-xs text-blue-500 hover:underline break-all text-left cursor-pointer"
                title="Explore this account"
              >
                {selectedNode.data.address}
              </button>
            )}
            <CopyButton value={selectedNode.data.address} />
          </div>
        </div>

        {/* Static info section */}
        <div className="px-4 space-y-4 pb-2">
          {/* Type */}
          {selectedNode.data.accountType && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                Type
              </h4>
              <Badge variant="secondary">
                {selectedNode.data.accountType}
              </Badge>
            </div>
          )}

          {/* Thumbnail */}
          {selectedNode.data.thumbnail && (
            <div>
              <img
                src={selectedNode.data.thumbnail}
                alt=""
                className="w-full max-h-48 object-cover rounded"
              />
            </div>
          )}

          {/* Program */}
          {selectedNode.data.programName && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                Program
              </h4>
              <div className="text-sm">{selectedNode.data.programName}</div>
              {selectedNode.data.programId && (
                <div className="flex items-start gap-1">
                  <div className="font-mono text-[10px] text-muted-foreground break-all">
                    {selectedNode.data.programId}
                  </div>
                  <CopyButton value={selectedNode.data.programId} iconSize="size-2.5" />
                </div>
              )}
            </div>
          )}

          {/* Balance */}
          {selectedNode.data.balance !== undefined && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                Balance
              </h4>
              <div className="text-sm font-mono">
                {lamportsToSol(selectedNode.data.balance, 9)} SOL
              </div>
            </div>
          )}

          {/* Program Info */}
          {selectedNode.data.programInfo && (() => {
            const pi = selectedNode.data.programInfo;
            return (
              <div className="rounded-md border border-border overflow-hidden">
                {/* Status bar */}
                <div className={`px-3 py-1.5 text-xs font-medium flex items-center justify-between ${
                  pi.isUpgradeable
                    ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                    : "bg-green-500/10 text-green-700 dark:text-green-400"
                }`}>
                  <span>{pi.isUpgradeable ? "Upgradeable" : "Immutable"}</span>
                  <span className="font-mono text-[10px] opacity-70">Slot {pi.lastDeployedSlot.toLocaleString()}</span>
                </div>

                <div className="divide-y divide-border">
                  {/* Authority */}
                  <div className="px-3 py-2">
                    <div className="text-[10px] text-muted-foreground mb-0.5">
                      Upgrade Authority
                      {pi.squadsInfo && (
                        <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0 bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20">
                          Squads {pi.squadsInfo.version.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    {pi.authority ? (
                      <div className="flex items-start gap-1">
                        <button
                          onClick={() => exploreAddress(pi.authority!, { sourceNodeId: selectedNode.id, fieldName: "authority", depth: 0 })}
                          className="font-mono text-[11px] text-blue-500 hover:underline break-all text-left cursor-pointer"
                        >
                          {getLabel(pi.authority) ?? pi.authority}
                        </button>
                        <CopyButton value={pi.authority} iconSize="size-2.5" />
                      </div>
                    ) : (
                      <span className="font-mono text-[11px] text-muted-foreground">None (Immutable)</span>
                    )}
                  </div>

                  {/* Program Data */}
                  <div className="px-3 py-2">
                    <div className="text-[10px] text-muted-foreground mb-0.5">Program Data</div>
                    <div className="flex items-start gap-1">
                      <button
                        onClick={() => exploreAddress(pi.programdataAddress, { sourceNodeId: selectedNode.id, fieldName: "programdata", depth: 0 })}
                        className="font-mono text-[11px] text-blue-500 hover:underline break-all text-left cursor-pointer"
                      >
                        {getLabel(pi.programdataAddress) ?? pi.programdataAddress}
                      </button>
                      <CopyButton value={pi.programdataAddress} iconSize="size-2.5" />
                    </div>
                  </div>

                  {/* Security.txt */}
                  {pi.securityTxt && Object.keys(pi.securityTxt).length > 0 && (
                    <div className="px-3 py-2">
                      <div className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
                        <Shield className="size-3" />
                        security.txt
                      </div>
                      <div className="space-y-1">
                        {Object.entries(pi.securityTxt).filter(([, v]) => v).map(([key, value]) => (
                          <div key={key} className="flex items-baseline justify-between gap-3 text-[11px]">
                            <span className="text-muted-foreground whitespace-nowrap">{key}</span>
                            <span className="text-right break-all">
                              {value.startsWith("http://") || value.startsWith("https://") ? (
                                <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">
                                  {value.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                                  <ExternalLink className="size-2 inline shrink-0" />
                                </a>
                              ) : (
                                <span className="font-mono">{value}</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Squads Multisig Info (for system accounts associated with a multisig) */}
          {selectedNode.data.squadsInfo && (() => {
            const si = selectedNode.data.squadsInfo;
            const md = si.multisigData as Record<string, unknown> | undefined;
            const members = md?.members as Array<{ key: string; permissions: number }> | undefined;
            return (
              <div className="rounded-md border border-purple-500/20 overflow-hidden">
                <div className="px-3 py-1.5 text-xs font-medium bg-purple-500/10 text-purple-700 dark:text-purple-400 flex items-center justify-between">
                  <span>Squads {si.version.toUpperCase()} Multisig</span>
                  {md?.threshold !== undefined && members && (
                    <span className="font-mono text-[10px] opacity-80">{String(md.threshold)}/{members.length} threshold</span>
                  )}
                </div>
                <div className="divide-y divide-border">
                  {/* Multisig config account */}
                  <div className="px-3 py-2">
                    <div className="text-[10px] text-muted-foreground mb-0.5">Multisig Config</div>
                    <div className="flex items-start gap-1">
                      <button
                        onClick={() => exploreAddress(si.multisigAddress, { sourceNodeId: selectedNode.id, fieldName: "multisig", depth: 0 })}
                        className="font-mono text-[11px] text-blue-500 hover:underline break-all text-left cursor-pointer"
                      >
                        {getLabel(si.multisigAddress) ?? si.multisigAddress}
                      </button>
                      <CopyButton value={si.multisigAddress} iconSize="size-2.5" />
                    </div>
                  </div>
                  {/* Members */}
                  {members && members.length > 0 && (
                    <div className="px-3 py-2">
                      <div className="text-[10px] text-muted-foreground mb-1">Members ({members.length})</div>
                      <div className="space-y-1">
                        {members.map((m, i) => {
                          const perms: string[] = [];
                          if (m.permissions & 1) perms.push("Propose");
                          if (m.permissions & 2) perms.push("Vote");
                          if (m.permissions & 4) perms.push("Execute");
                          return (
                            <div key={i} className="flex items-start gap-1.5">
                              <button
                                onClick={() => exploreAddress(m.key, { sourceNodeId: selectedNode.id, fieldName: `member[${i}]`, depth: 0 })}
                                className="font-mono text-[10px] text-blue-500 hover:underline break-all text-left cursor-pointer shrink min-w-0"
                              >
                                {getLabel(m.key) ?? m.key}
                              </button>
                              <CopyButton value={m.key} iconSize="size-2" />
                              <span className="text-[9px] text-muted-foreground whitespace-nowrap shrink-0">
                                {perms.join(", ") || `perm:${m.permissions}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Decoded Fields */}
          {decodedEntries.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                Decoded Fields
              </h4>
              <div className="space-y-0.5">
                {decodedEntries.map(([key, value]) => {
                  if (value instanceof Uint8Array) {
                    return (
                      <div key={key} className="py-1.5 border-b border-muted/30 last:border-0">
                        <div className="text-xs text-muted-foreground mb-1">{key}</div>
                        <BytesFieldDisplay
                          bytes={value}
                          fieldName={key}
                          defaultEncoding={
                            selectedNode.data.accountType
                              ? getBytesEncoding(selectedNode.data.accountType, key)
                              : undefined
                          }
                          onEncodingChange={(enc) => {
                            if (selectedNode.data.accountType) {
                              setBytesEncoding(selectedNode.data.accountType, key, enc);
                            }
                          }}
                        />
                      </div>
                    );
                  }
                  const isNested = typeof value === "object" && value !== null;
                  if (isNested) {
                    return (
                      <div key={key} className="py-1.5 border-b border-muted/30 last:border-0">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <ChevronRight className="size-3" />
                          <span>{key}</span>
                        </div>
                        <div className="ml-4 text-xs font-mono">
                          <DecodedValue
                            value={value}
                            exploreAddress={exploreAddress}
                            sourceNodeId={selectedNode.id}
                            fieldName={key}
                          />
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={key}
                      className="flex items-baseline justify-between gap-3 py-1 border-b border-muted/30 last:border-0 text-xs"
                    >
                      <span className="text-muted-foreground whitespace-nowrap">
                        {key}
                      </span>
                      <span className="font-mono text-right break-all">
                        <DecodedValue
                          value={value}
                          exploreAddress={exploreAddress}
                          sourceNodeId={selectedNode.id}
                          fieldName={key}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Metadata URI + Fetch */}
          {hasMetadataUri && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                Off-chain Metadata
              </h4>
              <MetadataFetcher uri={metadataUri as string} />
            </div>
          )}

          {/* Connected Edges */}
          {edges.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                Relationships ({edges.length})
              </h4>
              <div className="space-y-1">
                {edges.map((edge) => (
                  <div
                    key={edge.id}
                    className="text-xs flex items-center gap-1.5 min-w-0"
                  >
                    <Badge variant="outline" className="text-[9px] px-1 shrink-0">
                      {edge.data?.relationshipType}
                    </Badge>
                    <span className="truncate" title={edge.data?.label}>
                      {edge.data?.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {selectedNode.data.error && (
            <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
              {selectedNode.data.error}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="px-4 border-b border-border sticky top-10 bg-background z-10">
          <div className="flex gap-0 -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 text-xs whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="px-4 py-3 pb-6">
          {activeTab === "transactions" && (
            <TransactionHistory
              address={selectedNode.data.address}
              rpcUrl={rpcEndpoint}
              onTransactionClick={openTransaction}
            />
          )}
          {activeTab === "balanceChanges" && (
            <BalanceChangeHistory
              address={selectedNode.data.address}
              rpcUrl={rpcEndpoint}
              onTransactionClick={openTransaction}
            />
          )}
          {activeTab === "tokens" && (
            <TokenBalances
              address={selectedNode.data.address}
              rpcUrl={rpcEndpoint}
              onTokenClick={(tokenAccount) => {
                exploreAddress(tokenAccount, { sourceNodeId: selectedNode.id, fieldName: "tokenAccount", depth: 0 });
              }}
            />
          )}
          {activeTab === "assets" && (
            <AssetsPanel
              address={selectedNode.data.address}
              rpcUrl={rpcEndpoint}
              onAssetClick={(assetId) => {
                exploreAddress(assetId, { sourceNodeId: selectedNode.id, fieldName: "asset", depth: 0 });
              }}
            />
          )}
          {activeTab === "accounts" && (
            <ProgramAccounts
              programAddress={selectedNode.data.address}
              rpcUrl={rpcEndpoint}
              onAccountClick={(addr) => {
                exploreAddress(addr, { sourceNodeId: selectedNode.id, fieldName: "programAccount", depth: 0 });
              }}
            />
          )}
          {activeTab === "idl" && (
            <IdlViewer programAddress={selectedNode.data.address} />
          )}
        </div>

        {/* Action buttons — sticky at bottom */}
        <div className="sticky bottom-0 bg-background border-t p-4 space-y-2">
          {/* Expand / Collapse children */}
          {selectedNode.data.isExpanded && edges.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => dispatch({ type: "COLLAPSE_CHILDREN", nodeId: selectedNode.id })}
            >
              <ChevronsDownUp className="size-3.5 mr-1" />
              Collapse Children
            </Button>
          ) : !selectedNode.data.isExpanded && !selectedNode.data.isLoading && selectedNode.data.decodedData ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                const existingIds = new Set(state.nodes.map((n) => n.id));
                const existingRects: NodeRect[] = state.nodes.map((n) => ({
                  x: n.position.x,
                  y: n.position.y,
                  width: n.measured?.width ?? 280,
                  height: n.measured?.height ?? 500,
                }));
                expandAccount({
                  address: selectedNode.id,
                  sourcePosition: selectedNode.position,
                  rpcUrl: rpcEndpoint,
                  existingNodeIds: existingIds,
                  dispatch,
                  options: {
                    onIdlFetched: makeIdlFetchedHandler(saveProgram),
                    collapsedAddresses: new Set(collapsedAddresses),
                  },
                  existingRects,
                });
              }}
            >
              <ChevronsUpDown className="size-3.5 mr-1" />
              Expand
            </Button>
          ) : null}

          {/* Always collapse toggle */}
          <Button
            variant={isCollapsedAddress(selectedNode.data.address) ? "secondary" : "outline"}
            size="sm"
            className="w-full"
            onClick={() => {
              const addr = selectedNode.data.address;
              if (isCollapsedAddress(addr)) {
                removeCollapsedAddress(addr);
                // Reset isExpanded so the node can be re-expanded by double-click
                if (selectedNode.data.isExpanded) {
                  dispatch({
                    type: "SET_NODE_DATA",
                    nodeId: selectedNode.id,
                    data: { isExpanded: false },
                  });
                }
              } else {
                addCollapsedAddress(addr);
                // Also collapse now if expanded
                if (selectedNode.data.isExpanded && edges.length > 0) {
                  dispatch({ type: "COLLAPSE_CHILDREN", nodeId: selectedNode.id });
                }
              }
            }}
          >
            {isCollapsedAddress(selectedNode.data.address) ? (
              <>
                <Eye className="size-3.5 mr-1" />
                Stop Always Collapsing
              </>
            ) : (
              <>
                <EyeOff className="size-3.5 mr-1" />
                Always Collapse
              </>
            )}
          </Button>

          {/* Derive PDA */}
          {selectedNode.data.decodedData && savedPrograms.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setPdaRuleOpen(true)}
            >
              <GitBranchPlus className="size-3.5 mr-1" />
              Derive PDA...
            </Button>
          )}
        </div>
      </div>

      {/* PDA Rule Creator Dialog */}
      {pdaRuleOpen && (
        <PdaRuleCreator
          open={pdaRuleOpen}
          onOpenChange={setPdaRuleOpen}
          nodeId={selectedNode.id}
          nodeData={selectedNode.data}
        />
      )}
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) dispatch({ type: "SELECT_NODE", nodeId: null }); }}>
        <SheetContent side="right" className="w-full sm:w-full p-0 overflow-y-auto" showCloseButton={true}>
          <div className="flex flex-col h-full">
            {content}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: existing resizable sidebar
  return (
    <div
      className="flex bg-background border-l shadow-lg overflow-hidden shrink-0"
      style={{ width, maxWidth: "80vw" }}
    >
      {/* Drag handle */}
      <div
        className="w-1.5 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500/50 shrink-0"
        onMouseDown={onMouseDown}
      />
      {content}
    </div>
  );
}
