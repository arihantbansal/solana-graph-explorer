import { useState, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AccountNode as AccountNodeType } from "@/types/graph";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, ExternalLink, X, ChevronDown, ChevronUp } from "lucide-react";
import { useGraph } from "@/contexts/GraphContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useExploreAddress } from "@/hooks/useExploreAddress";
import { CopyButton } from "@/components/CopyButton";
import { BytesFieldInline } from "@/components/BytesFieldDisplay";
import { hashToHue } from "@/utils/colorHash";
import { isPubkey, lamportsToSol, shortenAddress } from "@/utils/format";

const COLLAPSED_FIELD_COUNT = 10;

const HANDLE_CLASS = "!opacity-0 !w-1 !h-1";
const HANDLE_SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const;
const HANDLE_SIDE_NAMES = ["top", "right", "bottom", "left"] as const;

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    if (value.length > 20) return value.slice(0, 8) + "..." + value.slice(-4);
    return value;
  }
  if (value instanceof Uint8Array) {
    if (value.length > 12) return `bytes(${value.length})`;
    return `[${Array.from(value).join(",")}]`;
  }
  if (typeof value === "object") {
    const s = JSON.stringify(value, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    if (s.length > 24) return s.slice(0, 20) + "...";
    return s;
  }
  return String(value);
}

export function AccountNodeComponent({ data }: NodeProps<AccountNodeType>) {
  const {
    address,
    accountType,
    programName,
    balance,
    isExpanded,
    isLoading,
    programId,
    decodedData,
    thumbnail,
    error,
  } = data;

  const { state, dispatch } = useGraph();
  const { getLabel, setAddressLabel, getBytesEncoding } = useSettings();
  const exploreAddress = useExploreAddress();
  const [showAllFields, setShowAllFields] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");

  const toggleFields = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAllFields((prev) => !prev);
  }, []);

  const startEditing = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setLabelDraft(getLabel(address) ?? "");
      setEditingLabel(true);
    },
    [address, getLabel],
  );

  const saveLabel = useCallback(() => {
    const trimmed = labelDraft.trim();
    if (trimmed) {
      setAddressLabel(address, trimmed);
    }
    setEditingLabel(false);
  }, [address, labelDraft, setAddressLabel]);

  const removeNode = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      dispatch({ type: "REMOVE_NODE", nodeId: address });
    },
    [dispatch, address],
  );

  const hue = programId ? hashToHue(programId) : 200;
  const borderColor = `hsl(${hue}, 70%, 50%)`;

  const label = getLabel(address);
  const existingNodeIds = new Set(state.nodes.map((n) => n.id));
  const fields = decodedData
    ? Object.entries(decodedData).filter(
        ([, value]) => !isPubkey(value) || !existingNodeIds.has(value),
      )
    : [];
  const visibleFields = showAllFields
    ? fields
    : fields.slice(0, COLLAPSED_FIELD_COUNT);
  const hiddenCount = fields.length - COLLAPSED_FIELD_COUNT;

  const handleFieldClick = useCallback(
    (e: React.MouseEvent, key: string, value: unknown) => {
      if (!isPubkey(value)) return;
      e.stopPropagation();
      exploreAddress(value, { sourceNodeId: address, fieldName: key });
    },
    [exploreAddress, address],
  );

  return (
    <Card
      className="relative min-w-[180px] max-w-[260px] cursor-pointer shadow-md"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      {/* Top-right action icons */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
        <a
          href={`https://explorer.solana.com/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-blue-500"
          title="View in Explorer"
        >
          <ExternalLink className="size-3" />
        </a>
        <button
          onClick={removeNode}
          className="text-muted-foreground hover:text-destructive"
          title="Remove from graph"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {HANDLE_SIDES.map((pos, i) => (
        <Handle key={`target-${HANDLE_SIDE_NAMES[i]}`} id={`target-${HANDLE_SIDE_NAMES[i]}`} type="target" position={pos} className={HANDLE_CLASS} />
      ))}
      {HANDLE_SIDES.map((pos, i) => (
        <Handle key={`source-${HANDLE_SIDE_NAMES[i]}`} id={`source-${HANDLE_SIDE_NAMES[i]}`} type="source" position={pos} className={HANDLE_CLASS} />
      ))}
      <CardContent className="p-3 space-y-1.5">
        {/* Header: label/address + edit + expand indicator */}
        <div className="flex items-center gap-1 pr-10">
          {editingLabel ? (
            <input
              className="text-xs font-medium border rounded px-1 py-0.5 w-full"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={saveLabel}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveLabel();
                if (e.key === "Escape") setEditingLabel(false);
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <>
              <span
                className="font-mono text-xs font-medium truncate"
                title={address}
              >
                {label ?? shortenAddress(address)}
              </span>
              <CopyButton
                value={address}
                className="text-muted-foreground hover:text-foreground shrink-0"
              />
              <button
                onClick={startEditing}
                className="text-muted-foreground hover:text-foreground shrink-0"
                title="Edit label"
              >
                <Pencil className="size-3" />
              </button>
            </>
          )}
          {isLoading && (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0 ml-auto" />
          )}
        </div>

        {/* Thumbnail for NFTs/assets */}
        {thumbnail && (
          <img
            src={thumbnail}
            alt=""
            className="w-full h-24 object-cover rounded"
          />
        )}

        {/* Type badge */}
        {accountType && accountType !== "Unknown" && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {accountType}
          </Badge>
        )}

        {/* Program name */}
        {programName && (
          <div className="text-[10px] text-muted-foreground truncate">
            {programName}
          </div>
        )}

        {/* Balance */}
        {balance !== undefined && (
          <div className="text-[11px] font-mono text-muted-foreground">
            {lamportsToSol(balance)} SOL
          </div>
        )}

        {/* Decoded fields */}
        {visibleFields.length > 0 && (
          <div className="border-t pt-1.5 mt-1 space-y-0.5">
            {visibleFields.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-2 text-[10px]">
                <span className="text-muted-foreground shrink-0">{key}</span>
                {isPubkey(value) ? (
                  <button
                    onClick={(e) => handleFieldClick(e, key, value)}
                    className="font-mono truncate text-right text-blue-500 hover:underline"
                    title={`Explore ${value}`}
                  >
                    {getLabel(value) ?? formatFieldValue(value)}
                  </button>
                ) : value instanceof Uint8Array ? (
                  <span className="font-mono truncate text-right">
                    <BytesFieldInline
                      bytes={value}
                      encoding={
                        accountType
                          ? getBytesEncoding(accountType, key)
                          : undefined
                      }
                    />
                  </span>
                ) : (
                  <span className="font-mono truncate text-right">
                    {formatFieldValue(value)}
                  </span>
                )}
              </div>
            ))}
            {hiddenCount > 0 && (
              <button
                onClick={toggleFields}
                className="text-[10px] text-blue-500 hover:underline w-full text-left"
              >
                {showAllFields
                  ? "Show less"
                  : `+${hiddenCount} more fields...`}
              </button>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-[10px] text-destructive truncate">{error}</div>
        )}

        {/* Expand/collapse indicator */}
        {!isLoading && decodedData && !isExpanded && (
          <div className="border-t pt-1 mt-1 flex items-center justify-center text-muted-foreground/60 text-[9px] gap-0.5">
            <ChevronDown className="size-3" />
            <span>double-click to expand</span>
          </div>
        )}
        {isExpanded && (
          <div className="border-t pt-1 mt-1 flex items-center justify-center text-muted-foreground/40 text-[9px] gap-0.5">
            <ChevronUp className="size-3" />
            <span>expanded</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
