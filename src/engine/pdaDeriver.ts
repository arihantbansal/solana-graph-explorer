import type { Idl, IdlSeed, IdlInstructionAccountDef } from "@/types/idl";
import type {
  PdaDefinition,
  SeedInputValue,
  BufferEncoding,
  SeedTransform,
} from "@/types/pdaExplorer";

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Extract all unique PDA definitions from an IDL, deduplicated by seed signature.
 */
export function extractPdaDefinitions(
  idl: Idl,
  programId: string,
): PdaDefinition[] {
  const seen = new Map<string, PdaDefinition>();

  for (const instruction of idl.instructions) {
    for (const account of instruction.accounts) {
      const acct = account as IdlInstructionAccountDef;
      if (!acct.pda) continue;

      const key = seedSignature(acct.pda.seeds);
      const existing = seen.get(key);

      if (existing) {
        if (!existing.instructionNames.includes(instruction.name)) {
          existing.instructionNames.push(instruction.name);
        }
      } else {
        const pdaProgramId =
          acct.pda.program?.kind === "const"
            ? (acct.pda.program.value as string)
            : programId;

        seen.set(key, {
          name: acct.name,
          instructionNames: [instruction.name],
          seeds: acct.pda.seeds,
          programId: pdaProgramId,
        });
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Create a stable string key for a set of seeds to deduplicate PDAs.
 */
function seedSignature(seeds: IdlSeed[]): string {
  return seeds
    .map((s) => {
      if (s.kind === "const") {
        const val = Array.isArray(s.value)
          ? s.value.join(",")
          : String(s.value);
        return `const:${val}`;
      }
      // Normalize nested paths (e.g. "lazy_distributor.rewards_mint" → "rewards_mint")
      // since the actual seed value is the same pubkey regardless of how Anchor resolves it.
      if (s.kind === "account") {
        const leaf = s.path.split(".").pop()!;
        return `account:${leaf}`;
      }
      if (s.kind === "arg") return `arg:${s.path}`;
      return "unknown";
    })
    .join("|");
}

/**
 * Encode a user-provided string value into bytes for a PDA seed.
 */
export function encodeSeedValue(
  value: string,
  encoding: BufferEncoding,
): Uint8Array {
  switch (encoding) {
    case "utf8":
      return new TextEncoder().encode(value);
    case "hex":
      return hexToBytes(value);
    case "base58":
      return base58ToBytes(value);
    case "base64":
      return base64ToBytes(value);
    default:
      throw new Error(`Unknown encoding: ${encoding}`);
  }
}

/**
 * Apply a transform (e.g. SHA-256 hash) to seed bytes.
 */
async function applyTransform(
  bytes: Uint8Array,
  transform?: SeedTransform,
): Promise<Uint8Array> {
  if (!transform) return bytes;
  if (transform === "sha256") {
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
    return new Uint8Array(hashBuffer);
  }
  return bytes;
}

/**
 * Convert a single SeedInputValue into the bytes needed for PDA derivation.
 */
export async function seedInputToBytes(input: SeedInputValue): Promise<Uint8Array> {
  const { seed, value, bufferEncoding, transform } = input;

  let bytes: Uint8Array;

  if (seed.kind === "const") {
    if (Array.isArray(seed.value)) {
      bytes = new Uint8Array(seed.value);
    } else {
      bytes = new TextEncoder().encode(seed.value);
    }
  } else if (seed.kind === "account") {
    // Account seeds are always pubkeys — decode from base58
    bytes = base58ToBytes(value);
  } else {
    // For "arg" seeds, use the provided encoding (default utf8)
    bytes = encodeSeedValue(value, bufferEncoding ?? "utf8");
  }

  return applyTransform(bytes, transform);
}

/**
 * Build the full seeds array (as Uint8Array[]) from user inputs.
 */
export async function buildSeedBuffers(inputs: SeedInputValue[]): Promise<Uint8Array[]> {
  return Promise.all(inputs.map(seedInputToBytes));
}

// --- Encoding helpers ---

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error("Hex string must have even length");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

function base58ToBytes(str: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of str) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base58 character: ${char}`);
    let carry = idx;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading zeros
  for (const char of str) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

function base64ToBytes(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
