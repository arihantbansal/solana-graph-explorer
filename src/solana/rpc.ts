import { createSolanaRpc } from "@solana/kit";

let currentRpc: ReturnType<typeof createSolanaRpc> | null = null;
let currentUrl: string = "";

export function getRpc(url: string) {
  if (url !== currentUrl || !currentRpc) {
    currentRpc = createSolanaRpc(url as Parameters<typeof createSolanaRpc>[0]);
    currentUrl = url;
  }
  return currentRpc;
}
