use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, GenericImageView, ImageBuffer, ImageFormat, Rgba};
use libwebp_sys::WebPConfig;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::env;
use std::fs::File;
use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};
use std::time::Instant;
use webp::Encoder as WebPEncoder;

const DEFAULT_IIIF_TILE_SIZE: u32 = 1024;
const DEFAULT_IIIF_JPEG_QUALITY: u8 = 82;

#[derive(Clone, Deserialize, Serialize)]
struct ImageCoords {
    x: u32,
    y: u32,
    width: u32,
}

struct IiifPublication<'a> {
    output: &'a Path,
    public_base_url: &'a str,
    canvas_width: u32,
    canvas_height: u32,
    tile_size: u32,
    jpeg_quality: u8,
    label: &'a str,
}

#[derive(Clone, Debug, PartialEq)]
struct TileRequest {
    region_x: u32,
    region_y: u32,
    region_width: u32,
    region_height: u32,
    output_width: u32,
    output_height: u32,
}

fn image_paths(path: &Path) -> Vec<PathBuf> {
    let mut paths: Vec<_> = std::fs::read_dir(path)
        .unwrap_or_else(|error| panic!("could not read {}: {error}", path.display()))
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.is_file())
        .collect();
    paths.sort_unstable();
    paths
}

fn create_collage(
    path: &Path,
    width: u32,
    depth_arr: &[i32],
    path_arr: &[Vec<i32>],
) -> (ImageBuffer<Rgba<u8>, Vec<u8>>, Vec<ImageCoords>) {
    let dimensions = 2u32.pow((max_depth(depth_arr) + 1) as u32);
    let imgx = width * dimensions;
    let imgy = width * dimensions;
    let mut imgbuf = image::ImageBuffer::new(imgx, imgy);
    println!("Image size: {dimensions}x{dimensions}");
    println!("Image pixels: {imgx}x{imgy}");

    let paths = image_paths(path);
    assert_eq!(
        paths.len(),
        depth_arr.len(),
        "the image count must match the number of leaves in the grid"
    );

    let coords_vec: Vec<_> = depth_arr
        .iter()
        .zip(path_arr)
        .map(|(&depth, path)| {
            let (x, y) = calculate_coords(path, imgx);
            ImageCoords {
                x,
                y,
                width: width * 2u32.pow((7 - depth) as u32),
            }
        })
        .collect();

    let batch_size = rayon::current_num_threads().max(1);
    for (batch_index, path_batch) in paths.chunks(batch_size).enumerate() {
        let offset = batch_index * batch_size;
        let images: Vec<_> = path_batch
            .par_iter()
            .enumerate()
            .map(|(index, path)| {
                let target_width = coords_vec[offset + index].width;
                image::open(path).unwrap().resize_to_fill(
                    target_width,
                    target_width,
                    image::imageops::FilterType::Lanczos3,
                )
            })
            .collect();

        for (index, img) in images.iter().enumerate() {
            let coords = &coords_vec[offset + index];
            image::imageops::replace(&mut imgbuf, img, coords.x as i64, coords.y as i64);
        }
    }

    let coord_writer = File::create("output/coords.json").unwrap();
    serde_json::to_writer_pretty(coord_writer, &coords_vec).unwrap();

    (imgbuf, coords_vec)
}

fn save_subimages(
    imgbuf: &ImageBuffer<Rgba<u8>, Vec<u8>>,
    img_width: u32,
    img_height: u32,
    divisions: u32,
) {
    let encoder_jobs = env::var("COLLAGE_ENCODER_JOBS")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(1)
        .clamp(1, divisions as usize);

    for start in (0..divisions).step_by(encoder_jobs) {
        let end = (start + encoder_jobs as u32).min(divisions);
        (start..end).into_par_iter().for_each(|i| {
            let x = (i % divisions) * (img_width / divisions);
            let y = (i / divisions) * (img_height / divisions);
            let subimgbuf = imgbuf
                .view(x, y, img_width / divisions, img_height / divisions)
                .to_image();
            let mut config = WebPConfig::new().unwrap();
            config.lossless = 0;
            config.alpha_compression = 1;
            config.quality = 80.0;
            config.thread_level = 1;
            let encoded =
                WebPEncoder::from_rgba(subimgbuf.as_raw(), subimgbuf.width(), subimgbuf.height())
                    .encode_advanced(&config)
                    .expect("failed to encode WebP subimage");
            let mut writer = File::create(format!("output/collage-sub{i}.webp")).unwrap();
            writer.write_all(&encoded).unwrap();
        });
    }
}

fn square_crop(path: &Path) -> DynamicImage {
    let image = image::open(path)
        .unwrap_or_else(|error| panic!("could not decode {}: {error}", path.display()));
    let edge = image.width().min(image.height());
    image.crop_imm(
        (image.width() - edge) / 2,
        (image.height() - edge) / 2,
        edge,
        edge,
    )
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

fn tile_requests(width: u32, height: u32, tile_size: u32, factor: u32) -> Vec<TileRequest> {
    let source_step = tile_size * factor;
    let mut requests = Vec::new();

    for row in 0..height.div_ceil(source_step) {
        for column in 0..width.div_ceil(source_step) {
            let region_x = column * source_step;
            let region_y = row * source_step;
            let region_width = source_step.min(width - region_x);
            let region_height = source_step.min(height - region_y);
            requests.push(TileRequest {
                region_x,
                region_y,
                region_width,
                region_height,
                output_width: region_width.div_ceil(factor),
                output_height: region_height.div_ceil(factor),
            });
        }
    }

    requests
}

fn save_jpeg(image: &DynamicImage, path: &Path, quality: u8) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }

    let writer = File::create(path)
        .unwrap_or_else(|error| panic!("could not create {}: {error}", path.display()));
    let mut encoder = JpegEncoder::new_with_quality(writer, quality);
    encoder
        .encode_image(image)
        .unwrap_or_else(|error| panic!("could not encode {}: {error}", path.display()));
}

fn publish_image_service(
    source_path: &Path,
    identifier: &str,
    publication: &IiifPublication,
) -> Value {
    let source = square_crop(source_path);
    let width = source.width();
    let height = source.height();
    let service_id = format!(
        "{}/3/{identifier}",
        publication.public_base_url.trim_end_matches('/')
    );
    let service_path = publication.output.join("3").join(identifier);
    let factors = scale_factors(width, height, publication.tile_size);

    for &factor in &factors {
        for request in tile_requests(width, height, publication.tile_size, factor) {
            let region = source.crop_imm(
                request.region_x,
                request.region_y,
                request.region_width,
                request.region_height,
            );
            let tile = if factor == 1 {
                region
            } else {
                region.resize_exact(
                    request.output_width,
                    request.output_height,
                    image::imageops::FilterType::Lanczos3,
                )
            };
            let tile_path = service_path
                .join(format!(
                    "{},{},{},{}",
                    request.region_x,
                    request.region_y,
                    request.region_width,
                    request.region_height
                ))
                .join(format!(
                    "{},{}",
                    request.output_width, request.output_height
                ))
                .join("0")
                .join("default.jpg");
            save_jpeg(&tile, &tile_path, publication.jpeg_quality);
        }
    }

    let mut sizes = Vec::new();
    for requested_size in [256, 512, 1024] {
        let size = requested_size.min(width);
        if sizes
            .iter()
            .any(|entry: &Value| entry["width"].as_u64() == Some(u64::from(size)))
        {
            continue;
        }

        let thumbnail = source.resize_exact(size, size, image::imageops::FilterType::Lanczos3);
        save_jpeg(
            &thumbnail,
            &service_path
                .join("full")
                .join(format!("{size},{size}"))
                .join("0")
                .join("default.jpg"),
            publication.jpeg_quality,
        );
        sizes.push(json!({"width": size, "height": size}));
    }

    let service = json!({
        "id": service_id,
        "type": "ImageService3",
        "protocol": "http://iiif.io/api/image",
        "profile": "level0",
        "width": width,
        "height": height,
        "tiles": [{
            "width": publication.tile_size,
            "scaleFactors": factors,
        }],
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
    let writer = File::create(service_path.join("info.json")).unwrap();
    serde_json::to_writer_pretty(writer, &info).unwrap();

    service
}

fn publish_iiif(placements: &[(PathBuf, ImageCoords)], publication: &IiifPublication) {
    if publication.output.exists() {
        std::fs::remove_dir_all(publication.output).unwrap();
    }
    std::fs::create_dir_all(publication.output).unwrap();
    let base_url = publication.public_base_url.trim_end_matches('/');
    let canvas_id = format!("{base_url}/canvas");
    let mut annotations = Vec::with_capacity(placements.len());

    for (index, (source_path, coords)) in placements.iter().enumerate() {
        println!(
            "Publishing IIIF image {}/{}: {}",
            index + 1,
            placements.len(),
            source_path.display()
        );
        let service = publish_image_service(source_path, &index.to_string(), publication);
        let thumbnail_size = service["sizes"]
            .as_array()
            .and_then(|sizes| sizes.last())
            .and_then(|size| size["width"].as_u64())
            .unwrap_or(256);
        annotations.push(json!({
            "id": format!("{base_url}/annotation/{index}"),
            "type": "Annotation",
            "motivation": "painting",
            "target": format!(
                "{canvas_id}#xywh={},{},{},{}",
                coords.x, coords.y, coords.width, coords.width
            ),
            "body": {
                "id": format!(
                    "{}/full/{thumbnail_size},{thumbnail_size}/0/default.jpg",
                    service["id"].as_str().unwrap()
                ),
                "type": "Image",
                "format": "image/jpeg",
                "width": thumbnail_size,
                "height": thumbnail_size,
                "service": [service],
            },
        }));
    }

    let manifest = json!({
        "@context": "http://iiif.io/api/presentation/3/context.json",
        "id": format!("{base_url}/manifest.json"),
        "type": "Manifest",
        "label": {"en": [publication.label]},
        "items": [{
            "id": canvas_id,
            "type": "Canvas",
            "width": publication.canvas_width,
            "height": publication.canvas_height,
            "items": [{
                "id": format!("{base_url}/page"),
                "type": "AnnotationPage",
                "items": annotations,
            }],
        }],
    });
    let writer = File::create(publication.output.join("manifest.json")).unwrap();
    serde_json::to_writer_pretty(writer, &manifest).unwrap();
}

fn option_value(args: &[String], name: &str) -> Option<String> {
    args.windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| pair[1].clone())
}

fn run_publish_grid(args: &[String]) {
    let images = PathBuf::from(
        option_value(args, "--images").expect("publish-grid requires --images <directory>"),
    );
    let output = PathBuf::from(
        option_value(args, "--output").expect("publish-grid requires --output <directory>"),
    );
    let public_base_url = option_value(args, "--base-url").unwrap_or_else(|| "/iiif".into());
    let canvas_width = option_value(args, "--canvas-width")
        .map(|value| value.parse().expect("--canvas-width must be an integer"))
        .unwrap_or(7680);
    let columns: u32 = option_value(args, "--columns")
        .map(|value| value.parse().expect("--columns must be an integer"))
        .unwrap_or(3);
    let tile_size = option_value(args, "--tile-size")
        .map(|value| value.parse().expect("--tile-size must be an integer"))
        .unwrap_or(DEFAULT_IIIF_TILE_SIZE);
    let jpeg_quality = option_value(args, "--jpeg-quality")
        .map(|value| value.parse().expect("--jpeg-quality must be an integer"))
        .unwrap_or(DEFAULT_IIIF_JPEG_QUALITY);
    let paths = image_paths(&images);
    assert!(!paths.is_empty(), "--images must contain at least one image");
    assert!(columns > 0, "--columns must be greater than zero");
    let rows = (paths.len() as u32).div_ceil(columns);
    let cell_width = canvas_width / columns;
    let canvas_height = rows * cell_width;
    let placements: Vec<_> = paths
        .into_iter()
        .enumerate()
        .map(|(index, path)| {
            let index = index as u32;
            (
                path,
                ImageCoords {
                    x: (index % columns) * cell_width,
                    y: (index / columns) * cell_width,
                    width: cell_width,
                },
            )
        })
        .collect();

    if let Some(preview_output) = option_value(args, "--preview-output") {
        let preview_output = PathBuf::from(preview_output);
        if let Some(parent) = preview_output.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        let mut preview = ImageBuffer::new(canvas_width, canvas_height);
        for (source_path, coords) in &placements {
            let image = image::open(source_path).unwrap().resize_to_fill(
                coords.width,
                coords.width,
                image::imageops::FilterType::Lanczos3,
            );
            image::imageops::replace(
                &mut preview,
                &image,
                coords.x as i64,
                coords.y as i64,
            );
        }
        DynamicImage::ImageRgba8(preview)
            .save_with_format(preview_output, ImageFormat::WebP)
            .unwrap();
    }

    if let Some(coords_output) = option_value(args, "--coords-output") {
        let coords_output = PathBuf::from(coords_output);
        if let Some(parent) = coords_output.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        let writer = File::create(coords_output).unwrap();
        let coords: Vec<_> = placements.iter().map(|(_, coords)| coords).collect();
        serde_json::to_writer_pretty(writer, &coords).unwrap();
    }

    publish_iiif(
        &placements,
        &IiifPublication {
            output: &output,
            public_base_url: &public_base_url,
            canvas_width,
            canvas_height,
            tile_size,
            jpeg_quality,
            label: "Tessera deep-zoom showcase",
        },
    );
}

fn parse_json(path: &Path) -> Value {
    let reader = BufReader::new(File::open(path).unwrap());
    serde_json::from_reader(reader).expect("JSON was not well-formatted")
}

fn traverse_json(json: &Value, arr: &mut Vec<i32>, path_arr: &mut Vec<Vec<i32>>) {
    traverse_json_rec(
        json.as_object().unwrap(),
        0,
        arr,
        path_arr,
        &mut Vec::new(),
    );
}

fn traverse_json_rec(
    json: &Map<String, Value>,
    depth: i32,
    arr: &mut Vec<i32>,
    path_arr: &mut Vec<Vec<i32>>,
    current_path: &mut Vec<i32>,
) {
    for (key, value) in json {
        current_path.push(key.parse::<i32>().unwrap());
        if value.is_null() {
            arr.push(depth);
            path_arr.push(current_path.clone());
        } else {
            traverse_json_rec(
                value.as_object().unwrap(),
                depth + 1,
                arr,
                path_arr,
                current_path,
            );
        }
        current_path.pop();
    }
}

fn calculate_coords(path_arr: &[i32], image_width: u32) -> (u32, u32) {
    let mut x = 0;
    let mut y = 0;
    let mut step = image_width;
    for num in path_arr {
        step /= 2;
        match num {
            1 => {}
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

fn max_depth(arr: &[i32]) -> i32 {
    arr.iter().copied().max().unwrap_or(0)
}

fn run_collage() {
    let image_path = Path::new("input/10k");
    let json_path = Path::new("input/grid.json");
    std::fs::create_dir_all("output").unwrap();

    let start = Instant::now();
    let json = parse_json(json_path);
    let mut depth_arr = Vec::new();
    let mut path_arr = Vec::new();
    traverse_json(&json, &mut depth_arr, &mut path_arr);
    println!("Grid parse: {:.3}s", start.elapsed().as_secs_f64());

    let collage_start = Instant::now();
    let (image, coords) = create_collage(image_path, 120, &depth_arr, &path_arr);
    println!(
        "Collage creation: {:.3}s",
        collage_start.elapsed().as_secs_f64()
    );

    let image_width = image.width();
    let image_height = image.height();
    let encoding_start = Instant::now();
    save_subimages(&image, image_width, image_height, 3);
    println!(
        "WebP encoding: {:.3}s",
        encoding_start.elapsed().as_secs_f64()
    );

    let public_base_url = env::var("IIIF_PUBLIC_BASE_URL").unwrap_or_else(|_| "/iiif".into());
    let paths = image_paths(image_path);
    let placements: Vec<_> = paths.into_iter().zip(coords).collect();
    publish_iiif(
        &placements,
        &IiifPublication {
            output: Path::new("output/iiif"),
            public_base_url: &public_base_url,
            canvas_width: image_width,
            canvas_height: image_height,
            tile_size: DEFAULT_IIIF_TILE_SIZE,
            jpeg_quality: DEFAULT_IIIF_JPEG_QUALITY,
            label: "Tessera image map",
        },
    );
    println!("Time taken: {:.3}s", start.elapsed().as_secs_f64());
}

fn main() {
    let args: Vec<_> = env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("publish-grid") {
        run_publish_grid(&args[1..]);
    } else {
        run_collage();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scale_factors_cover_the_full_pyramid() {
        assert_eq!(scale_factors(4266, 4266, 1024), vec![1, 2, 4, 8]);
        assert_eq!(scale_factors(500, 500, 1024), vec![1]);
    }

    #[test]
    fn edge_tiles_use_canonical_region_and_size_values() {
        let requests = tile_requests(2500, 1800, 1024, 2);
        assert_eq!(requests.len(), 2);
        assert_eq!(
            requests[1],
            TileRequest {
                region_x: 2048,
                region_y: 0,
                region_width: 452,
                region_height: 1800,
                output_width: 226,
                output_height: 900,
            }
        );
    }
}
