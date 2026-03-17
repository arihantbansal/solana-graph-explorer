/**
 * Display encodings for bytes/Uint8Array fields.
 */

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export type BytesDisplayEncoding =
  | "hex"
  | "utf8"
  | "base58"
  | "base64"
  | "raw"; // decimal byte array

export const BYTES_ENCODING_OPTIONS: {
  value: BytesDisplayEncoding;
  label: string;
}[] = [
  { value: "utf8", label: "UTF-8" },
  { value: "base58", label: "Base58" },
  { value: "hex", label: "Hex" },
  { value: "base64", label: "Base64" },
  { value: "raw", label: "Raw bytes" },
];

export function formatBytes(
  bytes: Uint8Array,
  encoding: BytesDisplayEncoding,
): string {
  try {
    switch (encoding) {
      case "utf8":
        return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      case "hex":
        return bytesToHex(bytes);
      case "base58":
        return bytesToBase58(bytes);
      case "base64":
        return bytesToBase64(bytes);
      case "raw":
        return `[${Array.from(bytes).join(", ")}]`;
    }
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : "decode failed"}`;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  // Count leading zeros
  let leadingZeros = 0;
  for (const b of bytes) {
    if (b !== 0) break;
    leadingZeros++;
  }

  // Convert to base58
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let result = "";
  for (let i = 0; i < leadingZeros; i++) {
    result += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }

  return result;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

/**
 * Guess the best default encoding for a bytes field.
 */
export function guessEncoding(bytes: Uint8Array): BytesDisplayEncoding {
  // 32 bytes is likely a pubkey → base58
  if (bytes.length === 32) return "base58";

  // Check if it looks like valid UTF-8 text (printable)
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/^[\x20-\x7e\t\n\r]+$/.test(text)) return "utf8";
  } catch (err) {
    console.warn("UTF-8 encoding guess failed for bytes field", err);
  }

  return "hex";
}
