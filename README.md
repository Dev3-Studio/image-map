# Place monorepo

This repository combines the NFT collage app and the collage maker tool in one Nx workspace.

## Projects

- `apps/place-nft` - Vite NFT collage app
- `tools/collage-maker` - Rust collage generator

## Prerequisites

- Node.js 24.5 (see `.nvmrc`) and pnpm 11.10
- Rust and Cargo

Install JavaScript dependencies from the repository root:

```powershell
pnpm install
```

## Common commands

```powershell
pnpm dev
pnpm dev:place-nft
pnpm build
pnpm lint
pnpm test
pnpm typecheck
```

Run a single target directly with Nx:

```powershell
pnpm nx -- show projects
pnpm nx -- build place-nft
pnpm nx -- build collage-maker
pnpm nx -- run collage-maker:run
```

The Rust executable still expects its runtime `input` and `output` directories under `tools/collage-maker`; these directories remain ignored by Git.

WebP tiles are encoded sequentially by default to keep peak memory bounded. On machines with additional memory, set `COLLAGE_ENCODER_JOBS` up to the number of output tiles to encode tiles concurrently:

```powershell
$env:COLLAGE_ENCODER_JOBS=3
pnpm nx -- run collage-maker:run
```
