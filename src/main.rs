//program to create a collage of images and export them in avif format along with a json file containing the image
// ids and their bounding boxes

use std::cmp::max;
use image::codecs::avif::AvifEncoder;
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
fn create_collage(path: &str, width: u32, depth_arr: Vec<i32>, path_arr: Vec<Vec<i32>>) {
    let input_path = path;
    let base_width = width;

    let mut img_vec = vec![];
    let mut coords_vec = vec![];

    // get total number of files to determine final image dimensions
    let num_files = WalkDir::new(input_path).into_iter().count();

    //todo: calculate actual dimensions
    // let dimensions = ((num_files) as f64).sqrt() as u32;
    let dimensions = 256;
    let mut total_width = 0;
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


    //avif format
    let mut writer = std::fs::File::create("output/collage.avif").unwrap();
    let encoder = AvifEncoder::new_with_speed_quality(&mut writer, 1, 25); //quality 25 is good compromise
    imgbuf.write_with_encoder(encoder).expect("TODO: panic message");


    //debugging
    let coord_writer = std::fs::File::create("output/coords.json").unwrap();
    // serde_json::to_writer_pretty(coord_writer, &coords_vec.to).unwrap();
    // for i in coords_vec.iter() {
    //     println!("{} {} {}", i.x, i.y, i.width);
    // }
}

fn parse_json() -> serde_json::Value{
    let file = std::fs::read_to_string("./input/grid.json").unwrap();
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
            // println!("{:?}" , current_path);
            for el in current_path.into_iter() {
                path_arr[*index as usize].push(*el);
            }
            path_arr[*index as usize].push(key.parse::<i32>().unwrap());
            *index += 1;
            return;
        }
        // let mut new_current_path =
        traverse_json_rec(value.as_object().unwrap(), depth + 1, arr, path_arr, index, &mut current_path.clone(), key.parse::<i32>().unwrap());
    });
    return 0;
}


//calculate the coordinates for the top left corner of each image
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

fn main() {
    let start = std::time::Instant::now();
    let mut depth_arr: Vec<i32> = vec![];
    let mut path_arr: Vec<Vec<i32>> = vec![];
    for _ in 0..10000 {
        path_arr.push(vec![]);
    }
    let json = parse_json();
    // let j = json.as_;
    // println!("{}", j.v);
    let _x = traverse_json(json, &mut depth_arr, &mut path_arr);

    create_collage("input/10k", 30, depth_arr, path_arr);
    println!("Time taken: {}s", start.elapsed().as_secs());

    // for i in path_arr.iter() {
    //     let (x, y) = calculate_coords(i, 256*50);
    //     println!("{} {}", x, y);
    // }

}


