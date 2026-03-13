import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  className?: string;
  iconSize?: string;
}

export function CopyButton({ value, className, iconSize = "size-3" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "shrink-0",
        copied ? "text-green-500" : "text-muted-foreground hover:text-foreground",
        className,
      )}
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? <Check className={iconSize} /> : <Copy className={iconSize} />}
    </button>
  );
}
