import type { Idl } from "@/types/idl";

const cache = new Map<string, Idl>();

export function getIdl(programId: string): Idl | undefined {
  return cache.get(programId);
}

export function setIdl(programId: string, idl: Idl): void {
  cache.set(programId, idl);
}

export function hasIdl(programId: string): boolean {
  return cache.has(programId);
}

export function clearIdlCache(): void {
  cache.clear();
}
