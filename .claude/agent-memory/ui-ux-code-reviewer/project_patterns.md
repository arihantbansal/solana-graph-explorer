---
name: Codebase UI Patterns
description: Shared utilities, component conventions, and recurring patterns discovered during review
type: project
---

## Shared Utilities Created During Review
- `src/utils/format.ts` — `isPubkey()`, `lamportsToSol()`, `shortenAddress()` (was duplicated 3x each)
- `src/utils/programSaver.ts` — `makeIdlFetchedHandler()` for the `onIdlFetched` callback used with `expandAccount()` (was duplicated 7x)
- `src/types/pdaExplorer.ts` — `BUFFER_ENCODING_OPTIONS` (was duplicated 3x as `ENCODING_OPTIONS`)

## Large Files That Could Be Split Further
- `PdaSearch.tsx` (~1155 lines) — has 3 internal sub-components (`PdaSearch`, `FavoriteSearchCard`, `PdaSearchDialog`)
- `PdaRuleCreator.tsx` (~1113 lines) — has 4 internal sub-components (`PdaRuleCreator`, `SeedMappingField`, `CustomSeedField`, `SourcePicker`)
- `SettingsContext.tsx` (~420 lines) — has repetitive localStorage load/save pattern that could use a generic helper

## Component Conventions
- Node/Edge types defined outside component as constants (React Flow requirement)
- Handle positions rendered for all 4 sides (top/right/bottom/left) for smart edge routing
- `useAsyncAction` hook for loading/error/result state in async UI operations
- `useExploreAddress` hook for the common "add address to graph + expand" flow
- `useRelationshipRules` hook runs as invisible component `<RelationshipRuleEngine />` in App
