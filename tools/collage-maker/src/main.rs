use image::{GenericImageView, ImageBuffer, Rgba};
use libwebp_sys::WebPConfig;
use rayon::prelude::*;
use serde::Serialize;
use serde_json::{Map, Value};
use std::cmp::max;
use std::fs::File;
use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};
use std::time::Instant;
use webp::Encoder as WebPEncoder;

#[derive(Serialize)]
struct ImageCoords {
    x: u32,
    y: u32,
    width: u32,
}

fn crop_image(img: image::DynamicImage, nwidth: u32) -> image::DynamicImage {
    let width = max(img.width(), img.height());
    let mut nimg = img.crop_imm(0, 0, width, width);
    if width != nwidth {
        nimg = img.resize_to_fill(nwidth, nwidth, image::imageops::FilterType::Nearest);
    }

    nimg
}

fn image_paths(path: &Path) -> Vec<PathBuf> {
    let mut paths: Vec<_> = std::fs::read_dir(path)
        .unwrap()
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
) -> ImageBuffer<Rgba<u8>, Vec<u8>> {
    let dimensions = 2u32.pow((max_depth(depth_arr) + 1) as u32);
    let imgx = width * dimensions;
    let imgy = width * dimensions;
    let mut imgbuf = image::ImageBuffer::new(imgx, imgy);
    println!("Image size: {}x{}", dimensions, dimensions);
    println!("Image Pixels: {}x{}", imgx, imgy);

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

    // Parallelize the expensive decode/resize stage while bounding decoded-image memory.
    let batch_size = rayon::current_num_threads().max(1);
    for (batch_index, path_batch) in paths.chunks(batch_size).enumerate() {
        let offset = batch_index * batch_size;
        let images: Vec<_> = path_batch
            .par_iter()
            .enumerate()
            .map(|(index, path)| {
                crop_image(image::open(path).unwrap(), coords_vec[offset + index].width)
            })
            .collect();

        for (index, img) in images.iter().enumerate() {
            let coords = &coords_vec[offset + index];
            image::imageops::replace(&mut imgbuf, img, coords.x as i64, coords.y as i64);
        }
    }

    let coord_writer = File::create("output/coords.json").unwrap();
    serde_json::to_writer_pretty(coord_writer, &coords_vec).unwrap();

    imgbuf
}

fn save_subimages(
    imgbuf: &ImageBuffer<Rgba<u8>, Vec<u8>>,
    img_width: u32,
    img_height: u32,
    divisions: u32,
) {
    let encoder_jobs = std::env::var("COLLAGE_ENCODER_JOBS")
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
            config.quality = 25.0;
            config.thread_level = 1;
            let encoded =
                WebPEncoder::from_rgba(subimgbuf.as_raw(), subimgbuf.width(), subimgbuf.height())
                    .encode_advanced(&config)
                    .expect("failed to encode WebP subimage");
            let mut writer = File::create(format!("output/collage-sub{}.webp", i)).unwrap();
            writer.write_all(&encoded).unwrap();
        });
    }
}

fn parse_json(path: &Path) -> Value {
    let reader = BufReader::new(File::open(path).unwrap());
    serde_json::from_reader(reader).expect("JSON was not well-formatted")
}

fn traverse_json(json: &Value, arr: &mut Vec<i32>, path_arr: &mut Vec<Vec<i32>>) {
    traverse_json_rec(json.as_object().unwrap(), 0, arr, path_arr, &mut Vec::new());
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

fn main() {
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
    let image = create_collage(image_path, 120, &depth_arr, &path_arr);
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
    println!("Time taken: {:.3}s", start.elapsed().as_secs_f64());
}
