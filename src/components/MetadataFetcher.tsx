import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, Download, ChevronRight } from "lucide-react";

interface MetadataFetcherProps {
  uri: string;
}

export function MetadataFetcher({ uri }: MetadataFetcherProps) {
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetadata = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await fetch(uri);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setMetadata(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch metadata");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* URI display */}
      <div className="flex items-baseline justify-between gap-3 py-1 border-b border-muted/30 text-xs">
        <span className="text-muted-foreground whitespace-nowrap">uri</span>
        <span className="font-mono text-right break-all text-blue-500">
          <a href={uri} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {uri.length > 60 ? uri.slice(0, 60) + "..." : uri}
            <ExternalLink className="size-2.5 inline ml-0.5 mb-0.5" />
          </a>
        </span>
      </div>

      {/* Fetch button or results */}
      {!metadata && !isLoading && !error && (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs"
          onClick={fetchMetadata}
        >
          <Download className="size-3 mr-1" />
          Fetch Metadata JSON
        </Button>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 mr-1.5 animate-spin" />
          Fetching metadata...
        </div>
      )}

      {error && (
        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
          {error}
          <button
            className="ml-2 underline"
            onClick={fetchMetadata}
          >
            Retry
          </button>
        </div>
      )}

      {metadata && (
        <div className="border rounded-md p-2 space-y-1 bg-muted/20">
          <div className="text-[10px] font-medium text-muted-foreground mb-1">
            Metadata JSON
          </div>
          <MetadataFields data={metadata} />
        </div>
      )}
    </div>
  );
}

function MetadataFields({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-0.5">
      {Object.entries(data).map(([key, value]) => (
        <MetadataField key={key} fieldKey={key} value={value} />
      ))}
    </div>
  );
}

function MetadataField({ fieldKey, value }: { fieldKey: string; value: unknown }) {
  // Image fields - render inline
  if (
    typeof value === "string" &&
    (fieldKey === "image" || fieldKey === "animation_url") &&
    (value.startsWith("http") || value.startsWith("ipfs"))
  ) {
    return (
      <div className="py-1 border-b border-muted/20 last:border-0">
        <div className="text-[10px] text-muted-foreground mb-1">{fieldKey}</div>
        <img
          src={value}
          alt={fieldKey}
          className="w-full max-h-32 object-cover rounded mb-1"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="text-[10px] font-mono text-blue-500 break-all">
          <a href={value} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {value.length > 50 ? value.slice(0, 50) + "..." : value}
            <ExternalLink className="size-2 inline ml-0.5" />
          </a>
        </div>
      </div>
    );
  }

  // Attributes array (NFT traits)
  if (fieldKey === "attributes" && Array.isArray(value)) {
    return (
      <div className="py-1 border-b border-muted/20 last:border-0">
        <div className="text-[10px] text-muted-foreground mb-1">attributes</div>
        <div className="flex flex-wrap gap-1">
          {value.map((attr, i) => {
            const traitType = (attr as Record<string, unknown>)?.trait_type ?? (attr as Record<string, unknown>)?.traitType;
            const traitValue = (attr as Record<string, unknown>)?.value;
            if (traitType && traitValue !== undefined) {
              return (
                <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0.5">
                  <span className="text-muted-foreground mr-1">{String(traitType)}:</span>
                  {String(traitValue)}
                </Badge>
              );
            }
            return (
              <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0.5">
                {JSON.stringify(attr)}
              </Badge>
            );
          })}
        </div>
      </div>
    );
  }

  // URL strings
  if (typeof value === "string" && value.startsWith("http")) {
    return (
      <div className="flex items-baseline justify-between gap-2 py-0.5 border-b border-muted/20 last:border-0 text-[11px]">
        <span className="text-muted-foreground whitespace-nowrap">{fieldKey}</span>
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-blue-500 hover:underline text-right break-all"
        >
          {value.length > 40 ? value.slice(0, 40) + "..." : value}
          <ExternalLink className="size-2 inline ml-0.5" />
        </a>
      </div>
    );
  }

  // Nested objects
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return (
      <div className="py-0.5 border-b border-muted/20 last:border-0">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <ChevronRight className="size-2.5" />
          {fieldKey}
        </div>
        <div className="ml-3">
          <MetadataFields data={value as Record<string, unknown>} />
        </div>
      </div>
    );
  }

  // Arrays (non-attributes)
  if (Array.isArray(value)) {
    return (
      <div className="py-0.5 border-b border-muted/20 last:border-0">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <ChevronRight className="size-2.5" />
          {fieldKey} [{value.length}]
        </div>
        <div className="ml-3 space-y-0.5">
          {value.map((item, i) => (
            <MetadataField key={i} fieldKey={String(i)} value={item} />
          ))}
        </div>
      </div>
    );
  }

  // Primitives
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 border-b border-muted/20 last:border-0 text-[11px]">
      <span className="text-muted-foreground whitespace-nowrap">{fieldKey}</span>
      <span className="font-mono text-right break-all">
        {value === null ? <span className="text-muted-foreground italic">null</span> : String(value)}
      </span>
    </div>
  );
}
