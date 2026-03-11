import type { ProgramEntry } from "@/types/pdaExplorer";
import type { UserRelationshipDef } from "@/types/relationships";

const PROGRAMS_KEY = "solana-graph-explorer:saved-programs";
const RELATIONSHIPS_KEY = "solana-graph-explorer:user-relationships";

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

export function loadUserRelationships(): UserRelationshipDef[] {
  try {
    const raw = localStorage.getItem(RELATIONSHIPS_KEY);
    if (raw) return JSON.parse(raw) as UserRelationshipDef[];
  } catch {
    // ignore
  }
  return [];
}

export function saveUserRelationships(rels: UserRelationshipDef[]): void {
  localStorage.setItem(RELATIONSHIPS_KEY, JSON.stringify(rels));
}
