import { getProgramDerivedAddress, getAddressEncoder, address as toAddress } from "@solana/kit";

const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

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
