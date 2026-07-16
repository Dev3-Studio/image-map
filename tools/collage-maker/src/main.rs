use collage_maker::{
    layout_from_grid, publish_local, regular_grid_layout, LocalPublication,
    DEFAULT_IIIF_JPEG_QUALITY, DEFAULT_IIIF_TILE_SIZE, DEFAULT_PREVIEW_MAX_EDGE,
};
use serde_json::Value;
use std::env;
use std::fs::File;
use std::io::BufReader;
use std::path::{Path, PathBuf};

fn image_paths(path: &Path) -> Vec<PathBuf> {
    let mut paths: Vec<_> = std::fs::read_dir(path)
        .unwrap_or_else(|error| panic!("could not read {}: {error}", path.display()))
        .map(|entry| entry.unwrap().path())
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .is_some_and(|extension| {
                        matches!(
                            extension.to_ascii_lowercase().as_str(),
                            "avif" | "jpeg" | "jpg" | "png" | "webp"
                        )
                    })
        })
        .collect();
    paths.sort_unstable();
    paths
}

fn option_value(args: &[String], name: &str) -> Option<String> {
    args.windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| pair[1].clone())
}

fn parse_json(path: &Path) -> Value {
    let reader = BufReader::new(
        File::open(path)
            .unwrap_or_else(|error| panic!("could not open {}: {error}", path.display())),
    );
    serde_json::from_reader(reader)
        .unwrap_or_else(|error| panic!("could not parse {}: {error}", path.display()))
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
    let columns = option_value(args, "--columns")
        .map(|value| value.parse().expect("--columns must be an integer"))
        .unwrap_or(3);
    let tile_size = option_value(args, "--tile-size")
        .map(|value| value.parse().expect("--tile-size must be an integer"))
        .unwrap_or(DEFAULT_IIIF_TILE_SIZE);
    let jpeg_quality = option_value(args, "--jpeg-quality")
        .map(|value| value.parse().expect("--jpeg-quality must be an integer"))
        .unwrap_or(DEFAULT_IIIF_JPEG_QUALITY);
    let preview_max_edge = option_value(args, "--preview-max-edge")
        .map(|value| {
            value
                .parse()
                .expect("--preview-max-edge must be an integer")
        })
        .unwrap_or(DEFAULT_PREVIEW_MAX_EDGE);
    let paths = image_paths(&images);
    let layout = regular_grid_layout(paths.len(), canvas_width, columns, preview_max_edge)
        .expect("could not create grid layout");
    let preview_output = PathBuf::from(
        option_value(args, "--preview-output").unwrap_or_else(|| "output/collage.webp".into()),
    );
    let coords_output = option_value(args, "--coords-output").map(PathBuf::from);

    publish_local(
        &paths,
        &layout,
        &LocalPublication {
            iiif_output: &output,
            preview_output: &preview_output,
            coords_output: coords_output.as_deref(),
            public_iiif_base_url: &public_base_url,
            tile_size,
            jpeg_quality,
            label: "Tessera deep-zoom showcase",
        },
    )
    .expect("could not publish grid");
}

fn run_collage() {
    let image_directory = Path::new("input/10k");
    let grid_path = Path::new("input/grid.json");
    let paths = image_paths(image_directory);
    let grid = parse_json(grid_path);
    let layout = layout_from_grid(&grid, 120, DEFAULT_PREVIEW_MAX_EDGE)
        .expect("could not create collage layout");
    let public_base_url = env::var("IIIF_PUBLIC_BASE_URL").unwrap_or_else(|_| "/iiif".into());

    publish_local(
        &paths,
        &layout,
        &LocalPublication {
            iiif_output: Path::new("output/iiif"),
            preview_output: Path::new("output/collage.webp"),
            coords_output: Some(Path::new("output/coords.json")),
            public_iiif_base_url: &public_base_url,
            tile_size: DEFAULT_IIIF_TILE_SIZE,
            jpeg_quality: DEFAULT_IIIF_JPEG_QUALITY,
            label: "Tessera image map",
        },
    )
    .expect("could not publish collage");
}

fn main() {
    let args: Vec<_> = env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("publish-grid") {
        run_publish_grid(&args[1..]);
    } else {
        run_collage();
    }
}
