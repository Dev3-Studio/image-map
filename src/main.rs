//program to create a collage of images and export them in webp format along with a json file containing the image
//coordinates in the collage

use std::cmp::max;
use image::codecs::avif::AvifEncoder;
use serde::{Serialize, Serializer};
use serde::ser::SerializeStruct;
use image::codecs::webp::{WebPEncoder, WebPQuality};
use image::{GenericImage, GenericImageView, ImageBuffer, Rgba};
use serde_json::Value;
use walkdir::WalkDir;

struct  ImageCoords {
    x: u32,
    y: u32,
    width: u32,
}

impl Serialize for ImageCoords{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("ImageCoords", 3)?;
        state.serialize_field("x", &self.x)?;
        state.serialize_field("y", &self.y)?;
        state.serialize_field("width", &self.width)?;
        state.end()
    }
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
fn create_collage(path: &str, width: u32, depth_arr: Vec<i32>, path_arr: Vec<Vec<i32>>) {
    let input_path = path;
    let base_width = width;

    let mut img_vec = vec![];
    let mut coords_vec = vec![];


    let dimensions = 2u32.pow((max_depth(&depth_arr)+1) as u32);
    let mut i = 0;
    //iterate through all files in input and add them to the array, cropped to squares
    for entry in std::fs::read_dir(input_path).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        //determine image size based on depth array
        let depth = depth_arr[i as usize];

        //crop image to square
        let mut img = image::open(path).unwrap();
        img = crop_image(img, base_width* (2u32).pow((7 - depth) as u32));
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
        let (x, y) = calculate_coords(&path_arr[i], imgx as i32);
        image::imageops::overlay(&mut imgbuf, img, x as i64, y as i64);
        // println!("{}", i);
        coords_vec.push(ImageCoords{
            // name: imgName.to_string(),
            x: x as u32,
            y: y as u32,
            width: img.width(),
        });
    }

    save_image(imgbuf, imgx, imgy, "output/collage.webp");


    //write the coords file
    let coord_writer = std::fs::File::create("output/coords.json").unwrap();
    serde_json::to_writer_pretty(coord_writer, &coords_vec).unwrap();

}

fn save_image(imgbuf: ImageBuffer<Rgba<u8>, Vec<u8>>, img_width: u32, img_height: u32, path: &str) {
    //webp format
    // let mut writer = std::fs::File::create("output/collage3.webp").unwrap();
    // // let encoder = AvifEncoder::new_with_speed_quality(&mut writer, 1, 25); //quality 25 is good compromise
    // let encoder = WebPEncoder::new_with_quality(&mut writer, WebPQuality::lossy(5));
    // imgbuf.write_with_encoder(encoder).expect("TODO: panic message");

    //create 9 subimages and render individually
    for i in 0..9 {
        let mut subimgbuf = image::ImageBuffer::new(img_width /3, img_height /3);
        let x = (i % 3) * (img_width /3) as i32;
        let y = (i / 3) * (img_height /3) as i32;
        subimgbuf = imgbuf.view(x as u32, y as u32, img_width /3, img_height /3).to_image();
        let mut writer = std::fs::File::create(format!("output/collage-sub{}.webp", i)).unwrap();
        let encoder = WebPEncoder::new_with_quality(&mut writer, WebPQuality::lossy(25));
        subimgbuf.write_with_encoder(encoder).expect("TODO: panic message");
    }
}

fn replace_image(img: image::DynamicImage, coords: ImageCoords, collage: ImageBuffer<Rgba<u8>, Vec<u8>>) {
    let mut imgbuf = collage;
    image::imageops::overlay(&mut imgbuf, &img, coords.x as i64, coords.y as i64);
    let imgx = imgbuf.width();
    let imgy = imgbuf.height();

    save_image(imgbuf, imgx, imgy, "output/collage.webp");
}

fn parse_json(path: &str) -> serde_json::Value{
    let file = std::fs::read_to_string(path).unwrap();
    return serde_json::from_str(&*file).expect("JSON was not well-formatted");
}


fn traverse_json(json: Value, arr: &mut Vec<i32>, path_arr: &mut Vec<Vec<i32>>) -> i32{
    let mut i = 0;
    let mut current_path = vec![];
    return traverse_json_rec(json.as_object().unwrap(), 0, arr, path_arr, &mut i, &mut current_path, 0);
}

//recursively decent through all 4 branches of the json file to find the depth of the tree
fn traverse_json_rec(json: &serde_json::map::Map<String, Value>, depth: i32, arr: &mut Vec<i32>, path_arr: &mut Vec<Vec<i32>>, index: &mut i32, current_path: &mut Vec<i32>, branch: i32) -> i32 {
    if branch != 0 { current_path.push(branch);}

    json.into_iter().for_each(|(key, value)| {
        //base case
        if value == &Value::Null {
            arr.push(depth);

            for el in current_path.into_iter() {
                path_arr[*index as usize].push(*el);
            }
            path_arr[*index as usize].push(key.parse::<i32>().unwrap());
            *index += 1;
            return;
        }
        traverse_json_rec(value.as_object().unwrap(), depth + 1, arr, path_arr, index, &mut current_path.clone(), key.parse::<i32>().unwrap());
    });
    return 0;
}


//calculate the coordinates for the top left corner of an image
fn calculate_coords(path_arr: &Vec<i32>, image_width: i32) -> (i32, i32) {
    let mut x = 0;
    let mut y = 0;
    let mut i = 1;
    for num in path_arr.iter() {
        match num {
            1 => {},
            2 => x += image_width /2i32.pow(i),
            3 => y += image_width /2i32.pow(i),
            4 => {
                x += image_width /2i32.pow(i);
                y += image_width /2i32.pow(i);
            },
            _ => {}
        }
        i += 1;
    }
    return (x, y);
}

fn max_depth(arr: &Vec<i32>) -> i32 {
    let mut max = 0;
    for i in arr.iter() {
        if *i > max {
            max = *i;
        }
    }
    return max;
}
fn main() {
    let image_path = "input/10k";
    let json_path = "input/grid.json";
    let num_files = WalkDir::new(image_path).into_iter().count();

    let start = std::time::Instant::now();
    let mut depth_arr: Vec<i32> = vec![];
    let mut path_arr: Vec<Vec<i32>> = vec![];
    for _ in 0..num_files {
        path_arr.push(vec![]);
    }
    let json = parse_json(json_path);
    let _x = traverse_json(json, &mut depth_arr, &mut path_arr);

    create_collage(image_path, 120, depth_arr, path_arr);
    println!("Time taken: {}s", start.elapsed().as_secs());

}


