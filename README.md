# Place monorepo

This repository combines the NFT collage app and the collage maker tool in one Nx workspace.

## Projects

- `apps/place-nft` - Vite NFT collage app
- `tools/collage-maker` - Rust collage generator

The app opens with a 5,000-image stress demo based on the mixed-size quadtree placements in `coords4999.json`. It uses a memory-safe preview of the local real-image collage for the overview and deterministic seeded [Lorem Picsum](https://picsum.photos/) photographs for close-up tiles. The detail layer only requests images inside the current viewport. Add `?demo=showcase` to the URL to load the nine-image local IIIF showcase instead.

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

The Rust executable expects its runtime `input` and `output` directories under `tools/collage-maker`; these directories remain ignored by Git. A normal run now publishes an IIIF Presentation 3 manifest and static Image API 3 Level 0 services to `output/iiif` alongside the legacy collage output.

Set `IIIF_PUBLIC_BASE_URL` to the final public HTTP(S) URL before publishing production images so every IIIF resource has a dereferenceable standards-compliant identifier:

```powershell
$env:IIIF_PUBLIC_BASE_URL="https://images.example.com/iiif"
pnpm nx -- run collage-maker:run
```

Each source image is center-cropped to the square used in the collage, then published as:

```text
iiif/
├── manifest.json
└── 3/{image-id}/
    ├── info.json
    ├── full/{size},{size}/0/default.jpg
    └── {x},{y},{w},{h}/{width},{height}/0/default.jpg
```

The committed showcase uses portable root-relative identifiers and can be regenerated from the nine source images in `tools/collage-maker/showcase`:

```powershell
pnpm nx -- run collage-maker:publish-showcase
```

`publish-grid` is also available for another evenly spaced image set. Use `--images`, `--output`, `--base-url`, `--canvas-width`, `--columns`, `--tile-size`, and `--jpeg-quality` to configure it. `--preview-output` and `--coords-output` keep the low-resolution map preview and navigation coordinates synchronized with the manifest.

WebP tiles are encoded sequentially by default to keep peak memory bounded. On machines with additional memory, set `COLLAGE_ENCODER_JOBS` up to the number of output tiles to encode tiles concurrently:

```powershell
$env:COLLAGE_ENCODER_JOBS=3
pnpm nx -- run collage-maker:run
```
