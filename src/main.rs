//program to create a collage of images and export them in webp format along with a json file containing the image
// names and their bounding boxes

use std::cmp::max;
use image::codecs::avif::AvifEncoder;
// use image::codecs::avif::AvifEncoder;
use image::codecs::jpeg::JpegEncoder;
use image::codecs::webp::{WebPEncoder, WebPQuality};
// use image::ImageFormat::Avif;
// use webp::{Encoder, PixelLayout, WebPImage, WebPMemory};
// use std::io::Cursor;
// use image::GenericImageView;
use walkdir::WalkDir;
// use image::io::Reader as ImageReader;
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
fn create_collage(){
    let input_path = "input/10k";
    let img_width = 100;

    let mut img_vec = vec![];
    let mut coords_vec = vec![];


    // get total number of files to determine final image dimensions
    let num_files = WalkDir::new(input_path).into_iter().count();

    let dimensions = (num_files as f64).sqrt() as u32;
    let mut total_width = 0;
    // let mut j = 0;
    //iterate through all files in input and add them to the array, cropped to squares
    for entry in std::fs::read_dir(input_path).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        // let imgName = path.file_name().unwrap().to_str().unwrap()
        //crop image to square
        let mut img = image::open(path).unwrap();
        img = crop_image(img, img_width);
        // coords_vec.push(ImageCoords{
        //     // name: imgName.to_string(),
        //     x: total_width,
        //     y: 0,
        //     width: img.width(),
        //     // height: img.height(),
        // });
        total_width += img.width();
        img_vec.push(img);
    }

    //get the size of the collage
    let imgx = img_width * dimensions;
    let imgy = img_width * dimensions;

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



    // for i in coords_vec.iter() {
    //     println!("{} {} {}", i.x, i.y, i.width);
    // }
}


fn main() {
    let start = std::time::Instant::now();
    create_collage();
    println!("Time taken: {}s", start.elapsed().as_secs());
}


