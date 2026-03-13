import { createSolanaRpc } from "@solana/kit";
import { clearAccountCache } from "./accountCache";
import { clearIdlCache } from "./idlCache";
import { clearAssetCache } from "@/engine/assetDetection";

let currentRpc: ReturnType<typeof createSolanaRpc> | null = null;
let currentUrl: string = "";

export function getRpc(url: string) {
  if (url !== currentUrl || !currentRpc) {
    if (currentUrl && url !== currentUrl) {
      clearAccountCache();
      clearIdlCache();
      clearAssetCache();
    }
    currentRpc = createSolanaRpc(url as Parameters<typeof createSolanaRpc>[0]);
    currentUrl = url;
  }
  return currentRpc;
}
