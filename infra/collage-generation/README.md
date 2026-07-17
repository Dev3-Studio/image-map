# Collage generation infrastructure

This package deploys the asynchronous Tessera release pipeline while keeping all large objects in the existing Cloudflare R2 bucket:

```text
IAM Lambda Function URL -> DynamoDB stream -> FIFO SQS -> Rust Lambda -> R2
```

The function URL is for a trusted AWS caller and requires SigV4/IAM authentication. Browser code only reads the public R2 release pointer. Removing API Gateway, the project-data S3 buckets, and CloudFront avoids those services' application storage and request charges; Lambda, DynamoDB, SQS, ECR, CloudWatch, and R2 still remain subject to their own free-tier limits. CDK also uses its small bootstrap S3 bucket for deployment artifacts, and Lambda container images must remain in ECR.

## R2 setup

Create an R2 S3 API token limited to Object Read & Write access for `tiling-demo`. Never commit its access key ID or secret. The stack has non-secret defaults for this project's bucket, endpoint, and public development URL; the credentials are supplied as masked CloudFormation parameters when deploying.

The public bucket needs this CORS policy so Vercel and local builds can fetch `current.json`, manifests, and image tiles:

```json
[
  {
    "AllowedOrigins": [
      "https://image-map-neon.vercel.app",
      "http://localhost:4200",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

## Deploy

The CDK environment must be bootstrapped and Docker must be able to build `linux/amd64` images. Set the two credentials in the current PowerShell session, then deploy them without writing either value to a file:

```powershell
$env:R2_ACCESS_KEY_ID = Read-Host 'R2 access key ID'
$env:R2_SECRET_ACCESS_KEY = Read-Host 'R2 secret access key'

pnpm nx build collage-generation-infra
pnpm nx synth collage-generation-infra -- --parameters "R2AccessKeyId=$env:R2_ACCESS_KEY_ID" --parameters "R2SecretAccessKey=$env:R2_SECRET_ACCESS_KEY"
pnpm nx deploy collage-generation-infra -- --parameters "R2AccessKeyId=$env:R2_ACCESS_KEY_ID" --parameters "R2SecretAccessKey=$env:R2_SECRET_ACCESS_KEY"
```

Override `R2Endpoint`, `R2BucketName`, or `R2PublicBaseUrl` with additional `--parameters Name=value` arguments if the bucket changes. The stack outputs the IAM-protected function URL and the public release base URL. Configure the frontend with:

```text
VITE_COLLAGE_RELEASE_BASE_URL=https://pub-78666f1dd7984ef69f57781fac523d68.r2.dev
```

## Submit a snapshot

A source revision is immutable. Upload all files to R2 before submitting the revision:

```text
snapshots/{sourceRevision}/
├── snapshot.json
├── grid.json
└── images/
    ├── 000000.webp
    └── ...
```

`snapshot.json` must conform to [collage-snapshot.schema.json](schema/collage-snapshot.schema.json). Its ordered `images` array maps directly to the grid's deterministic quadrant/leaf traversal order. Upload with any S3-compatible client configured with region `auto`, path-style requests, the stack's R2 endpoint, and the R2 credentials. For example, with an AWS CLI profile named `r2`:

```powershell
aws s3 sync .\snapshot s3://tiling-demo/snapshots/immutable-revision-id --endpoint-url https://fdd02276a217dc327a0724e2afbd23ea.r2.cloudflarestorage.com --profile r2
```

Submit it to the stack's function URL with a SigV4-capable AWS client:

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

Release paths are immutable and carry a one-year cache policy. `current.json` is written last with `no-store`, so clients never observe a partial release.
