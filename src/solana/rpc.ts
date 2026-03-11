import { createSolanaRpc } from "@solana/kit";

export const RPC_ENDPOINTS = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  custom: "",
} as const;

export type RpcEndpointKey = keyof typeof RPC_ENDPOINTS;

let currentRpc: ReturnType<typeof createSolanaRpc> | null = null;
let currentUrl: string = "";

export function getRpc(url: string) {
  if (url !== currentUrl || !currentRpc) {
    currentRpc = createSolanaRpc(url as Parameters<typeof createSolanaRpc>[0]);
    currentUrl = url;
  }
  return currentRpc;
}
