import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatBytes,
  guessEncoding,
  BYTES_ENCODING_OPTIONS,
  type BytesDisplayEncoding,
} from "@/utils/bytesDisplay";

interface BytesFieldDisplayProps {
  bytes: Uint8Array;
  fieldName: string;
  /** Override the default/guessed encoding */
  defaultEncoding?: BytesDisplayEncoding;
  /** Called when the user changes the encoding */
  onEncodingChange?: (encoding: BytesDisplayEncoding) => void;
}

export function BytesFieldDisplay({
  bytes,
  fieldName: _fieldName,
  defaultEncoding,
  onEncodingChange,
}: BytesFieldDisplayProps) {
  const guessed = useMemo(() => guessEncoding(bytes), [bytes]);
  const [overrideEncoding, setOverrideEncoding] = useState<BytesDisplayEncoding | null>(null);
  const encoding = overrideEncoding ?? defaultEncoding ?? guessed;

  const formatted = useMemo(
    () => formatBytes(bytes, encoding),
    [bytes, encoding],
  );

  const handleChange = (v: string) => {
    const enc = v as BytesDisplayEncoding;
    setOverrideEncoding(enc);
    onEncodingChange?.(enc);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Select value={encoding} onValueChange={handleChange}>
          <SelectTrigger className="h-6 text-[10px] w-auto min-w-[80px] px-2" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BYTES_ENCODING_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[10px] text-muted-foreground">
          {bytes.length} bytes
        </span>
      </div>
      <div className="font-mono text-xs break-all bg-muted/50 rounded px-1.5 py-1 max-h-32 overflow-y-auto">
        {formatted}
      </div>
    </div>
  );
}

/**
 * Compact inline display for bytes in node cards.
 * Uses a pre-determined encoding, no selector.
 */
export function BytesFieldInline({
  bytes,
  encoding,
}: {
  bytes: Uint8Array;
  encoding?: BytesDisplayEncoding;
}) {
  const enc = encoding ?? guessEncoding(bytes);
  const formatted = useMemo(() => formatBytes(bytes, enc), [bytes, enc]);
  const display =
    formatted.length > 20 ? formatted.slice(0, 16) + "..." : formatted;
  return <>{display}</>;
}
