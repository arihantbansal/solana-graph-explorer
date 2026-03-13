import type { BalanceChange, TokenBalanceChange } from "@/types/transaction";
import { lamportsToSol, shortenAddress } from "@/utils/format";
import { CopyButton } from "@/components/CopyButton";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";

interface BalanceChangesProps {
  balanceChanges: BalanceChange[];
  tokenBalanceChanges: TokenBalanceChange[];
}

function DeltaDisplay({ delta, unit }: { delta: number | bigint; unit?: string }) {
  const isPositive = typeof delta === "bigint" ? delta > 0n : delta > 0;
  const formatted = unit === "SOL" ? lamportsToSol(delta) : typeof delta === "bigint" ? delta.toString() : delta.toFixed(6);
  return (
    <span
      className={cn(
        "font-mono text-xs",
        isPositive ? "text-green-500" : "text-red-500",
      )}
    >
      {isPositive ? "+" : ""}
      {formatted}
      {unit ? ` ${unit}` : ""}
    </span>
  );
}

export function BalanceChanges({
  balanceChanges,
  tokenBalanceChanges,
}: BalanceChangesProps) {
  const { getLabel } = useSettings();
  const hasSOL = balanceChanges.length > 0;
  const hasToken = tokenBalanceChanges.length > 0;

  if (!hasSOL && !hasToken) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        No balance changes.
      </div>
    );
  }

  return (
    <div className="px-3 pb-3 space-y-3">
      {/* SOL balance changes */}
      {hasSOL && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1.5">
            SOL Balance Changes
          </h3>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-2 py-1 font-medium text-muted-foreground">
                    Address
                  </th>
                  <th className="text-right px-2 py-1 font-medium text-muted-foreground">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody>
                {balanceChanges.map((change) => (
                  <tr key={change.address} className="border-t">
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <span className="font-mono" title={change.address}>
                          {getLabel(change.address) ?? shortenAddress(change.address)}
                        </span>
                        <CopyButton value={change.address} iconSize="size-2.5" />
                      </div>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <DeltaDisplay delta={change.delta} unit="SOL" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Token balance changes */}
      {hasToken && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1.5">
            Token Balance Changes
          </h3>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-2 py-1 font-medium text-muted-foreground">
                    Address
                  </th>
                  <th className="text-left px-2 py-1 font-medium text-muted-foreground">
                    Mint
                  </th>
                  <th className="text-right px-2 py-1 font-medium text-muted-foreground">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody>
                {tokenBalanceChanges.map((change, i) => (
                  <tr key={`${change.address}-${change.mint}-${i}`} className="border-t">
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <span className="font-mono" title={change.address}>
                          {getLabel(change.address) ?? shortenAddress(change.address)}
                        </span>
                        <CopyButton value={change.address} iconSize="size-2.5" />
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <span className="font-mono" title={change.mint}>
                          {getLabel(change.mint) ?? shortenAddress(change.mint)}
                        </span>
                        <CopyButton value={change.mint} iconSize="size-2.5" />
                      </div>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <DeltaDisplay delta={change.delta} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
