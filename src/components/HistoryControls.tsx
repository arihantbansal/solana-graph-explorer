import { BatchSizeSelect, SortOrderToggle, TimeFormatToggle } from "@/components/LoadMoreFooter";
import { toDateInputValue, fromDateInputValue } from "@/utils/format";
import { Calendar, ChevronRight } from "lucide-react";

interface HistoryControlsProps {
  dateOpen: boolean;
  setDateOpen: (open: boolean) => void;
  fromDate?: number;
  toDate?: number;
  onFromDateChange: (ts: number | undefined) => void;
  onToDateChange: (ts: number | undefined) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  absoluteTime: boolean;
  onAbsoluteTimeChange: (absolute: boolean) => void;
  isHelius?: boolean;
  sortOrder?: "asc" | "desc";
  onSortOrderChange?: (order: "asc" | "desc") => void;
  className?: string;
}

export function HistoryControls({
  dateOpen,
  setDateOpen,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  pageSize,
  onPageSizeChange,
  absoluteTime,
  onAbsoluteTimeChange,
  isHelius,
  sortOrder,
  onSortOrderChange,
  className,
}: HistoryControlsProps) {
  return (
    <>
      <div className={`flex items-center gap-3 text-[10px] text-muted-foreground${className ? ` ${className}` : ""}`}>
        <button
          className="flex items-center gap-1 hover:text-foreground"
          onClick={() => setDateOpen(!dateOpen)}
        >
          <Calendar className="size-3" />
          {fromDate || toDate ? "Date filter active" : "Date range"}
          <ChevronRight className={`size-3 transition-transform ${dateOpen ? "rotate-90" : ""}`} />
        </button>
        <span className="text-border">|</span>
        <BatchSizeSelect value={pageSize} onChange={onPageSizeChange} />
        <TimeFormatToggle absolute={absoluteTime} onChange={onAbsoluteTimeChange} />
        {isHelius && sortOrder && onSortOrderChange && (
          <SortOrderToggle sortOrder={sortOrder} onChange={onSortOrderChange} />
        )}
      </div>
      <div>
        {dateOpen && (
          <div className="flex flex-wrap gap-1.5 items-center text-xs mt-1.5">
            <label className="text-muted-foreground">From</label>
            <input
              type="datetime-local"
              className="h-6 px-1 text-[11px] rounded border border-border bg-background text-foreground w-[155px]"
              value={toDateInputValue(fromDate)}
              onChange={(e) => onFromDateChange(fromDateInputValue(e.target.value))}
            />
            <label className="text-muted-foreground">To</label>
            <input
              type="datetime-local"
              className="h-6 px-1 text-[11px] rounded border border-border bg-background text-foreground w-[155px]"
              value={toDateInputValue(toDate)}
              onChange={(e) => onToDateChange(fromDateInputValue(e.target.value))}
            />
            {(fromDate || toDate) && (
              <button
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
                onClick={() => { onFromDateChange(undefined); onToDateChange(undefined); }}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
