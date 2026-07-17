# Place monorepo

This repository combines the NFT collage app and the collage maker tool in one Nx workspace.

## Projects

- `apps/place-nft` - Vite NFT collage app
- `infra/collage-generation` - AWS CDK serverless generation pipeline
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
pnpm nx -- synth collage-generation-infra
```

## Wallet-free demo

Open `/collage?demo=upload` or use the **Try demo · no wallet** action on the landing page. Demo placements still pass upload moderation, but they stay in the current browser session and reset on refresh. Location links preserve the demo query parameter, and tile details do not initialize or prompt for a wallet while the mode is active.

## Upload moderation

Images selected in the upload dialog are resized in the browser and sent to the server-only `/api/moderate-image` Vercel Function. The function uses OpenAI's `omni-moderation-latest` image classifier and only approves the preview when the sexual-content category is clear. Moderation failures are fail-closed, so an image cannot reach the mint action unless the check succeeds.

Set `OPENAI_API_KEY` in the Vercel project's environment variables. Keep it server-only; never use a `VITE_` prefix or commit it to an environment file. Use `vercel dev` when testing the moderation function locally because the standalone Vite development server does not run files in `/api`.

The current mint action is a local prototype and does not persist uploads. When permanent upload storage is added, the storage/finalize endpoint must repeat or cryptographically bind this server-side moderation decision before writing to R2; a browser approval alone is not an authorization boundary.

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

To regenerate the 5,000-image R2 staging publication from the untracked `Images` attachment:

```powershell
pnpm nx -- run collage-maker:publish-stress
```

The stress publisher writes AVIF and WebP variants for both previews and every leaf image. Encoding uses high visual-quality settings and preserves four source pixels per map pixel, with a 384px floor for small placements and no fixed upper resolution cap. Output never upscales past the uploaded source, so larger high-resolution uploads retain proportionally more detail without changing the established density of small images. Set `STRESS_ENCODER_JOBS` from 1 to 8 to control parallel AVIF/WebP encoding according to available memory.

`publish-grid` is also available for another evenly spaced image set. Use `--images`, `--output`, `--base-url`, `--canvas-width`, `--columns`, `--tile-size`, `--jpeg-quality`, and `--preview-max-edge` to configure it. `--preview-output` and `--coords-output` keep the bounded low-resolution map preview and navigation coordinates synchronized with the manifest.

The optional serverless pipeline keeps snapshots and generated releases in the existing R2 bucket while AWS Lambda, DynamoDB, and SQS handle generation and orchestration. The Lambda worker downloads four source images per batch and uploads up to sixteen generated artifacts concurrently. These deployment defaults are exposed as `SOURCE_BATCH_SIZE` and `ARTIFACT_UPLOAD_CONCURRENCY` on the worker function. See `infra/collage-generation/README.md` for deployment and CORS configuration.
