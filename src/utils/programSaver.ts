import type { Idl } from "@/types/idl";
import type { ProgramEntry } from "@/types/pdaExplorer";

/**
 * Create the standard `onIdlFetched` callback used throughout the app
 * when expanding accounts. This avoids repeating the ProgramEntry creation
 * pattern in every component that calls expandAccount.
 */
export function makeIdlFetchedHandler(
  saveProgram: (entry: ProgramEntry) => void,
): (programId: string, idl: Idl) => void {
  return (programId: string, idl: Idl) => {
    saveProgram({
      programId,
      programName: idl.metadata?.name ?? programId,
      idlFetchedAt: Date.now(),
      idl,
    });
  };
}
