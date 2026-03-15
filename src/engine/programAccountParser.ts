import { getAddressDecoder } from "@solana/kit";
import { fetchAccount, type FetchedAccount } from "@/solana/fetchAccount";
import { fetchAccountUncached } from "@/solana/fetchAccountUncached";
import { decodeAccountData } from "./accountDecoder";
import { squadsV4Idl } from "@/solana/builtinIdls";

export const BPF_LOADER_UPGRADEABLE = "BPFLoaderUpgradeab1e11111111111111111111111";

export const SQUADS_V3 = "SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu";
export const SQUADS_V4 = "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";

const SECURITY_TXT_MAGIC = "=======BEGIN SECURITY.TXT V1=======\0";
const SECURITY_TXT_END = "=======END SECURITY.TXT V1=======";

export interface ProgramInfo {
  programdataAddress: string;
  lastDeployedSlot: number;
  authority: string | null;
  isUpgradeable: boolean;
  securityTxt?: Record<string, string>;
  squadsInfo?: SquadsInfo;
}

export interface SecurityTxt {
  [key: string]: string | undefined;
}

export interface SquadsInfo {
  version: "v3" | "v4";
  multisigAddress: string;
  multisigData?: Record<string, unknown>;
}

/**
 * Parse a BPF Upgradeable Loader Program account (discriminator byte 0 = 2).
 * Returns the programdata address, or null if data is invalid.
 */
export function parseProgramAccount(data: Uint8Array): string | null {
  if (data.length < 36) return null;
  // u32 LE discriminator — only first byte matters for value 2
  if (data[0] !== 2) return null;

  const addressDecoder = getAddressDecoder();
  const programdataAddress = addressDecoder.decode(data.slice(4, 36));
  return programdataAddress as string;
}

/**
 * Parse a BPF Upgradeable Loader ProgramData account (discriminator byte 0 = 3).
 * Returns slot and authority, or null if data is invalid.
 */
export function parseProgramDataAccount(data: Uint8Array): { slot: number; authority: string | null } | null {
  if (data.length < 45) return null;
  if (data[0] !== 3) return null;

  // u64 LE slot at bytes 4..12
  const slotView = new DataView(data.buffer, data.byteOffset + 4, 8);
  const slot = Number(slotView.getBigUint64(0, true));

  // Option tag at byte 12
  const hasAuthority = data[12] === 1;
  let authority: string | null = null;
  if (hasAuthority) {
    const addressDecoder = getAddressDecoder();
    authority = addressDecoder.decode(data.slice(13, 45)) as string;
  }

  return { slot, authority };
}

/**
 * Parse security.txt from the ELF binary portion of a ProgramData account.
 * The magic bytes mark the start, key-value pairs are null-terminated strings.
 */
export function parseSecurityTxt(elfData: Uint8Array): SecurityTxt | null {
  // Search for magic bytes
  const magicBytes = new TextEncoder().encode(SECURITY_TXT_MAGIC);
  const endBytes = new TextEncoder().encode(SECURITY_TXT_END);

  let magicIndex = -1;
  outer:
  for (let i = 0; i <= elfData.length - magicBytes.length; i++) {
    for (let j = 0; j < magicBytes.length; j++) {
      if (elfData[i + j] !== magicBytes[j]) continue outer;
    }
    magicIndex = i;
    break;
  }

  if (magicIndex === -1) return null;

  const start = magicIndex + magicBytes.length;

  // Find end marker
  let endIndex = elfData.length;
  outer2:
  for (let i = start; i <= elfData.length - endBytes.length; i++) {
    for (let j = 0; j < endBytes.length; j++) {
      if (elfData[i + j] !== endBytes[j]) continue outer2;
    }
    endIndex = i;
    break;
  }

  // Parse key\0value\0 pairs from the content between magic and end
  const content = elfData.slice(start, endIndex);
  const decoder = new TextDecoder();
  const result: SecurityTxt = {};

  // Split by null bytes to get alternating key/value strings
  const parts: string[] = [];
  let partStart = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === 0) {
      parts.push(decoder.decode(content.slice(partStart, i)));
      partStart = i + 1;
    }
  }
  // If there's trailing content without a null terminator
  if (partStart < content.length) {
    parts.push(decoder.decode(content.slice(partStart)));
  }

  // Pair up as key/value
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const key = parts[i].trim();
    const value = parts[i + 1].trim();
    if (key) {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

// Squads V4 Multisig discriminator: sha256("account:Multisig")[0..8]
const SQUADS_V4_MULTISIG_DISC = [224, 116, 121, 186, 68, 161, 79, 236];

/**
 * Squads reverse-lookup API (same one Solana Explorer uses).
 * Given an address, returns whether it's associated with a Squads multisig
 * and the multisig account address.
 */
const SQUADS_MAP_URL = "https://4fnetmviidiqkjzenwxe66vgoa0soerr.lambda-url.us-east-1.on.aws/isSquadV2";

interface SquadsMapResponse {
  isSquad: boolean;
  version?: "v3" | "v4";
  multisig?: string;
}

async function lookupSquadsMap(addr: string): Promise<SquadsMapResponse | null> {
  try {
    const resp = await fetch(`${SQUADS_MAP_URL}/${addr}`);
    if (!resp.ok) return null;
    const data = await resp.json() as SquadsMapResponse;
    if ("error" in data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Try to decode a Squads V4 Multisig account.
 */
function tryDecodeSquadsMultisig(data: Uint8Array): Record<string, unknown> | null {
  if (data.length < 8) return null;
  for (let i = 0; i < 8; i++) {
    if (data[i] !== SQUADS_V4_MULTISIG_DISC[i]) return null;
  }
  try {
    const typeDef = squadsV4Idl.types!.find((t) => t.name === "Multisig")!;
    return decodeAccountData(data, typeDef, squadsV4Idl);
  } catch {
    return null;
  }
}

/**
 * Detect if an address is associated with a Squads multisig.
 * Uses the Squads reverse-lookup API (same as Solana Explorer),
 * then fetches and decodes the on-chain multisig account.
 */
export async function detectSquadsMultisig(
  addr: string,
  rpcUrl: string,
): Promise<SquadsInfo | null> {
  try {
    // First check if the account itself is directly owned by Squads
    const account = await fetchAccount(addr, rpcUrl);
    if (account) {
      if (account.owner === SQUADS_V3) {
        return { version: "v3", multisigAddress: addr };
      }
      if (account.owner === SQUADS_V4) {
        const multisigData = tryDecodeSquadsMultisig(account.data);
        return { version: "v4", multisigAddress: addr, multisigData: multisigData ?? undefined };
      }
    }

    // Use Squads reverse-lookup API to find the multisig account
    const mapResult = await lookupSquadsMap(addr);
    if (!mapResult?.isSquad || !mapResult.multisig) return null;

    const version = mapResult.version ?? "v4";
    const multisigAddress = mapResult.multisig;

    // Fetch and decode the multisig account on-chain
    let multisigData: Record<string, unknown> | undefined;
    if (version === "v4") {
      const multisigAccount = await fetchAccount(multisigAddress, rpcUrl);
      if (multisigAccount) {
        multisigData = tryDecodeSquadsMultisig(multisigAccount.data) ?? undefined;
      }
    }

    return { version, multisigAddress, multisigData };
  } catch {
    return null;
  }
}

/**
 * Check if a System Program-owned account has an associated Squads multisig.
 * Uses the Squads reverse-lookup API then fetches on-chain data.
 */
export async function detectSquadsForSystemAccount(
  accountAddress: string,
  rpcUrl: string,
): Promise<SquadsInfo | null> {
  return detectSquadsMultisig(accountAddress, rpcUrl);
}

/**
 * Full pipeline: given a program's FetchedAccount, fetch its programdata,
 * parse authority/slot, check for security.txt and Squads multisig.
 */
export async function fetchProgramInfo(
  programAccount: FetchedAccount,
  rpcUrl: string,
): Promise<ProgramInfo | null> {
  const programdataAddress = parseProgramAccount(programAccount.data);
  if (!programdataAddress) return null;

  // Fetch the full ProgramData account (uncached — can be very large)
  const programData = await fetchAccountUncached(programdataAddress, rpcUrl);
  if (!programData) return null;

  const parsed = parseProgramDataAccount(programData.data);
  if (!parsed) return null;

  // Parse security.txt from ELF portion (bytes after header at offset 45)
  let securityTxt: Record<string, string> | undefined;
  if (programData.data.length > 45) {
    const elfData = programData.data.slice(45);
    const sec = parseSecurityTxt(elfData);
    if (sec) {
      // Filter out undefined values for the Record<string, string> type
      const filtered: Record<string, string> = {};
      for (const [k, v] of Object.entries(sec)) {
        if (v !== undefined) filtered[k] = v;
      }
      if (Object.keys(filtered).length > 0) securityTxt = filtered;
    }
  }

  // Detect Squads multisig if there's an authority
  let squadsInfo: SquadsInfo | undefined;
  if (parsed.authority) {
    const squads = await detectSquadsMultisig(parsed.authority, rpcUrl);
    if (squads) squadsInfo = squads;
  }

  return {
    programdataAddress,
    lastDeployedSlot: parsed.slot,
    authority: parsed.authority,
    isUpgradeable: parsed.authority !== null,
    securityTxt,
    squadsInfo,
  };
}
