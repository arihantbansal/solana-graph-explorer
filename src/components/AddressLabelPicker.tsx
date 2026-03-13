import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { shortenAddress } from "@/utils/format";

interface AddressLabelPickerProps {
  /** Current value (an address or "__none__") */
  value: string;
  /** Called with the selected address */
  onSelect: (address: string) => void;
  /** Map of address → label */
  addressLabels: Record<string, string>;
  /** Placeholder text for the trigger */
  placeholder?: string;
  /** Extra className for the trigger */
  className?: string;
}

/**
 * Dropdown that lets users pick from their saved/bookmarked addresses.
 * Only renders if there are labels to show.
 */
export function AddressLabelPicker({
  value,
  onSelect,
  addressLabels,
  placeholder = "Saved address...",
  className,
}: AddressLabelPickerProps) {
  const entries = Object.entries(addressLabels);
  if (entries.length === 0) return null;

  return (
    <Select
      value={value || "__none__"}
      onValueChange={(v) => {
        if (v !== "__none__") onSelect(v);
      }}
    >
      <SelectTrigger size="sm" className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">
          <span className="text-xs italic text-muted-foreground">
            Enter manually...
          </span>
        </SelectItem>
        {entries.map(([addr, lbl]) => (
          <SelectItem key={addr} value={addr}>
            <span className="text-xs">{lbl}</span>
            <span className="text-[10px] text-muted-foreground ml-1 font-mono">
              {shortenAddress(addr)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
