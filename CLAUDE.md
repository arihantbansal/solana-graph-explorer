# Solana Account Graph Explorer

## Quick Reference
- **Stack**: Vite + React + TypeScript, @solana/kit, @xyflow/react (v12), fflate, Tailwind CSS v4 + shadcn/ui
- **Test**: `npx vitest run` — TDD for all engine/ and solana/ code
- **Dev**: `npm run dev`
- **No web3.js** — use @solana/kit exclusively
- **No zustand/redux** — React Context + useReducer only
- **Read-only** — no wallet connection

## Architecture
- `src/types/` — shared TypeScript types (idl.ts, graph.ts, relationships.ts)
- `src/solana/` — RPC, account fetching, IDL fetching/caching
- `src/engine/` — Borsh decoding, relationship inference, graph building
- `src/components/` — React components (SearchBar, GraphCanvas, AccountNode, etc.)
- `src/contexts/` — GraphContext (graph state), SettingsContext (RPC endpoint + user rels)
- `tests/` — vitest tests with fixtures

## Key Conventions
- Path alias: `@/` maps to `src/`
- Anchor IDL PDA seeds: `["anchor:idl", programId]`
- IDL v0.30+ detection: presence of `metadata.spec` field
- Relationship types: has_one, pda_seed, token, user_defined
- Custom Borsh reader (no borsh-js dependency)
- fflate for IDL decompression (not pako)

## Patterns
- All engine code is pure/deterministic — test with vitest
- React Flow nodes typed as `AccountNode`, edges as `AccountEdge`
- Graph state managed via useReducer in GraphContext
- RPC endpoint selector stores in SettingsContext + localStorage
