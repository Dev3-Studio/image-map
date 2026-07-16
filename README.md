# Place monorepo

This repository combines the NFT collage app and the collage maker tool in one Nx workspace.

## Projects

- `apps/place-nft` - Vite NFT collage app
- `infra/collage-generation` - AWS CDK serverless generation pipeline
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
pnpm nx -- synth collage-generation-infra
```

## Serverless collage releases

The production path accepts an immutable snapshot from a trusted backend, queues it through DynamoDB and FIFO SQS, runs the Rust generator in Lambda, and atomically publishes a versioned release through S3 and CloudFront. See [the infrastructure guide](infra/collage-generation/README.md) for deployment, snapshot, API, and release contracts.

Set `VITE_COLLAGE_RELEASE_BASE_URL` to the stack's `ReleaseBaseUrl` output when building the frontend. The app polls `current.json` every 15 seconds while visible and keeps the bundled collage as its offline/local fallback.

The Rust executable expects its runtime `input` and `output` directories under `tools/collage-maker`; these directories remain ignored by Git. A normal run publishes a bounded WebP preview, navigation coordinates, an IIIF Presentation 3 manifest, and static Image API 3 Level 0 services. The logical map dimensions stay full size while the preview is capped at 4096 pixels per edge.

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

`publish-grid` is also available for another evenly spaced image set. Use `--images`, `--output`, `--base-url`, `--canvas-width`, `--columns`, `--tile-size`, `--jpeg-quality`, and `--preview-max-edge` to configure it. `--preview-output` and `--coords-output` keep the bounded low-resolution map preview and navigation coordinates synchronized with the manifest.

The Lambda worker downloads four source images per batch and uploads up to sixteen generated artifacts concurrently. These deployment defaults are exposed as `SOURCE_BATCH_SIZE` and `ARTIFACT_UPLOAD_CONCURRENCY` on the worker function.
