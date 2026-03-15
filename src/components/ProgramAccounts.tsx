import { useState } from "react";
import { useAsyncCallback } from "react-async-hook";
import { getIdl } from "@/solana/idlCache";
import { fetchProgramAccountsByType, type ProgramAccountResult } from "@/solana/fetchProgramAccounts";
import { decodeAccountData } from "@/engine/accountDecoder";
import { CopyButton } from "@/components/CopyButton";
import { useSettings } from "@/contexts/SettingsContext";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";
import { isPubkey, shortenAddress } from "@/utils/format";
import type { Idl, IdlTypeDef } from "@/types/idl";

interface ProgramAccountsProps {
  programAddress: string;
  rpcUrl: string;
  onAccountClick: (address: string) => void;
}

interface DecodedAccount {
  pubkey: string;
  fields: Record<string, unknown> | null;
}

/** Format a field value for compact display */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) {
    if (value.length === 0) return "[]";
    if (value.length > 12) return `bytes(${value.length})`;
    return `[${Array.from(value).join(",")}]`;
  }
  if (typeof value === "object") {
    const s = JSON.stringify(value, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    if (s.length > 40) return s.slice(0, 36) + "...";
    return s;
  }
  return String(value);
}

function decodeResults(
  results: ProgramAccountResult[],
  typeDef: IdlTypeDef,
  idl: Idl,
): DecodedAccount[] {
  return results.map((r) => {
    try {
      const fields = decodeAccountData(r.data, typeDef, idl);
      return { pubkey: r.pubkey, fields };
    } catch {
      return { pubkey: r.pubkey, fields: null };
    }
  });
}

export function ProgramAccounts({
  programAddress,
  rpcUrl,
  onAccountClick,
}: ProgramAccountsProps) {
  const { getLabel } = useSettings();
  const idl = getIdl(programAddress);
  const accountTypes = idl?.accounts?.filter((a) => a.discriminator?.length === 8) ?? [];

  const [selectedType, setSelectedType] = useState<string>(accountTypes[0]?.name ?? "");

  const { loading: isLoading, error, result, execute: handleFetch } = useAsyncCallback(async () => {
    const acctDef = accountTypes.find((a) => a.name === selectedType);
    if (!acctDef || !idl) return [];
    const results = await fetchProgramAccountsByType(
      programAddress,
      acctDef.discriminator,
      rpcUrl,
    );
    const typeDef = idl.types?.find((t) => t.name === acctDef.name) ?? acctDef;
    return decodeResults(results, typeDef as IdlTypeDef, idl);
  });

  const accounts = result ?? [];
  const fetched = result !== undefined;

  if (!idl) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center">
        No IDL available for this program
      </div>
    );
  }

  if (accountTypes.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center">
        No account types defined in IDL
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Account type selector + fetch */}
      <div className="flex gap-2">
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="flex-1 text-xs rounded-md border border-input bg-background px-2 py-1.5"
        >
          {accountTypes.map((a) => (
            <option key={a.name} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          onClick={handleFetch}
          disabled={isLoading || !selectedType}
          className="shrink-0"
        >
          {isLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Search className="size-3.5" />
          )}
          <span className="ml-1">Fetch</span>
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
          {error.message}
        </div>
      )}

      {/* Results */}
      {fetched && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1.5">
            {accounts.length === 100
              ? "100 accounts (max)"
              : `${accounts.length} account${accounts.length !== 1 ? "s" : ""}`}
          </div>
          {accounts.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-2">
              No accounts found
            </div>
          ) : (
            <div className="space-y-1">
              {accounts.map((acct) => (
                <div
                  key={acct.pubkey}
                  className="rounded border border-border p-2 space-y-1"
                >
                  {/* Address row */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onAccountClick(acct.pubkey)}
                      className="font-mono text-xs text-blue-500 hover:underline cursor-pointer truncate text-left"
                      title={acct.pubkey}
                    >
                      {getLabel(acct.pubkey) ?? shortenAddress(acct.pubkey)}
                    </button>
                    <CopyButton value={acct.pubkey} iconSize="size-2.5" />
                  </div>
                  {/* Decoded fields */}
                  {acct.fields ? (
                    <div className="space-y-0">
                      {Object.entries(acct.fields).map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-baseline justify-between gap-2 text-[10px] py-px"
                        >
                          <span className="text-muted-foreground shrink-0">
                            {key}
                          </span>
                          {isPubkey(value) ? (
                            <button
                              onClick={() => onAccountClick(value as string)}
                              className="font-mono truncate text-right text-blue-500 hover:underline cursor-pointer"
                              title={value as string}
                            >
                              {getLabel(value as string) ?? shortenAddress(value as string)}
                            </button>
                          ) : (
                            <span className="font-mono truncate text-right">
                              {formatValue(value)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] text-muted-foreground italic">
                      Failed to decode
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
