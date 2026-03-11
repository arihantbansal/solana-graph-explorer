import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { IdlSeed } from "@/types/idl";
import type { BufferEncoding, SeedInputValue } from "@/types/pdaExplorer";

interface SeedInputProps {
  seed: IdlSeed;
  value: SeedInputValue;
  onChange: (value: SeedInputValue) => void;
}

const ENCODING_OPTIONS: { value: BufferEncoding; label: string }[] = [
  { value: "utf8", label: "UTF-8" },
  { value: "hex", label: "Hex" },
  { value: "base58", label: "Base58" },
  { value: "base64", label: "Base64" },
];

function seedLabel(seed: IdlSeed): string {
  if (seed.kind === "const") {
    const val = Array.isArray(seed.value)
      ? new TextDecoder().decode(new Uint8Array(seed.value))
      : String(seed.value);
    return `"${val}"`;
  }
  if (seed.kind === "account") return seed.path;
  if (seed.kind === "arg") return seed.path;
  return "unknown";
}

export function SeedInput({ seed, value, onChange }: SeedInputProps) {
  if (seed.kind === "const") {
    const display = Array.isArray(seed.value)
      ? new TextDecoder().decode(new Uint8Array(seed.value))
      : String(seed.value);
    return (
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Badge variant="outline" className="text-[9px] px-1">const</Badge>
          {seedLabel(seed)}
        </label>
        <Input
          value={display}
          disabled
          className="font-mono text-xs bg-muted"
        />
      </div>
    );
  }

  if (seed.kind === "account") {
    return (
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Badge variant="outline" className="text-[9px] px-1">account</Badge>
          {seed.path}
        </label>
        <Input
          placeholder="Base58 address..."
          value={value.value}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
          className="font-mono text-xs"
        />
      </div>
    );
  }

  // arg seed — show input + encoding selector
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Badge variant="outline" className="text-[9px] px-1">arg</Badge>
        {seed.path}
      </label>
      <div className="flex gap-2">
        <Input
          placeholder="Value..."
          value={value.value}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
          className="font-mono text-xs flex-1"
        />
        <Select
          value={value.bufferEncoding ?? "utf8"}
          onValueChange={(v) =>
            onChange({ ...value, bufferEncoding: v as BufferEncoding })
          }
        >
          <SelectTrigger className="w-24" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENCODING_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
