# Place monorepo

This repository combines the NFT collage app and the collage maker tool in one Nx workspace.

## Projects

- `apps/place-nft` - Vite NFT collage app
- `tools/collage-maker` - Rust collage generator

`/` serves the marketing landing page, and the collage itself lives at `/collage`, with `/tile/{n}` deep links unchanged. The landing hero draws its background from the same map preview the collage renders, so the two never drift apart.

The collage opens with a 5,000-image stress demo based on the mixed-size quadtree placements in `coords4999.json`. Its 2,048px overview, 6,400px medium LOD, IIIF Presentation manifest, and leaf tiles are generated from the attached face and object images and published under the `tessera-5000-v1` prefix in R2. The browser prefers AVIF and falls back to WebP; leaf resolution scales with each placement up to the source resolution. The app hydrates the placement geometry locally, defers the medium LOD until it is near the active zoom range, and only requests leaf images inside the current viewport. Add `?demo=showcase` to the URL to load the nine-image local IIIF showcase instead.

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

To regenerate the 5,000-image R2 staging publication from the untracked `Images` attachment:

```powershell
pnpm nx -- run collage-maker:publish-stress
```

The stress publisher writes AVIF and WebP variants for both previews and every leaf image. Encoding uses high visual-quality settings and sizes each leaf at four source pixels per map pixel, clamped between 384px and 2,048px without upscaling past the attached source. Set `STRESS_ENCODER_JOBS` from 1 to 8 to control parallel AVIF/WebP encoding according to available memory.

`publish-grid` is also available for another evenly spaced image set. Use `--images`, `--output`, `--base-url`, `--canvas-width`, `--columns`, `--tile-size`, and `--jpeg-quality` to configure it. `--preview-output` and `--coords-output` keep the low-resolution map preview and navigation coordinates synchronized with the manifest.

WebP tiles are encoded sequentially by default to keep peak memory bounded. On machines with additional memory, set `COLLAGE_ENCODER_JOBS` up to the number of output tiles to encode tiles concurrently:

```powershell
$env:COLLAGE_ENCODER_JOBS=3
pnpm nx -- run collage-maker:run
```
