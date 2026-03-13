import type { ProgramEntry } from "@/types/pdaExplorer";

const PROGRAMS_KEY = "solana-graph-explorer:saved-programs";

export function loadSavedPrograms(): ProgramEntry[] {
  try {
    const raw = localStorage.getItem(PROGRAMS_KEY);
    if (raw) return JSON.parse(raw) as ProgramEntry[];
  } catch {
    // ignore
  }
  return [];
}

export function saveProgramEntries(programs: ProgramEntry[]): void {
  localStorage.setItem(PROGRAMS_KEY, JSON.stringify(programs));
}

