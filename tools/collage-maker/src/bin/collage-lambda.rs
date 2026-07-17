use aws_config::BehaviorVersion;
use aws_lambda_events::event::sqs::{BatchItemFailure, SqsBatchResponse, SqsEvent, SqsMessage};
use aws_sdk_dynamodb::types::AttributeValue;
use aws_sdk_s3::config::{Credentials, Region};
use aws_sdk_s3::primitives::ByteStream;
use chrono::Utc;
use collage_maker::{
    encode_preview, layout_from_grid, manifest_artifact, process_image, validate_snapshot,
    Artifact, CollageSnapshot, IiifTarget, ProcessedImage, ReleaseLayout,
    DEFAULT_IIIF_JPEG_QUALITY, DEFAULT_IIIF_TILE_SIZE,
};
use futures::{future::join_all, stream, StreamExt, TryStreamExt};
use image::{ImageBuffer, Rgba};
use lambda_runtime::{run, service_fn, Error, LambdaEvent};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::sync::Arc;

type WorkerResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

struct State {
    s3: aws_sdk_s3::Client,
    dynamodb: aws_sdk_dynamodb::Client,
    input_bucket: String,
    release_bucket: String,
    jobs_table: String,
    release_base_url: String,
    source_batch_size: usize,
    upload_concurrency: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerationMessage {
    job_id: String,
    source_revision: String,
    snapshot_etag: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CurrentRelease<'a> {
    schema_version: u8,
    generation_id: &'a str,
    source_revision: &'a str,
    preview_url: String,
    manifest_url: String,
    published_at: String,
}

fn required_environment(name: &str) -> WorkerResult<String> {
    env::var(name).map_err(|_| format!("missing {name}").into())
}

fn environment_usize(name: &str, default: usize) -> usize {
    env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn normalize_etag(etag: Option<&str>) -> String {
    etag.unwrap_or_default().replace('"', "")
}

fn receive_count(message: &SqsMessage) -> u32 {
    message
        .attributes
        .get("ApproximateReceiveCount")
        .and_then(|value| value.parse().ok())
        .unwrap_or(1)
}

async fn get_string_attribute(
    state: &State,
    id: &str,
    attribute: &str,
) -> WorkerResult<Option<String>> {
    let response = state
        .dynamodb
        .get_item()
        .table_name(&state.jobs_table)
        .key("id", AttributeValue::S(id.to_string()))
        .consistent_read(true)
        .send()
        .await?;
    Ok(response
        .item()
        .and_then(|item| item.get(attribute))
        .and_then(|value| value.as_s().ok())
        .cloned())
}

async fn latest_job_id(state: &State) -> WorkerResult<Option<String>> {
    get_string_attribute(state, "HEAD", "latestJobId").await
}

async fn job_status(state: &State, job_id: &str) -> WorkerResult<Option<String>> {
    get_string_attribute(state, &format!("JOB#{job_id}"), "status").await
}

async fn mark_running(state: &State, job_id: &str) -> WorkerResult<()> {
    state
        .dynamodb
        .update_item()
        .table_name(&state.jobs_table)
        .key("id", AttributeValue::S(format!("JOB#{job_id}")))
        .update_expression(
            "SET #status = :status, updatedAt = :now REMOVE failureCode ADD attempts :one",
        )
        .expression_attribute_names("#status", "status")
        .expression_attribute_values(":status", AttributeValue::S("RUNNING".into()))
        .expression_attribute_values(":now", AttributeValue::S(Utc::now().to_rfc3339()))
        .expression_attribute_values(":one", AttributeValue::N("1".into()))
        .send()
        .await?;
    Ok(())
}

async fn mark_status(
    state: &State,
    job_id: &str,
    status: &str,
    release_url: Option<&str>,
    failure_code: Option<&str>,
) -> WorkerResult<()> {
    let mut expression = "SET #status = :status, updatedAt = :now".to_string();
    if release_url.is_some() {
        expression.push_str(", releaseUrl = :releaseUrl");
    }
    if failure_code.is_some() {
        expression.push_str(", failureCode = :failureCode");
    } else {
        expression.push_str(" REMOVE failureCode");
    }
    let mut request = state
        .dynamodb
        .update_item()
        .table_name(&state.jobs_table)
        .key("id", AttributeValue::S(format!("JOB#{job_id}")))
        .update_expression(expression)
        .expression_attribute_names("#status", "status")
        .expression_attribute_values(":status", AttributeValue::S(status.into()))
        .expression_attribute_values(":now", AttributeValue::S(Utc::now().to_rfc3339()));
    if let Some(url) = release_url {
        request =
            request.expression_attribute_values(":releaseUrl", AttributeValue::S(url.to_string()));
    }
    if let Some(code) = failure_code {
        request = request
            .expression_attribute_values(":failureCode", AttributeValue::S(code.to_string()));
    }
    request.send().await?;
    Ok(())
}

async fn download_object(state: &State, key: &str) -> WorkerResult<Vec<u8>> {
    let response = state
        .s3
        .get_object()
        .bucket(&state.input_bucket)
        .key(key)
        .send()
        .await?;
    Ok(response.body.collect().await?.into_bytes().to_vec())
}

async fn upload_artifact(
    state: &State,
    release_prefix: &str,
    artifact: Artifact,
) -> WorkerResult<()> {
    state
        .s3
        .put_object()
        .bucket(&state.release_bucket)
        .key(format!("{release_prefix}/{}", artifact.key))
        .content_type(artifact.content_type)
        .cache_control("public,max-age=31536000,immutable")
        .body(ByteStream::from(artifact.body))
        .send()
        .await?;
    Ok(())
}

async fn upload_artifacts(
    state: &State,
    release_prefix: &str,
    artifacts: Vec<Artifact>,
) -> WorkerResult<()> {
    stream::iter(artifacts)
        .map(|artifact| upload_artifact(state, release_prefix, artifact))
        .buffer_unordered(state.upload_concurrency)
        .try_collect::<Vec<_>>()
        .await?;
    Ok(())
}

async fn process_batch(
    state: &State,
    snapshot: &CollageSnapshot,
    layout: &ReleaseLayout,
    start: usize,
    public_iiif_base: &str,
) -> WorkerResult<Vec<ProcessedImage>> {
    let end = (start + state.source_batch_size).min(snapshot.images.len());
    let images = &snapshot.images[start..end];
    let downloads = join_all(
        images
            .iter()
            .map(|image| download_object(state, &image.key)),
    )
    .await;
    let mut tasks = Vec::with_capacity(images.len());
    for (offset, (image, download)) in images.iter().zip(downloads).enumerate() {
        let bytes = download?;
        let identifier = image.id.clone();
        let coords = layout.placements[start + offset].clone();
        let layout = layout.clone();
        let public_iiif_base = public_iiif_base.to_string();
        tasks.push(tokio::task::spawn_blocking(move || {
            process_image(
                &bytes,
                &identifier,
                &coords,
                &layout,
                &IiifTarget {
                    artifact_prefix: "iiif",
                    public_base_url: &public_iiif_base,
                    tile_size: DEFAULT_IIIF_TILE_SIZE,
                    jpeg_quality: DEFAULT_IIIF_JPEG_QUALITY,
                },
            )
        }));
    }

    let mut processed = Vec::with_capacity(tasks.len());
    for result in join_all(tasks).await {
        processed.push(result.map_err(|error| format!("image task failed: {error}"))??);
    }
    Ok(processed)
}

async fn process_job(state: &State, message: &GenerationMessage) -> WorkerResult<()> {
    if matches!(
        job_status(state, &message.job_id).await?.as_deref(),
        Some("SUCCEEDED" | "SUPERSEDED" | "FAILED")
    ) {
        return Ok(());
    }
    if latest_job_id(state).await?.as_deref() != Some(&message.job_id) {
        mark_status(state, &message.job_id, "SUPERSEDED", None, None).await?;
        return Ok(());
    }
    mark_running(state, &message.job_id).await?;

    let snapshot_key = format!("snapshots/{}/snapshot.json", message.source_revision);
    let snapshot_response = state
        .s3
        .get_object()
        .bucket(&state.input_bucket)
        .key(&snapshot_key)
        .send()
        .await?;
    if normalize_etag(snapshot_response.e_tag()) != message.snapshot_etag {
        return Err("snapshot changed after the job was accepted".into());
    }
    let snapshot_bytes = snapshot_response.body.collect().await?.into_bytes();
    let snapshot: CollageSnapshot = serde_json::from_slice(&snapshot_bytes)?;
    validate_snapshot(&snapshot, &message.source_revision, snapshot.images.len())?;
    let grid_bytes = download_object(state, &snapshot.grid_key).await?;
    let grid: Value = serde_json::from_slice(&grid_bytes)?;
    let layout = layout_from_grid(&grid, snapshot.base_tile_width, snapshot.preview_max_edge)?;
    validate_snapshot(&snapshot, &message.source_revision, layout.placements.len())?;

    let release_prefix = format!("releases/{}", message.job_id);
    let release_url = format!(
        "{}/{}",
        state.release_base_url.trim_end_matches('/'),
        release_prefix
    );
    let public_iiif_base = format!("{release_url}/iiif");
    let mut preview: ImageBuffer<Rgba<u8>, Vec<u8>> =
        ImageBuffer::new(layout.preview_width, layout.preview_height);
    let mut annotations = Vec::with_capacity(snapshot.images.len());

    for start in (0..snapshot.images.len()).step_by(state.source_batch_size) {
        let processed = process_batch(state, &snapshot, &layout, start, &public_iiif_base).await?;
        let mut artifacts = Vec::new();
        for image in processed {
            image::imageops::replace(
                &mut preview,
                &image.preview_patch,
                image.preview_x as i64,
                image.preview_y as i64,
            );
            annotations.push(image.annotation);
            artifacts.extend(image.artifacts);
        }
        upload_artifacts(state, &release_prefix, artifacts).await?;
        tracing::info!(
            job_id = message.job_id,
            images_processed = annotations.len()
        );
    }

    let preview_bytes = tokio::task::spawn_blocking(move || encode_preview(&preview))
        .await
        .map_err(|error| format!("preview task failed: {error}"))??;
    upload_artifact(
        state,
        &release_prefix,
        Artifact {
            key: "collage.webp".into(),
            body: preview_bytes,
            content_type: "image/webp",
        },
    )
    .await?;
    let target = IiifTarget {
        artifact_prefix: "iiif",
        public_base_url: &public_iiif_base,
        tile_size: DEFAULT_IIIF_TILE_SIZE,
        jpeg_quality: DEFAULT_IIIF_JPEG_QUALITY,
    };
    upload_artifact(
        state,
        &release_prefix,
        manifest_artifact(annotations, &layout, &target, "Tessera image map")?,
    )
    .await?;

    if latest_job_id(state).await?.as_deref() != Some(&message.job_id) {
        mark_status(state, &message.job_id, "SUPERSEDED", None, None).await?;
        return Ok(());
    }

    let current = CurrentRelease {
        schema_version: 1,
        generation_id: &message.job_id,
        source_revision: &message.source_revision,
        preview_url: format!("{release_url}/collage.webp"),
        manifest_url: format!("{public_iiif_base}/manifest.json"),
        published_at: Utc::now().to_rfc3339(),
    };
    state
        .s3
        .put_object()
        .bucket(&state.release_bucket)
        .key("current.json")
        .content_type("application/json")
        .cache_control("no-store,max-age=0")
        .body(ByteStream::from(serde_json::to_vec_pretty(&current)?))
        .send()
        .await?;
    mark_status(
        state,
        &message.job_id,
        "SUCCEEDED",
        Some(&release_url),
        None,
    )
    .await?;
    tracing::info!(job_id = message.job_id, event = "generation_succeeded");
    Ok(())
}

async fn handle_record(state: &State, record: &SqsMessage) -> WorkerResult<()> {
    let message: GenerationMessage = serde_json::from_str(
        record
            .body
            .as_deref()
            .ok_or("generation message has no body")?,
    )?;
    process_job(state, &message).await
}

async fn handler(
    event: LambdaEvent<SqsEvent>,
    state: Arc<State>,
) -> Result<SqsBatchResponse, Error> {
    let mut failures = Vec::new();
    for record in event.payload.records {
        if let Err(error) = handle_record(&state, &record).await {
            let count = receive_count(&record);
            let job_id = record
                .body
                .as_deref()
                .and_then(|body| serde_json::from_str::<GenerationMessage>(body).ok())
                .map(|message| message.job_id);
            tracing::error!(?error, receive_count = count, job_id);
            if let Some(job_id) = job_id {
                let status = if count >= 5 { "FAILED" } else { "RETRYING" };
                if let Err(status_error) =
                    mark_status(&state, &job_id, status, None, Some("GENERATION_FAILED")).await
                {
                    tracing::error!(?status_error, job_id, event = "status_update_failed");
                }
            }
            failures.push(BatchItemFailure {
                item_identifier: record.message_id.unwrap_or_default(),
            });
        }
    }
    Ok(SqsBatchResponse {
        batch_item_failures: failures,
    })
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .json()
        .with_max_level(tracing::Level::INFO)
        .init();
    let config = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let r2_bucket = required_environment("R2_BUCKET_NAME")?;
    let r2_config = aws_sdk_s3::config::Builder::from(&config)
        .endpoint_url(required_environment("R2_ENDPOINT")?)
        .region(Region::new("auto"))
        .credentials_provider(Credentials::new(
            required_environment("R2_ACCESS_KEY_ID")?,
            required_environment("R2_SECRET_ACCESS_KEY")?,
            None,
            None,
            "r2",
        ))
        .force_path_style(true)
        .build();
    let state = Arc::new(State {
        s3: aws_sdk_s3::Client::from_conf(r2_config),
        dynamodb: aws_sdk_dynamodb::Client::new(&config),
        input_bucket: r2_bucket.clone(),
        release_bucket: r2_bucket,
        jobs_table: required_environment("JOBS_TABLE_NAME")?,
        release_base_url: required_environment("RELEASE_BASE_URL")?,
        source_batch_size: environment_usize("SOURCE_BATCH_SIZE", 4),
        upload_concurrency: environment_usize("ARTIFACT_UPLOAD_CONCURRENCY", 16),
    });
    run(service_fn(move |event| handler(event, Arc::clone(&state)))).await
}
