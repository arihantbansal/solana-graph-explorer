import { describe, it, expect } from "vitest";
import {
  parseProgramAccount,
  parseProgramDataAccount,
  parseSecurityTxt,
} from "@/engine/programAccountParser";
import { getAddressEncoder } from "@solana/kit";

function makeProgramAccountData(programdataAddress: string): Uint8Array {
  const encoder = getAddressEncoder();
  const data = new Uint8Array(36);
  // u32 LE discriminator = 2
  data[0] = 2;
  data[1] = 0;
  data[2] = 0;
  data[3] = 0;
  // 32-byte programdata address
  const addrBytes = encoder.encode(programdataAddress as Parameters<typeof encoder.encode>[0]);
  data.set(addrBytes, 4);
  return data;
}

function makeProgramDataAccountData(
  slot: bigint,
  authority: string | null,
): Uint8Array {
  const encoder = getAddressEncoder();
  const data = new Uint8Array(45);
  // u32 LE discriminator = 3
  data[0] = 3;
  data[1] = 0;
  data[2] = 0;
  data[3] = 0;
  // u64 LE slot
  const view = new DataView(data.buffer, data.byteOffset + 4, 8);
  view.setBigUint64(0, slot, true);
  // Option tag
  if (authority) {
    data[12] = 1;
    const addrBytes = encoder.encode(authority as Parameters<typeof encoder.encode>[0]);
    data.set(addrBytes, 13);
  } else {
    data[12] = 0;
  }
  return data;
}

describe("parseProgramAccount", () => {
  it("parses a valid program account", () => {
    const programdata = "BPFLoaderUpgradeab1e11111111111111111111111";
    const data = makeProgramAccountData(programdata);
    const result = parseProgramAccount(data);
    expect(result).toBe(programdata);
  });

  it("returns null for wrong discriminator", () => {
    const data = new Uint8Array(36);
    data[0] = 1; // wrong
    expect(parseProgramAccount(data)).toBeNull();
  });

  it("returns null for too-short data", () => {
    const data = new Uint8Array(10);
    data[0] = 2;
    expect(parseProgramAccount(data)).toBeNull();
  });
});

describe("parseProgramDataAccount", () => {
  it("parses with authority", () => {
    const authority = "BPFLoaderUpgradeab1e11111111111111111111111";
    const data = makeProgramDataAccountData(123456n, authority);
    const result = parseProgramDataAccount(data);
    expect(result).not.toBeNull();
    expect(result!.slot).toBe(123456);
    expect(result!.authority).toBe(authority);
  });

  it("parses without authority (immutable)", () => {
    const data = makeProgramDataAccountData(999n, null);
    const result = parseProgramDataAccount(data);
    expect(result).not.toBeNull();
    expect(result!.slot).toBe(999);
    expect(result!.authority).toBeNull();
  });

  it("returns null for wrong discriminator", () => {
    const data = new Uint8Array(45);
    data[0] = 2; // wrong — should be 3
    expect(parseProgramDataAccount(data)).toBeNull();
  });

  it("returns null for too-short data", () => {
    const data = new Uint8Array(20);
    data[0] = 3;
    expect(parseProgramDataAccount(data)).toBeNull();
  });
});

describe("parseSecurityTxt", () => {
  function buildSecurityTxt(pairs: Record<string, string>): Uint8Array {
    const encoder = new TextEncoder();
    const magic = encoder.encode("=======BEGIN SECURITY.TXT V1=======\0");
    const end = encoder.encode("=======END SECURITY.TXT V1=======");

    // Build key\0value\0 pairs
    const kvParts: Uint8Array[] = [];
    for (const [key, value] of Object.entries(pairs)) {
      kvParts.push(encoder.encode(key));
      kvParts.push(new Uint8Array([0]));
      kvParts.push(encoder.encode(value));
      kvParts.push(new Uint8Array([0]));
    }

    const totalLen = magic.length + kvParts.reduce((a, b) => a + b.length, 0) + end.length;
    const result = new Uint8Array(totalLen);
    let offset = 0;
    result.set(magic, offset); offset += magic.length;
    for (const part of kvParts) {
      result.set(part, offset); offset += part.length;
    }
    result.set(end, offset);
    return result;
  }

  it("parses key-value pairs from security.txt", () => {
    const data = buildSecurityTxt({
      name: "My Program",
      project_url: "https://example.com",
      contacts: "security@example.com",
    });
    const result = parseSecurityTxt(data);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("My Program");
    expect(result!.project_url).toBe("https://example.com");
    expect(result!.contacts).toBe("security@example.com");
  });

  it("returns null when no magic bytes found", () => {
    const data = new Uint8Array(100);
    expect(parseSecurityTxt(data)).toBeNull();
  });

  it("handles security.txt embedded in larger data", () => {
    const encoder = new TextEncoder();
    const prefix = new Uint8Array(500); // simulated ELF bytes before
    const magic = encoder.encode("=======BEGIN SECURITY.TXT V1=======\0");
    const kvData = encoder.encode("auditors\0Trail of Bits\0");
    const end = encoder.encode("=======END SECURITY.TXT V1=======");
    const suffix = new Uint8Array(200); // more ELF bytes after

    const total = new Uint8Array(prefix.length + magic.length + kvData.length + end.length + suffix.length);
    let offset = 0;
    total.set(prefix, offset); offset += prefix.length;
    total.set(magic, offset); offset += magic.length;
    total.set(kvData, offset); offset += kvData.length;
    total.set(end, offset); offset += end.length;
    total.set(suffix, offset);

    const result = parseSecurityTxt(total);
    expect(result).not.toBeNull();
    expect(result!.auditors).toBe("Trail of Bits");
  });
});
