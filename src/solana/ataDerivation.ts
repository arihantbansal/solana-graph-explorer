import { getProgramDerivedAddress, getAddressEncoder, address as toAddress } from "@solana/kit";
import { TOKEN_PROGRAM_ID } from "./builtinIdls";

const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

export async function deriveAta(owner: string, mint: string): Promise<string> {
  const encoder = getAddressEncoder();
  const [ata] = await getProgramDerivedAddress({
    programAddress: toAddress(ASSOCIATED_TOKEN_PROGRAM_ID),
    seeds: [
      encoder.encode(toAddress(owner)),
      encoder.encode(toAddress(TOKEN_PROGRAM_ID)),
      encoder.encode(toAddress(mint)),
    ],
  });
  return ata;
}
