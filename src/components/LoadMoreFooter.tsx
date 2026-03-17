import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowUpDown, Clock } from "lucide-react";

interface LoadMoreFooterProps {
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function LoadMoreFooter({
  isLoading,
  hasMore,
  onLoadMore,
}: LoadMoreFooterProps) {
  return (
    <>
      {isLoading && (
        <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading...
        </div>
      )}
      {hasMore && !isLoading && (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs"
          onClick={onLoadMore}
        >
          Load More
        </Button>
      )}
    </>
  );
}

/** Tiny batch size dropdown for secondary control rows */
export function BatchSizeSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (size: number) => void;
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => onChange(Number(v))}
    >
      <SelectTrigger className="h-5 text-[10px] w-[50px] px-1.5 border-0 bg-transparent text-muted-foreground hover:text-foreground">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="10">10</SelectItem>
        <SelectItem value="20">20</SelectItem>
        <SelectItem value="50">50</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** Tiny time format toggle */
export function TimeFormatToggle({
  absolute,
  onChange,
}: {
  absolute: boolean;
  onChange: (absolute: boolean) => void;
}) {
  return (
    <button
      className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
      title={absolute ? "Show relative time" : "Show timestamps"}
      onClick={() => onChange(!absolute)}
    >
      <Clock className="size-2.5" />
      {absolute ? "Timestamp" : "Ago"}
    </button>
  );
}

/** Tiny sort order toggle for secondary control rows */
export function SortOrderToggle({
  sortOrder,
  onChange,
}: {
  sortOrder: "asc" | "desc";
  onChange: (order: "asc" | "desc") => void;
}) {
  return (
    <button
      className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
      title={sortOrder === "desc" ? "Newest first" : "Oldest first"}
      onClick={() => onChange(sortOrder === "desc" ? "asc" : "desc")}
    >
      <ArrowUpDown className="size-2.5" />
      {sortOrder === "desc" ? "Newest" : "Oldest"}
    </button>
  );
}
