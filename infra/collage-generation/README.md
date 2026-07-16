# Collage generation infrastructure

This package deploys the asynchronous Tessera release pipeline:

```text
IAM HTTP API -> DynamoDB stream -> FIFO SQS -> Rust Lambda -> S3 -> CloudFront
```

The API is for a trusted backend. Browser code only reads the public CloudFront release pointer.

## Deploy

The CDK environment must be bootstrapped and Docker must be able to build `linux/amd64` images.

```powershell
pnpm nx build collage-generation-infra
pnpm nx synth collage-generation-infra
pnpm nx deploy collage-generation-infra
```

The stack outputs the signed API URL, snapshot bucket name, and public release base URL. Set the release URL on the frontend build:

```text
VITE_COLLAGE_RELEASE_BASE_URL=https://the-cloudfront-domain.example
```

## Submit a snapshot

A source revision is immutable. Upload all files before submitting the revision:

```text
snapshots/{sourceRevision}/
├── snapshot.json
├── grid.json
└── images/
    ├── 000000.webp
    └── ...
```

`snapshot.json` must conform to [collage-snapshot.schema.json](schema/collage-snapshot.schema.json). Its ordered `images` array maps directly to the grid's deterministic quadrant/leaf traversal order.

Submit it with a SigV4-capable client:

```http
POST /regenerations
Content-Type: application/json

{"sourceRevision":"immutable-revision-id"}
```

The request returns `202` with the deterministic job ID. `GET /regenerations/{jobId}` returns one of `QUEUED`, `RUNNING`, `RETRYING`, `SUCCEEDED`, `SUPERSEDED`, or `FAILED`.

When several revisions arrive together, queued older revisions are marked `SUPERSEDED`. A job that becomes stale while running may finish its immutable artifacts, but it cannot replace `current.json`.

## Release layout

```text
current.json
releases/{jobId}/
├── collage.webp
└── iiif/
    ├── manifest.json
    └── 3/{imageId}/...
```

Release paths are immutable and cached for a year. `current.json` is written last with `no-store`, so clients never observe a partial release.
