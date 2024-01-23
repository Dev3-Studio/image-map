//program to create a collage of images and export them in webp format along with a json file containing the image
// names and their bounding boxes

// use webp::{Encoder, PixelLayout, WebPImage, WebPMemory};
// use std::io::Cursor;
use image::GenericImageView;
use walkdir::WalkDir;
// use image::io::Reader as ImageReader;
struct  ImageCoords {
    // name: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

//create a collage of square images using image crate
fn create_collage(){
    let input_path = "input";

    let mut img_vec = vec![];
    let mut coords_vec = vec![];
    let mut total_width = 0;

    // get total number of files to determine final image dimensions
    let num_files = WalkDir::new(input_path).into_iter().count();

    let mut dimensions = (num_files as f64).sqrt();
    if dimensions.fract() != 0.0 {
        dimensions = dimensions.ceil();
    }


    //iterate through all files in input and add them to the array
    for entry in std::fs::read_dir(input_path).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        // let imgName = path.file_name().unwrap().to_str().unwrap()
        let img = image::open(path).unwrap();
        coords_vec.push(ImageCoords{
            // name: imgName.to_string(),
            x: total_width,
            y: 0,
            width: img.width(),
            height: img.height(),
        });
        total_width += img.width();
        img_vec.push(img);
    }



    //get the size of the collage
    let imgx = total_width / dimensions as u32;
    let imgy = total_width / dimensions as u32;

    let mut imgbuf = image::ImageBuffer::new(imgx, imgy);
    println!("Image size: {}x{}", dimensions, dimensions);
    println!("Image Pixels: {}x{}", imgx, imgy);

    //iterate through the array and paste the images on the collage
    for (i, img) in img_vec.iter().enumerate() {
        let x = (i as u32 % dimensions as u32) * img.width();
        let y = (i as u32 / dimensions as u32) * img.height();
        image::imageops::overlay(&mut imgbuf, img, x as i64, y as i64);
    }

    imgbuf.save("output/collage.png").unwrap();
    for i in coords_vec.iter() {
        println!("{} {} {} {}", i.x, i.y, i.width, i.height);
    }
}


fn main() {
    create_collage();
}


