//program to create a collage of images and export them in avif format along with a json file containing the image
// ids and their bounding boxes


use std::char::MAX;
use std::cmp::max;
use std::collections::HashMap;
use std::iter::Map;
use std::path::Iter;
use std::ptr::null;
use image::codecs::avif::AvifEncoder;
use serde_json::map::{IterMut, Values};
use serde_json::Value;
use walkdir::WalkDir;

struct  ImageCoords {
    // name: String,
    x: u32,
    y: u32,
    width: u32,
    // height: u32,
}

fn crop_image(img: image::DynamicImage, nwidth: u32)->image::DynamicImage{
    //if image is too small, scale it up, then crop
    let width = max(img.width(), img.height());
    let mut nimg = img.crop_imm(0, 0, width, width);
    if width != nwidth {
        nimg = img.resize_to_fill(nwidth, nwidth, image::imageops::FilterType::Nearest);
    }

    return nimg;
}

//create a collage of square images using image crate
fn create_collage(path: &str, width: u32, json: serde_json::Value) {
    let input_path = path;
    let base_width = width;

    let mut img_vec = vec![];
    let mut coords_vec = vec![];

    let layout_json = json.as_object().unwrap().into_iter();
    // traverse_json(layout_json, 0, "children");
    // get total number of files to determine final image dimensions
    let num_files = WalkDir::new(input_path).into_iter().count();

    let dimensions = (num_files as f64).sqrt() as u32;
    let mut total_width = 0;
    let mut i = 0;
    //iterate through all files in input and add them to the array, cropped to squares
    for entry in std::fs::read_dir(input_path).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        //determine image size based on json file
        // layout_json

        //crop image to square
        let mut img = image::open(path).unwrap();
        img = crop_image(img, base_width);
        // coords_vec.push(ImageCoords{
        //     // name: imgName.to_string(),
        //     x: total_width,
        //     y: 0,
        //     width: img.width(),
        //     // height: img.height(),
        // });
        total_width += img.width();
        img_vec.push(img);
        i+=1;
    }

    //get the size of the collage
    let imgx = base_width * dimensions;
    let imgy = base_width * dimensions;

    let mut imgbuf = image::ImageBuffer::new(imgx, imgy);
    println!("Image size: {}x{}", dimensions, dimensions);
    println!("Image Pixels: {}x{}", imgx, imgy);

    //iterate through the array and paste the images on the collage
    for (i, img) in img_vec.iter().enumerate() {
        let x = (i as u32 % dimensions as u32) * img.width();
        let y = (i as u32 / dimensions as u32) * img.height();
        image::imageops::overlay(&mut imgbuf, img, x as i64, y as i64);

        coords_vec.push(ImageCoords{
            // name: imgName.to_string(),
            x: x,
            y: y,
            width: img.width(),
            // height: img.height(),
        });
    }

    // imgbuf.save_with_format("output/collage.webp", image::ImageFormat::WebP).unwrap();

    //avif format
    let mut writer = std::fs::File::create("output/collage.avif").unwrap();
    let encoder = AvifEncoder::new_with_speed_quality(&mut writer, 1, 25);
    imgbuf.write_with_encoder(encoder);


    //debugging
    let coord_writer = std::fs::File::create("output/coords.json").unwrap();
    // serde_json::to_writer_pretty(coord_writer, &coords_vec.to).unwrap();
    // for i in coords_vec.iter() {
    //     println!("{} {} {}", i.x, i.y, i.width);
    // }
}

fn parse_json() -> serde_json::Value{
    let file = std::fs::read_to_string("input/grid.json").unwrap();
    return serde_json::from_str(&*file).expect("JSON was not well-formatted");

}


fn traverse_json(json: Value, arr: &mut Vec<&String>) -> i32{
    return traverse_json_rec(json.as_object().unwrap(), 0, arr);
}

//recursively decent through all 4 branches of the json file to find the depth of the tree
fn traverse_json_rec(json: &serde_json::map::Map<String, Value>, depth: i32, arr: &mut Vec<&String>) -> i32 {
    let mut max_depth = depth;
    json.into_iter().for_each(|(key, value)| {
        //base case
        arr.push(key);

        if key == "" {
            // arr.push(depth);
        }

        max_depth = max(traverse_json_rec(value.as_object().unwrap(), depth + 1, arr), max_depth);
    });

    return max_depth;
}


fn main() {
    // let start = std::time::Instant::now();
    let mut arr: Vec<&String> = vec![];
    let json = parse_json();
    // let j = json.as_;
    // println!("{}", j.v);
    let x = traverse_json(json, &mut arr);
    for v in arr {
        println!("{}", v);
    }

    // create_collage("input/10k", 100, json);
    // println!("Time taken: {}s", start.elapsed().as_secs());

}


