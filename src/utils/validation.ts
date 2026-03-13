import { z } from "zod";

export const base58AddressSchema = z
  .string()
  .trim()
  .min(1, "Enter an address")
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address");

export function isValidBase58Address(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}
