# Place monorepo

This repository combines the tiling images web app and the collage maker tool in one Nx workspace.

## Projects

- `apps/tiling-images` - Next.js image tiling demo
- `apps/place-nft` - Vite NFT collage app
- `tools/collage-maker` - Rust collage generator

## Prerequisites

- Node.js 24.5 (see `.nvmrc`) and npm
- Rust and Cargo

Install JavaScript dependencies from the repository root:

```powershell
npm install
```

## Common commands

```powershell
npm run dev
npm run dev:tiling-images
npm run dev:place-nft
npm run build
npm run lint
npm run test
npm run typecheck
```

Run a single target directly with Nx:

```powershell
npm exec nx -- show projects
npm exec nx -- build tiling-images
npm exec nx -- build place-nft
npm exec nx -- build collage-maker
npm exec nx -- run collage-maker:run
```

The Rust executable still expects its runtime `input` and `output` directories under `tools/collage-maker`; these directories remain ignored by Git.

WebP tiles are encoded sequentially by default to keep peak memory bounded. On machines with additional memory, set `COLLAGE_ENCODER_JOBS` up to the number of output tiles to encode tiles concurrently:

```powershell
$env:COLLAGE_ENCODER_JOBS=3
npm exec nx -- run collage-maker:run
```
