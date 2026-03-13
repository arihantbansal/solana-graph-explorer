# Solana Account Graph Explorer

An interactive visual explorer for Solana blockchain accounts and their relationships. Paste in an account address or transaction signature and watch the graph unfold.

> **This is a vibecoded side project, not a business or a product.** It was built for fun and to help debug my own problems as a dev. There are no guarantees, no roadmap, and no support team.

## What It Does

**Graph-based account exploration** — Search for any Solana account and visualize it as an interactive node graph. Double-click nodes to expand them and discover connected accounts. The app fetches Anchor IDLs automatically to decode account data and infer relationships between accounts (has_one references, PDA seeds, token accounts, and custom rules you define).

**Transaction explorer** — Paste a transaction signature to see its logs, balance changes, and a visual instruction graph showing how accounts flow through each instruction.

**PDA explorer** — Browse programs you've visited, see their PDA definitions extracted from the IDL, fill in seed values through a dynamic form, and derive + fetch accounts directly into the graph.

**Settings & customization** — Configure your RPC endpoint, label addresses with human-readable names, create custom relationship rules, control expansion depth, and export/import your entire configuration as JSON.

## Running Locally

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Tech Stack

- React 19, TypeScript, Vite
- [@solana/kit](https://github.com/anza-xyz/solana-web3.js) for all Solana interaction
- [@xyflow/react](https://reactflow.dev/) v12 for graph visualization
- Tailwind CSS v4 + shadcn/ui
- fflate for IDL decompression
- vitest for testing
