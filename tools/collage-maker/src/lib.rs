use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, ImageBuffer, Rgba};
use libwebp_sys::WebPConfig;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use webp::Encoder as WebPEncoder;

pub const DEFAULT_IIIF_TILE_SIZE: u32 = 1024;
pub const DEFAULT_IIIF_JPEG_QUALITY: u8 = 82;
pub const DEFAULT_PREVIEW_MAX_EDGE: u32 = 4096;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageCoords {
    pub x: u32,
    pub y: u32,
    pub width: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotImage {
    pub id: String,
    pub key: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollageSnapshot {
    pub schema_version: u8,
    pub source_revision: String,
    pub grid_key: String,
    pub base_tile_width: u32,
    pub preview_max_edge: u32,
    pub images: Vec<SnapshotImage>,
}

#[derive(Clone, Debug)]
pub struct ReleaseLayout {
    pub width: u32,
    pub height: u32,
    pub preview_width: u32,
    pub preview_height: u32,
    pub placements: Vec<ImageCoords>,
}

#[derive(Debug)]
pub struct Artifact {
    pub key: String,
    pub body: Vec<u8>,
    pub content_type: &'static str,
}

pub struct ProcessedImage {
    pub preview_patch: DynamicImage,
    pub preview_x: u32,
    pub preview_y: u32,
    pub artifacts: Vec<Artifact>,
    pub annotation: Value,
}

pub struct IiifTarget<'a> {
    pub artifact_prefix: &'a str,
    pub public_base_url: &'a str,
    pub tile_size: u32,
    pub jpeg_quality: u8,
}

pub struct LocalPublication<'a> {
    pub iiif_output: &'a Path,
    pub preview_output: &'a Path,
    pub coords_output: Option<&'a Path>,
    pub public_iiif_base_url: &'a str,
    pub tile_size: u32,
    pub jpeg_quality: u8,
    pub label: &'a str,
}

#[derive(Clone)]
struct GridLeaf {
    depth: u32,
    path: Vec<u32>,
}

fn traverse_grid(
    value: &Value,
    depth: u32,
    path: &mut Vec<u32>,
    leaves: &mut Vec<GridLeaf>,
) -> Result<(), String> {
    let object = value
        .as_object()
        .ok_or_else(|| "each non-leaf grid value must be an object".to_string())?;
    if object.len() != 4 || (1..=4).any(|quadrant| !object.contains_key(&quadrant.to_string())) {
        return Err("each grid object must contain exactly quadrants 1, 2, 3, and 4".into());
    }

    for quadrant in 1..=4 {
        let child = &object[&quadrant.to_string()];
        path.push(quadrant);
        if child.is_null() {
            leaves.push(GridLeaf {
                depth,
                path: path.clone(),
            });
        } else {
            traverse_grid(child, depth + 1, path, leaves)?;
        }
        path.pop();
    }
    Ok(())
}

fn calculate_coords(path: &[u32], image_width: u32) -> (u32, u32) {
    let mut x = 0;
    let mut y = 0;
    let mut step = image_width;
    for quadrant in path {
        step /= 2;
        match quadrant {
            2 => x += step,
            3 => y += step,
            4 => {
                x += step;
                y += step;
            }
            _ => {}
        }
    }
    (x, y)
}

fn preview_dimensions(width: u32, height: u32, max_edge: u32) -> (u32, u32) {
    if width.max(height) <= max_edge {
        return (width, height);
    }
    if width >= height {
        (
            max_edge,
            (u64::from(height) * u64::from(max_edge) / u64::from(width)) as u32,
        )
    } else {
        (
            (u64::from(width) * u64::from(max_edge) / u64::from(height)) as u32,
            max_edge,
        )
    }
}

pub fn layout_from_grid(
    grid: &Value,
    base_tile_width: u32,
    preview_max_edge: u32,
) -> Result<ReleaseLayout, String> {
    if base_tile_width == 0 {
        return Err("baseTileWidth must be greater than zero".into());
    }
    if !(256..=DEFAULT_PREVIEW_MAX_EDGE).contains(&preview_max_edge) {
        return Err(format!(
            "previewMaxEdge must be between 256 and {DEFAULT_PREVIEW_MAX_EDGE}"
        ));
    }

    let mut leaves = Vec::new();
    traverse_grid(grid, 0, &mut Vec::new(), &mut leaves)?;
    let max_depth = leaves.iter().map(|leaf| leaf.depth).max().unwrap_or(0);
    let dimensions = 2u32
        .checked_pow(max_depth + 1)
        .ok_or_else(|| "grid is too deep".to_string())?;
    let width = base_tile_width
        .checked_mul(dimensions)
        .ok_or_else(|| "grid dimensions overflow".to_string())?;
    let placements = leaves
        .into_iter()
        .map(|leaf| {
            let (x, y) = calculate_coords(&leaf.path, width);
            ImageCoords {
                x,
                y,
                width: base_tile_width * 2u32.pow(max_depth - leaf.depth),
            }
        })
        .collect();
    let (preview_width, preview_height) = preview_dimensions(width, width, preview_max_edge);
    Ok(ReleaseLayout {
        width,
        height: width,
        preview_width,
        preview_height,
        placements,
    })
}

pub fn regular_grid_layout(
    image_count: usize,
    canvas_width: u32,
    columns: u32,
    preview_max_edge: u32,
) -> Result<ReleaseLayout, String> {
    if image_count == 0 || canvas_width == 0 || columns == 0 {
        return Err("image count, canvas width, and columns must be greater than zero".into());
    }
    let rows = (image_count as u32).div_ceil(columns);
    let cell_width = canvas_width / columns;
    if cell_width == 0 {
        return Err("canvas width must be at least the column count".into());
    }
    let height = rows * cell_width;
    let placements = (0..image_count as u32)
        .map(|index| ImageCoords {
            x: (index % columns) * cell_width,
            y: (index / columns) * cell_width,
            width: cell_width,
        })
        .collect();
    let (preview_width, preview_height) =
        preview_dimensions(canvas_width, height, preview_max_edge);
    Ok(ReleaseLayout {
        width: canvas_width,
        height,
        preview_width,
        preview_height,
        placements,
    })
}

pub fn validate_snapshot(
    snapshot: &CollageSnapshot,
    expected_revision: &str,
    placement_count: usize,
) -> Result<(), String> {
    if snapshot.schema_version != 1 {
        return Err("unsupported snapshot schema version".into());
    }
    if snapshot.source_revision != expected_revision {
        return Err("snapshot sourceRevision does not match the job".into());
    }
    if snapshot.images.len() != placement_count {
        return Err("snapshot image count does not match grid leaf count".into());
    }
    if snapshot.base_tile_width == 0
        || !(256..=DEFAULT_PREVIEW_MAX_EDGE).contains(&snapshot.preview_max_edge)
    {
        return Err("snapshot dimensions are outside supported limits".into());
    }

    let prefix = format!("snapshots/{expected_revision}/");
    if !snapshot.grid_key.starts_with(&prefix) {
        return Err("gridKey must stay inside the revision prefix".into());
    }
    let mut ids = HashSet::new();
    for image in &snapshot.images {
        if image.id.is_empty()
            || image.id.len() > 128
            || !image
                .id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        {
            return Err(
                "image ids may contain only letters, numbers, dots, underscores, and dashes".into(),
            );
        }
        if !ids.insert(&image.id) {
            return Err("image ids must be unique".into());
        }
        if !image.key.starts_with(&prefix) {
            return Err("image keys must stay inside the revision prefix".into());
        }
    }
    Ok(())
}

fn scale_factors(width: u32, height: u32, tile_size: u32) -> Vec<u32> {
    let mut factors = vec![1];
    let mut factor = 1;
    let longest_edge = width.max(height);
    while longest_edge.div_ceil(factor) > tile_size {
        factor *= 2;
        factors.push(factor);
    }
    factors
}

fn encode_jpeg(image: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut bytes, quality)
        .encode_image(image)
        .map_err(|error| format!("could not encode JPEG: {error}"))?;
    Ok(bytes)
}

pub fn encode_preview(image: &ImageBuffer<Rgba<u8>, Vec<u8>>) -> Result<Vec<u8>, String> {
    let mut config = WebPConfig::new().map_err(|_| "could not create WebP config".to_string())?;
    config.lossless = 0;
    config.alpha_compression = 1;
    config.quality = 80.0;
    config.thread_level = 1;
    WebPEncoder::from_rgba(image.as_raw(), image.width(), image.height())
        .encode_advanced(&config)
        .map(|bytes| bytes.to_vec())
        .map_err(|error| format!("could not encode preview: {error:?}"))
}

fn artifact_key(prefix: &str, suffix: impl AsRef<str>) -> String {
    if prefix.is_empty() {
        suffix.as_ref().to_string()
    } else {
        format!(
            "{}/{suffix}",
            prefix.trim_end_matches('/'),
            suffix = suffix.as_ref()
        )
    }
}

fn scaled_edge(value: u32, preview_size: u32, logical_size: u32) -> u32 {
    ((u64::from(value) * u64::from(preview_size) + u64::from(logical_size / 2))
        / u64::from(logical_size)) as u32
}

pub fn process_image(
    bytes: &[u8],
    identifier: &str,
    coords: &ImageCoords,
    layout: &ReleaseLayout,
    target: &IiifTarget<'_>,
) -> Result<ProcessedImage, String> {
    let decoded = image::load_from_memory(bytes)
        .map_err(|error| format!("could not decode image {identifier}: {error}"))?;
    let edge = decoded.width().min(decoded.height());
    let source = decoded.crop_imm(
        (decoded.width() - edge) / 2,
        (decoded.height() - edge) / 2,
        edge,
        edge,
    );
    let width = source.width();
    let height = source.height();
    let service_id = format!(
        "{}/3/{identifier}",
        target.public_base_url.trim_end_matches('/')
    );
    let service_prefix = format!("3/{identifier}");
    let factors = scale_factors(width, height, target.tile_size);
    let mut artifacts = Vec::new();

    for &factor in &factors {
        let source_step = target.tile_size * factor;
        for row in 0..height.div_ceil(source_step) {
            for column in 0..width.div_ceil(source_step) {
                let region_x = column * source_step;
                let region_y = row * source_step;
                let region_width = source_step.min(width - region_x);
                let region_height = source_step.min(height - region_y);
                let output_width = region_width.div_ceil(factor);
                let output_height = region_height.div_ceil(factor);
                let region = source.crop_imm(region_x, region_y, region_width, region_height);
                let tile = if factor == 1 {
                    region
                } else {
                    region.resize_exact(
                        output_width,
                        output_height,
                        image::imageops::FilterType::Lanczos3,
                    )
                };
                artifacts.push(Artifact {
                    key: artifact_key(
                        target.artifact_prefix,
                        format!(
                            "{service_prefix}/{region_x},{region_y},{region_width},{region_height}/{output_width},{output_height}/0/default.jpg"
                        ),
                    ),
                    body: encode_jpeg(&tile, target.jpeg_quality)?,
                    content_type: "image/jpeg",
                });
            }
        }
    }

    let mut sizes = Vec::new();
    let mut seen_sizes = HashSet::new();
    for requested_size in [256, 512, 1024] {
        let size = requested_size.min(width);
        if !seen_sizes.insert(size) {
            continue;
        }
        let thumbnail = source.resize_exact(size, size, image::imageops::FilterType::Lanczos3);
        artifacts.push(Artifact {
            key: artifact_key(
                target.artifact_prefix,
                format!("{service_prefix}/full/{size},{size}/0/default.jpg"),
            ),
            body: encode_jpeg(&thumbnail, target.jpeg_quality)?,
            content_type: "image/jpeg",
        });
        sizes.push(json!({"width": size, "height": size}));
    }

    let service = json!({
        "id": service_id,
        "type": "ImageService3",
        "protocol": "http://iiif.io/api/image",
        "profile": "level0",
        "width": width,
        "height": height,
        "tiles": [{"width": target.tile_size, "scaleFactors": factors}],
        "sizes": sizes,
        "preferredFormats": ["jpg"],
    });
    let info = json!({
        "@context": "http://iiif.io/api/image/3/context.json",
        "id": service["id"],
        "type": service["type"],
        "protocol": service["protocol"],
        "profile": service["profile"],
        "width": service["width"],
        "height": service["height"],
        "tiles": service["tiles"],
        "sizes": service["sizes"],
        "preferredFormats": service["preferredFormats"],
    });
    artifacts.push(Artifact {
        key: artifact_key(
            target.artifact_prefix,
            format!("{service_prefix}/info.json"),
        ),
        body: serde_json::to_vec_pretty(&info)
            .map_err(|error| format!("could not encode info.json: {error}"))?,
        content_type: "application/json",
    });

    let thumbnail_size = seen_sizes.into_iter().max().unwrap_or(256);
    let canvas_id = format!("{}/canvas", target.public_base_url.trim_end_matches('/'));
    let annotation = json!({
        "id": format!("{}/annotation/{identifier}", target.public_base_url.trim_end_matches('/')),
        "type": "Annotation",
        "motivation": "painting",
        "target": format!("{canvas_id}#xywh={},{},{},{}", coords.x, coords.y, coords.width, coords.width),
        "body": {
            "id": format!("{service_id}/full/{thumbnail_size},{thumbnail_size}/0/default.jpg"),
            "type": "Image",
            "format": "image/jpeg",
            "width": thumbnail_size,
            "height": thumbnail_size,
            "service": [service],
        },
    });

    let preview_x = scaled_edge(coords.x, layout.preview_width, layout.width);
    let preview_y = scaled_edge(coords.y, layout.preview_height, layout.height);
    let preview_right = scaled_edge(coords.x + coords.width, layout.preview_width, layout.width);
    let preview_bottom = scaled_edge(
        coords.y + coords.width,
        layout.preview_height,
        layout.height,
    );
    let preview_patch = source.resize_to_fill(
        (preview_right - preview_x).max(1),
        (preview_bottom - preview_y).max(1),
        image::imageops::FilterType::Lanczos3,
    );

    Ok(ProcessedImage {
        preview_patch,
        preview_x,
        preview_y,
        artifacts,
        annotation,
    })
}

pub fn manifest_artifact(
    annotations: Vec<Value>,
    layout: &ReleaseLayout,
    target: &IiifTarget<'_>,
    label: &str,
) -> Result<Artifact, String> {
    let base_url = target.public_base_url.trim_end_matches('/');
    let manifest = json!({
        "@context": "http://iiif.io/api/presentation/3/context.json",
        "id": format!("{base_url}/manifest.json"),
        "type": "Manifest",
        "label": {"en": [label]},
        "items": [{
            "id": format!("{base_url}/canvas"),
            "type": "Canvas",
            "width": layout.width,
            "height": layout.height,
            "items": [{
                "id": format!("{base_url}/page"),
                "type": "AnnotationPage",
                "items": annotations,
            }],
        }],
    });
    Ok(Artifact {
        key: artifact_key(target.artifact_prefix, "manifest.json"),
        body: serde_json::to_vec_pretty(&manifest)
            .map_err(|error| format!("could not encode manifest: {error}"))?,
        content_type: "application/json",
    })
}

fn write_artifact(root: &Path, artifact: Artifact) -> Result<(), String> {
    let path = root.join(artifact.key);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
    }
    File::create(&path)
        .and_then(|mut file| file.write_all(&artifact.body))
        .map_err(|error| format!("could not write {}: {error}", path.display()))
}

pub fn publish_local(
    paths: &[PathBuf],
    layout: &ReleaseLayout,
    publication: &LocalPublication<'_>,
) -> Result<(), String> {
    if paths.len() != layout.placements.len() {
        return Err("image count must match placement count".into());
    }
    std::fs::create_dir_all(publication.iiif_output)
        .map_err(|error| format!("could not create IIIF output: {error}"))?;
    let target = IiifTarget {
        artifact_prefix: "",
        public_base_url: publication.public_iiif_base_url,
        tile_size: publication.tile_size,
        jpeg_quality: publication.jpeg_quality,
    };
    let mut preview = ImageBuffer::new(layout.preview_width, layout.preview_height);
    let mut annotations = Vec::with_capacity(paths.len());

    for (index, (path, coords)) in paths.iter().zip(&layout.placements).enumerate() {
        println!(
            "Publishing image {}/{}: {}",
            index + 1,
            paths.len(),
            path.display()
        );
        let bytes = std::fs::read(path)
            .map_err(|error| format!("could not read {}: {error}", path.display()))?;
        let processed = process_image(&bytes, &index.to_string(), coords, layout, &target)?;
        image::imageops::replace(
            &mut preview,
            &processed.preview_patch,
            processed.preview_x as i64,
            processed.preview_y as i64,
        );
        for artifact in processed.artifacts {
            write_artifact(publication.iiif_output, artifact)?;
        }
        annotations.push(processed.annotation);
    }

    write_artifact(
        publication.iiif_output,
        manifest_artifact(annotations, layout, &target, publication.label)?,
    )?;
    if let Some(parent) = publication.preview_output.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("could not create preview output: {error}"))?;
    }
    let preview_bytes = encode_preview(&preview)?;
    File::create(publication.preview_output)
        .and_then(|mut file| file.write_all(&preview_bytes))
        .map_err(|error| format!("could not write preview: {error}"))?;
    if let Some(coords_output) = publication.coords_output {
        if let Some(parent) = coords_output.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("could not create coords output: {error}"))?;
        }
        let writer = File::create(coords_output)
            .map_err(|error| format!("could not create coords output: {error}"))?;
        serde_json::to_writer_pretty(writer, &layout.placements)
            .map_err(|error| format!("could not write coords: {error}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageFormat, RgbImage};
    use serde_json::json;
    use std::io::Cursor;

    fn simple_grid() -> Value {
        json!({"1": null, "2": null, "3": null, "4": null})
    }

    #[test]
    fn grid_traversal_is_deterministic() {
        let layout = layout_from_grid(&simple_grid(), 120, 4096).unwrap();
        assert_eq!(layout.width, 240);
        assert_eq!(
            layout.placements,
            vec![
                ImageCoords {
                    x: 0,
                    y: 0,
                    width: 120
                },
                ImageCoords {
                    x: 120,
                    y: 0,
                    width: 120
                },
                ImageCoords {
                    x: 0,
                    y: 120,
                    width: 120
                },
                ImageCoords {
                    x: 120,
                    y: 120,
                    width: 120
                },
            ]
        );
    }

    #[test]
    fn malformed_grid_is_rejected() {
        assert!(layout_from_grid(&json!({"1": null}), 120, 4096).is_err());
    }

    #[test]
    fn preview_is_bounded_without_changing_logical_dimensions() {
        let layout = regular_grid_layout(9, 7680, 3, 4096).unwrap();
        assert_eq!((layout.width, layout.height), (7680, 7680));
        assert_eq!((layout.preview_width, layout.preview_height), (4096, 4096));
    }

    #[test]
    fn snapshot_keys_cannot_escape_the_revision() {
        let snapshot = CollageSnapshot {
            schema_version: 1,
            source_revision: "rev-1".into(),
            grid_key: "snapshots/rev-1/grid.json".into(),
            base_tile_width: 120,
            preview_max_edge: 4096,
            images: vec![SnapshotImage {
                id: "image-1".into(),
                key: "snapshots/another-revision/image.jpg".into(),
            }],
        };
        assert!(validate_snapshot(&snapshot, "rev-1", 1).is_err());
    }

    #[test]
    fn image_publication_uses_canonical_iiif_paths() {
        let image = RgbImage::from_pixel(32, 32, image::Rgb([20, 30, 40]));
        let mut bytes = Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(image)
            .write_to(&mut bytes, ImageFormat::Png)
            .unwrap();
        let layout = regular_grid_layout(1, 32, 1, 256).unwrap();
        let processed = process_image(
            bytes.get_ref(),
            "image-1",
            &layout.placements[0],
            &layout,
            &IiifTarget {
                artifact_prefix: "iiif",
                public_base_url: "https://cdn.example/releases/job/iiif",
                tile_size: 1024,
                jpeg_quality: 82,
            },
        )
        .unwrap();
        assert!(processed
            .artifacts
            .iter()
            .any(|artifact| artifact.key == "iiif/3/image-1/0,0,32,32/32,32/0/default.jpg"));
        assert_eq!(
            processed.annotation["target"],
            "https://cdn.example/releases/job/iiif/canvas#xywh=0,0,32,32"
        );
    }
}
