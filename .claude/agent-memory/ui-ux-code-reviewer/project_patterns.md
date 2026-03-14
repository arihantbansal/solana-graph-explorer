---
name: Codebase UI Patterns
description: Shared utilities, component conventions, and recurring patterns discovered during review
type: project
---

## Shared Utilities Created During Review
- `src/utils/format.ts` — `isPubkey()`, `lamportsToSol()`, `shortenAddress()` (was duplicated 3x each)
- `src/utils/programSaver.ts` — `makeIdlFetchedHandler()` for the `onIdlFetched` callback used with `expandAccount()` (was duplicated 7x)
- `src/types/pdaExplorer.ts` — `BUFFER_ENCODING_OPTIONS` (was duplicated 3x as `ENCODING_OPTIONS`)
- `src/hooks/useClearAndExplore.ts` — consolidates the "clear graph + add node + expand + update URL + fitView" pattern (was duplicated 3x)

## Large Files That Could Be Split Further
- `PdaSearch.tsx` (~1100 lines) — has 3 internal sub-components (`PdaSearch`, `FavoriteSearchCard`, `PdaSearchDialog`)
- `PdaRuleCreator.tsx` (~1100 lines) — has 4 internal sub-components (`PdaRuleCreator`, `SeedMappingField`, `CustomSeedField`, `SourcePicker`)
- `SettingsContext.tsx` (~420 lines) — has repetitive localStorage load/save pattern that could use a generic helper
- An `AddressLabelPicker` component could be extracted — the saved-address dropdown Select appears 4+ times across PdaSearch and PdaRuleCreator

## Shared Utilities Created During Transaction Explorer Review
- `src/solana/transactionMapping.ts` — `mapRpcInstruction()`, `appendLoadedAddresses()`, `buildParsedTransaction()`, `coerceTokenBalance()` (was duplicated across fetchTransaction.ts and fetchTransactions.ts)
- `src/engine/expandAccount.ts` — `decodeAccountWithIdl()`, `fallbackToDasOrNotFound()`, `dasAssetResult()`, `NOT_FOUND_RESULT` (decode logic was duplicated between fetchAndDecode and fetchAndDecodeMany)
- `src/components/TransactionCanvas.tsx` — `toEnrichData()` (FetchDecodeResult-to-node-data conversion was duplicated 3x)

## Component Conventions
- Node/Edge types defined outside component as constants (React Flow requirement)
- Handle positions rendered for all 4 sides (top/right/bottom/left) for smart edge routing
- `useAsyncAction` hook for loading/error/result state in async UI operations
- `useExploreAddress` hook for the common "add address to graph + expand" flow
- `useClearAndExplore` hook for "clear graph and explore a single address" flow
- `useRelationshipRules` hook runs as invisible component `<RelationshipRuleEngine />` in App
- `cn()` from `src/lib/utils.ts` for conditional Tailwind classes (prefer over string concatenation)
- GraphContext uses `useMemo`/`useCallback` for derived values to prevent unnecessary re-renders
