import { address } from "@solana/kit";
import { getRpc } from "./rpc";

const MAX_RESULTS = 100;

export interface ProgramAccountResult {
  pubkey: string;
  data: Uint8Array;
}

/**
 * Fetch accounts owned by a program, filtered by 8-byte Anchor discriminator.
 * Returns addresses + raw account data for decoding.
 */
export async function fetchProgramAccountsByType(
  programAddress: string,
  discriminator: number[],
  rpcUrl: string,
): Promise<ProgramAccountResult[]> {
  const rpc = getRpc(rpcUrl);

  // Encode discriminator as base64 for the memcmp filter
  const discBytes = new Uint8Array(discriminator);
  const base64Disc = btoa(String.fromCharCode(...discBytes));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await rpc
    .getProgramAccounts(address(programAddress) as Parameters<typeof rpc.getProgramAccounts>[0], {
      encoding: "base64",
      filters: [
        {
          memcmp: {
            offset: 0n,
            bytes: base64Disc,
            encoding: "base64",
          },
        },
      ],
    } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .send();

  // result is { context, value } or just an array depending on kit version
  const accounts = Array.isArray(result) ? result : result.value ?? result;
  return accounts.slice(0, MAX_RESULTS).map((item: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    // Account data comes as base64 string(s) — decode to Uint8Array
    const accountData = item.account?.data;
    let data: Uint8Array;
    if (accountData instanceof Uint8Array) {
      data = accountData;
    } else if (Array.isArray(accountData) && typeof accountData[0] === "string") {
      // [base64string, "base64"] format
      const binary = atob(accountData[0]);
      data = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
    } else if (typeof accountData === "string") {
      const binary = atob(accountData);
      data = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
    } else {
      data = new Uint8Array(0);
    }
    return { pubkey: String(item.pubkey), data };
  });
}
